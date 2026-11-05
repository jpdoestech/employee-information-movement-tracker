import { createClient } from "npm:@supabase/supabase-js@2";
import { accessToken, google } from "../_shared/google.ts";
import { appsScriptIdentity } from "../_shared/appsScript.ts";
import { sharingApproved } from "../_shared/sync.ts";
import { syncWorkbook } from "../_shared/syncWorkbook.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
class SyncBudgetReached extends Error {}
async function rpc(operation: string, p: unknown = {}) {
  const { data, error } = await admin.rpc("worker_command", { operation, p });
  if (error) throw error;
  return data;
}
Deno.serve(async (req) => {
  if (
    req.method !== "POST" ||
    !Deno.env.get("WORKER_SECRET") ||
    req.headers.get("x-worker-secret") !== Deno.env.get("WORKER_SECRET")
  )
    return new Response("Unauthorized", { status: 401 });
  let scriptToken: string | undefined;
  if (Deno.env.get("GOOGLE_SYNC_MODE") === "apps_script") {
    try {
      const body = await req.json();
      if (!["connect", "sync"].includes(body.action))
        throw new Error("Unknown Apps Script action");
      if (
        body.action === "sync" &&
        typeof body.access_token === "string" &&
        body.access_token &&
        (await rpc("sync_due")) === false
      )
        return Response.json({ idle: true });
      const connection = await rpc("connection");
      const identity = await appsScriptIdentity(body.access_token, connection);
      if (body.action === "connect") {
        await rpc("bind_apps_script", identity);
        return Response.json({ connected: true });
      }
      if (connection?.auth_mode !== "apps_script")
        throw new Error("Connect Apps Script before synchronizing");
      scriptToken = body.access_token;
    } catch {
      return Response.json(
        {
          error:
            "Apps Script authorization failed. Check setup and original account ownership.",
        },
        { status: 400 },
      );
    }
  }
  const job = await rpc("claim");
  if (!job) return Response.json({ idle: true });
  const deadline = Date.now() + 100000;
  let current: string | undefined;
  let suspended = false;
  let failed = false;
  let pending = false;
  let sheetReads = 0,
    sheetWrites = 0;
  async function request(url: string, token: string, init: RequestInit = {}) {
    if (url.startsWith("https://sheets.googleapis.com/")) {
      const read =
        !init.method ||
        init.method === "GET" ||
        url.includes("/values:batchGet");
      if (read ? sheetReads >= 40 : sheetWrites >= 40)
        throw new SyncBudgetReached();
      if (read) sheetReads++;
      else sheetWrites++;
    }
    return google(url, token, init);
  }
  async function fence() {
    if (Date.now() > deadline) throw new SyncBudgetReached();
    if (!(await rpc("heartbeat", { token: job.token })).valid)
      throw new Error("Lease expired");
  }
  try {
    const connection = await rpc("connection");
    if (!connection) throw new Error("Google account is not connected");
    const token =
      scriptToken || (await accessToken(connection.encrypted_refresh_token));
    let folder = connection.folder_id;
    if (!folder) {
      const found = await google(
        "https://www.googleapis.com/drive/v3/files?q=" +
          encodeURIComponent(
            "trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='eimt_root' and value='true' }",
          ) +
          "&fields=files(id)",
        token,
      );
      if (found.files.length > 1)
        throw new Error("Duplicate root folders require reconciliation");
      folder = found.files[0]?.id;
      if (!folder)
        folder = (
          await google("https://www.googleapis.com/drive/v3/files", token, {
            method: "POST",
            body: JSON.stringify({
              name: "Employee Tracker - Branch Workbooks",
              mimeType: "application/vnd.google-apps.folder",
              appProperties: { eimt_root: "true" },
            }),
          })
        ).id;
      await rpc("folder", { id: folder });
    }
    for (const book of await rpc("workbooks")) {
      if (
        book.branch_id
          ? !job.branch_routes.includes(book.branch_id)
          : !job.head_office_route
      )
        continue;
      if (
        job.batch_key &&
        book.completed_batch === job.batch_key &&
        Number(book.synced_policy_version) === Number(book.row_version)
      )
        continue;
      if (Date.now() > deadline - 25000) {
        pending = true;
        break;
      }
      current = book.id;
      suspended = false;
      try {
        await fence();
        if (!book.approved) {
          await rpc("book_status", { id: book.id, status: "Suspended" });
          continue;
        }
        let sheet = book.spreadsheet_id;
        if (!sheet) {
          const found = await google(
            "https://www.googleapis.com/drive/v3/files?q=" +
              encodeURIComponent(
                `trashed=false and appProperties has { key='eimt_scope' and value='${book.id}' }`,
              ) +
              "&fields=files(id)",
            token,
          );
          if (found.files.length > 1)
            throw new Error("Duplicate workbook requires reconciliation");
          sheet = found.files[0]?.id;
          if (!sheet) {
            sheet = (
              await google("https://www.googleapis.com/drive/v3/files", token, {
                method: "POST",
                body: JSON.stringify({
                  name: book.name,
                  mimeType: "application/vnd.google-apps.spreadsheet",
                  parents: [folder],
                  appProperties: { eimt_scope: book.id },
                }),
              })
            ).id;
          }
          await rpc("mapping", {
            id: book.id,
            spreadsheet_id: sheet,
            folder_id: folder,
          });
        }
        async function checkAccess() {
          const file = await google(
            `https://www.googleapis.com/drive/v3/files/${sheet}?fields=mimeType,trashed,owners(permissionId,emailAddress),appProperties`,
            token,
          );
          if (
            file.trashed ||
            file.mimeType !== "application/vnd.google-apps.spreadsheet" ||
            !file.owners?.some((owner: any) =>
              connection.owner_permission_id
                ? owner.permissionId === connection.owner_permission_id
                : owner.emailAddress === connection.owner_email,
            )
          ) {
            suspended = true;
            await rpc("book_status", {
              id: book.id,
              status: "Suspended",
              error_code: "ownership_mismatch",
            });
            throw new Error(
              "The connected Google account must own this spreadsheet",
            );
          }
          let pageToken: string | undefined;
          let approvedSharing = true;
          let sharingError = "unsafe_sharing";
          do {
            await fence();
            const permissions = await google(
              `https://www.googleapis.com/drive/v3/files/${sheet}/permissions?fields=permissions(type,role,emailAddress),nextPageToken&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
              token,
            );
            approvedSharing = sharingApproved(
              permissions.permissions || [],
              book.sharing_emails,
            );
            if (!approvedSharing) {
              const unapproved = permissions.permissions.find(
                (permission: any) =>
                  !sharingApproved([permission], book.sharing_emails),
              );
              sharingError =
                unapproved?.type === "user"
                  ? "unapproved_user"
                  : "unsafe_sharing";
            }
            pageToken = permissions.nextPageToken;
          } while (approvedSharing && pageToken);
          if (!approvedSharing) {
            suspended = true;
            await rpc("book_status", {
              id: book.id,
              status: "Suspended",
              error_code: sharingError,
            });
            throw new Error("Workbook sharing exceeds approval");
          }
          return file;
        }
        const file = await checkAccess();
        let meta = await request(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheet}?fields=sheets(properties)`,
          token,
        );
        const missing = [
          "Employees_Current",
          "Assignments_Current",
          "Movement_History",
          "Sync_Metadata",
        ].filter(
          (title) =>
            !meta.sheets.some((s: any) => s.properties.title === title),
        );
        if (missing.length) {
          await request(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheet}:batchUpdate`,
            token,
            {
              method: "POST",
              body: JSON.stringify({
                requests: missing.map((title) => ({
                  addSheet: {
                    properties: { title, hidden: title === "Sync_Metadata" },
                  },
                })),
              }),
            },
          );
          meta = await request(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheet}?fields=sheets(properties)`,
            token,
          );
        }
        const result = await syncWorkbook(
          book,
          job,
          sheet,
          token,
          meta,
          rpc,
          fence,
          deadline,
          request,
          async () => {
            await fence();
            await checkAccess();
            await fence();
          },
        );
        if (result.pending) {
          pending = true;
          await rpc("book_status", { id: book.id, status: "Syncing" });
          continue;
        }
        if (file.appProperties?.eimt_scope === book.id)
          await google(
            `https://www.googleapis.com/drive/v3/files/${sheet}`,
            token,
            { method: "PATCH", body: JSON.stringify({ name: book.name }) },
          );
        await rpc("book_status", {
          id: book.id,
          status: "Synced",
          revision: Math.max(
            Number(book.last_synced_revision || 0),
            Number(job.revision),
          ),
        });
        await rpc("sync_done", { ...result.guard, batch_key: job.batch_key });
      } catch (error) {
        if (error instanceof SyncBudgetReached) {
          pending = true;
          await rpc("book_status", { id: book.id, status: "Syncing" });
          break;
        }
        failed = true;
        if (!suspended)
          await rpc("book_status", { id: book.id, status: "Failed" }).catch(
            () => {},
          );
        if (Date.now() > deadline) break;
      }
    }
    if (failed) {
      await rpc("retry", { token: job.token });
      return Response.json({ retryScheduled: true }, { status: 503 });
    }
    await rpc(pending ? "defer" : "complete", { token: job.token });
    return Response.json({ synced: true, pending });
  } catch {
    if (current && !suspended)
      await rpc("book_status", { id: current, status: "Failed" }).catch(
        () => {},
      );
    await rpc("retry", { token: job.token }).catch(() => {});
    return Response.json({ retryScheduled: true }, { status: 503 });
  }
});
