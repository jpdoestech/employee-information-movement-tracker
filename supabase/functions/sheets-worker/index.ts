import { createClient } from "npm:@supabase/supabase-js@2";
import { accessToken, google } from "../_shared/google.ts";
import {
  replacementRequests,
  sharingApproved,
  snapshotTabs,
} from "../_shared/sync.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
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
  const job = await rpc("claim");
  if (!job) return Response.json({ idle: true });
  const deadline = Date.now() + 110000;
  let current: string | undefined;
  let suspended = false;
  async function fence() {
    if (Date.now() > deadline) throw new Error("Bounded worker time elapsed");
    if (!(await rpc("heartbeat", { token: job.token })).valid)
      throw new Error("Lease expired");
  }
  try {
    const connection = await rpc("connection");
    if (!connection) throw new Error("Google account is not connected");
    const token = await accessToken(connection.encrypted_refresh_token);
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
      current = book.id;
      suspended = false;
      await fence();
      if (
        book.approved &&
        book.spreadsheet_id &&
        book.last_synced_revision >= job.revision
      )
        continue;
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
      const permissions = await google(
        `https://www.googleapis.com/drive/v3/files/${sheet}/permissions?fields=permissions(type,role,emailAddress)`,
        token,
      );
      if (
        !sharingApproved(permissions.permissions || [], book.sharing_emails)
      ) {
        suspended = true;
        await rpc("book_status", { id: book.id, status: "Suspended" });
        throw new Error("Workbook sharing exceeds approval");
      }
      const snapshot = await rpc("snapshot", { id: book.id });
      let meta = await google(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet}?fields=sheets(properties)`,
        token,
      );
      const missing = [
        "Employees_Current",
        "Assignments_Current",
        "Movement_History",
        "Sync_Metadata",
      ].filter(
        (title) => !meta.sheets.some((s: any) => s.properties.title === title),
      );
      if (missing.length) {
        await google(
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
        meta = await google(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheet}?fields=sheets(properties)`,
          token,
        );
      }
      await fence();
      // Recheck current approval after external reads, immediately before projection write.
      const latest = (await rpc("workbooks")).find(
        (b: any) => b.id === book.id,
      );
      if (!latest?.approved || latest.row_version !== book.row_version)
        throw new Error("Workbook policy changed during sync");
      await google(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet}:batchUpdate`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requests: replacementRequests(snapshotTabs(snapshot), meta.sheets),
          }),
        },
      );
      await google(
        `https://www.googleapis.com/drive/v3/files/${sheet}`,
        token,
        { method: "PATCH", body: JSON.stringify({ name: book.name }) },
      );
      await rpc("book_status", {
        id: book.id,
        status: "Synced",
        revision: snapshot.revision,
      });
    }
    await rpc("complete", { token: job.token });
    return Response.json({ synced: true });
  } catch {
    if (current && !suspended)
      await rpc("book_status", { id: current, status: "Failed" }).catch(
        () => {},
      );
    await rpc("retry", { token: job.token }).catch(() => {});
    return Response.json({ retryScheduled: true }, { status: 503 });
  }
});
