import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
import { syncWorkbook } from "../../supabase/functions/_shared/syncWorkbook";
import {
  replacementRequests,
  sharingApproved,
  snapshotTabs,
} from "../../supabase/functions/_shared/sync";
// Execute the real Edge handler with local transport stubs; never call Google.
const source = readFileSync(
  "supabase/functions/sheets-worker/index.ts",
  "utf8",
).replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function worker(
  failure:
    | "network"
    | "sharing"
    | "sharing-page"
    | "sharing-revoked"
    | "individual-sharing"
    | "schema"
    | "ownership"
    | "pending"
    | "budget"
    | "none",
  script = false,
  due = true,
) {
  const calls: { operation?: string; p?: any; url?: string }[] = [];
  const states = new Map<string, any>();
  let permissionReads = 0;
  const books = ["bad", "healthy"].map((id) => ({
    id,
    branch_id: id,
    approved: true,
    spreadsheet_id: id,
    last_synced_revision: 0,
    row_version: 1,
    sharing_emails: [],
  }));
  let serve!: (request: Request) => Promise<Response>;
  runInNewContext(compiled, {
    exports: {},
    Request,
    Response,
    Date,
    encodeURIComponent,
    Deno: {
      env: {
        get: (name: string) =>
          name === "GOOGLE_SYNC_MODE" && script ? "apps_script" : "synthetic",
      },
      serve: (fn: typeof serve) => {
        serve = fn;
      },
    },
    createClient: () => ({
      rpc: async (_name: string, { operation, p }: any) => {
        calls.push({ operation, p });
        if (operation === "publish_guard" && failure === "schema")
          return {
            data: null,
            error: { message: "Snapshot or export policy changed" },
          };
        const data =
          operation === "sync_due"
            ? due
            : operation === "claim"
              ? {
                  token: "synthetic",
                  revision: 1,
                  branch_routes: ["bad", "healthy"],
                  events: [
                    {
                      full: true,
                      revision: 1,
                      action: "reconcile",
                      branches: ["bad", "healthy"],
                      head_office: true,
                    },
                  ],
                }
              : operation === "connection"
                ? {
                    folder_id: "synthetic",
                    encrypted_refresh_token: "synthetic",
                    auth_mode: script ? "apps_script" : "oauth",
                    owner_permission_id: "original",
                  }
                : operation === "workbooks"
                  ? books
                  : operation === "heartbeat"
                    ? { valid: true }
                    : ["snapshot", "sync_snapshot", "sync_page"].includes(
                          operation,
                        )
                      ? {
                          fields: [],
                          rows: [],
                          assignments: [],
                          movements: [],
                          revision: 2,
                          schema_signature: "synthetic-schema",
                        }
                      : {};
        if (operation === "book_status" && p.status === "Synced")
          books.find((book) => book.id === p.id)!.last_synced_revision =
            p.revision;
        if (operation === "sync_state")
          return { data: states.get(p.id) || null, error: null };
        if (operation === "sync_begin")
          states.set(p.id, {
            schema_signature: "synthetic-schema",
            policy_version: 1,
            full_revision: 1,
            active: true,
            reset_pending: true,
            cursor: null,
            seen_ids: [],
          });
        if (operation === "sync_checkpoint")
          states.set(p.id, {
            ...states.get(p.id),
            active: !p.finish,
            reset_pending: false,
            cursor: p.cursor || null,
            seen_ids: [],
          });
        if (["sync_begin", "sync_checkpoint"].includes(operation))
          return { data: states.get(p.id), error: null };
        return { data, error: null };
      },
    }),
    accessToken: async () => {
      if (script) throw Error("Apps Script must not request an OAuth refresh");
      return "synthetic";
    },
    appsScriptIdentity: async (token: unknown) => {
      if (token !== "ephemeral") throw Error("Invalid Google token");
      return {
        owner_permission_id: "original",
        owner_email: "owner@example.test",
      };
    },
    google: async (url: string) => {
      calls.push({ url });
      if (url.includes("/bad/") && failure === "network")
        throw Error("Synthetic Google failure");
      if (url.includes("/permissions")) {
        permissionReads++;
        return {
          nextPageToken:
            failure === "sharing-page" && !url.includes("pageToken=")
              ? "next"
              : undefined,
          permissions:
            (url.includes("/bad/") && failure === "sharing") ||
            (failure === "sharing-revoked" && permissionReads > 1) ||
            (failure === "sharing-page" && url.includes("pageToken="))
              ? [{ type: "anyone", role: "reader" }]
              : failure === "individual-sharing"
                ? [
                    {
                      type: "user",
                      role: "reader",
                      emailAddress: "private@example.test",
                    },
                  ]
                : [],
        };
      }
      if (url.includes("?fields=mimeType"))
        return {
          mimeType: "application/vnd.google-apps.spreadsheet",
          owners: [
            { permissionId: failure === "ownership" ? "intruder" : "original" },
          ],
          appProperties: {},
        };
      if (url.includes("/values:batchGet?"))
        return {
          valueRanges: snapshotTabs({
            fields: [],
            rows: [],
            assignments: [],
            movements: [],
            revision: 1,
          })
            .slice(0, 3)
            .flatMap((tab) => [{ values: [tab.rows[0]] }, { values: [] }]),
        };
      return {
        sheets: [
          "Employees_Current",
          "Assignments_Current",
          "Movement_History",
          "Sync_Metadata",
        ].map((title, sheetId) => ({ properties: { title, sheetId } })),
      };
    },
    replacementRequests,
    sharingApproved,
    snapshotTabs,
    syncWorkbook:
      failure === "pending"
        ? async () => ({ pending: true })
        : failure === "budget"
          ? async (
              _book: any,
              _job: any,
              _sheet: any,
              token: string,
              _meta: any,
              _rpc: any,
              _fence: any,
              _deadline: any,
              request: any,
            ) => {
              for (let i = 0; i < 41; i++)
                await request(
                  "https://sheets.googleapis.com/v4/spreadsheets/synthetic/values:batchGetByDataFilter",
                  token,
                  { method: "POST", body: "{}" },
                );
              return { pending: false };
            }
          : syncWorkbook,
  });
  return {
    calls,
    run: (body?: unknown, secret = "synthetic") =>
      serve(
        new Request("https://synthetic.local", {
          method: "POST",
          headers: { "x-worker-secret": secret },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      ),
  };
}
it("never publishes an old snapshot after a schema change", async () => {
  const w = worker("schema");
  expect((await w.run()).status).toBe(503);
  expect(w.calls.some((c) => c.operation === "publish_guard")).toBe(true);
  expect(w.calls.some((c) => c.url?.includes(":batchUpdate"))).toBe(false);
  expect(w.calls.some((c) => c.operation === "complete")).toBe(false);
});
it("binds Apps Script before claiming work and never stores its access token", async () => {
  const w = worker("none", true);
  expect(
    (await w.run({ action: "connect", access_token: "ephemeral" })).status,
  ).toBe(200);
  expect(w.calls.some((c) => c.operation === "claim")).toBe(false);
  expect(w.calls.find((c) => c.operation === "bind_apps_script")?.p).toEqual({
    owner_permission_id: "original",
    owner_email: "owner@example.test",
  });
  expect(JSON.stringify(w.calls)).not.toContain("ephemeral");
});
it("idle timer runs skip Google authorization and do not claim a job", async () => {
  const w = worker("none", true, false);
  const response = await w.run({ action: "sync", access_token: "ephemeral" });
  expect(await response.json()).toEqual({ idle: true });
  expect(
    w.calls.some(
      (c) => c.url || c.operation === "claim" || c.operation === "connection",
    ),
  ).toBe(false);
});
it("a bounded rebuild defers its lease instead of retrying a write or completing early", async () => {
  const w = worker("pending", true);
  const response = await w.run({ action: "sync", access_token: "ephemeral" });
  expect(await response.json()).toEqual({ synced: true, pending: true });
  expect(w.calls.filter((c) => c.operation === "defer")).toHaveLength(1);
  expect(
    w.calls.some((c) => c.operation === "retry" || c.operation === "complete"),
  ).toBe(false);
  expect(
    w.calls.filter(
      (c) => c.operation === "book_status" && c.p.status === "Syncing",
    ),
  ).toHaveLength(2);
});
it("defers before exceeding its per-run Google request budget", async () => {
  const w = worker("budget", true);
  const response = await w.run({ action: "sync", access_token: "ephemeral" });
  expect(response.status).toBe(200);
  expect(
    w.calls.filter((c) => c.url?.startsWith("https://sheets.googleapis.com/")),
  ).toHaveLength(40);
  expect(w.calls.filter((c) => c.operation === "defer")).toHaveLength(1);
  expect(w.calls.some((c) => c.operation === "retry")).toBe(false);
});
it("rejects invalid Apps Script callers before a lease or projection write", async () => {
  const w = worker("none", true);
  expect(
    (await w.run({ action: "sync", access_token: "ephemeral" }, "wrong"))
      .status,
  ).toBe(401);
  expect((await w.run({ action: "sync", access_token: "wrong" })).status).toBe(
    400,
  );
  expect(
    (await w.run({ action: "unknown", access_token: "ephemeral" })).status,
  ).toBe(400);
  expect((await w.run()).status).toBe(400);
  expect(w.calls.some((c) => c.operation === "claim")).toBe(false);
  expect(w.calls.some((c) => c.url)).toBe(false);
});
it("uses the existing approved projection and lease path for Apps Script runs", async () => {
  const w = worker("none", true);
  expect(
    (await w.run({ action: "sync", access_token: "ephemeral" })).status,
  ).toBe(200);
  expect(w.calls.filter((c) => c.operation === "publish_guard")).toHaveLength(
    4,
  );
  expect(w.calls.filter((c) => c.operation === "complete")).toHaveLength(1);
});
it("syncs healthy branches after a failing workbook and avoids rewriting them on retry", async () => {
  const w = worker("network");
  expect((await w.run()).status).toBe(503);
  expect(
    w.calls.some(
      (c) =>
        c.operation === "book_status" &&
        c.p.id === "healthy" &&
        c.p.status === "Synced",
    ),
  ).toBe(true);
  expect(
    w.calls.filter((c) => c.url?.includes("/healthy:batchUpdate")),
  ).toHaveLength(2);
  await w.run();
  expect(
    w.calls.filter((c) => c.url?.includes("/healthy:batchUpdate")),
  ).toHaveLength(2);
  expect(w.calls.filter((c) => c.operation === "retry")).toHaveLength(2);
});
it("keeps unsafe workbooks suspended while continuing other branches", async () => {
  const w = worker("sharing");
  await w.run();
  expect(
    w.calls.some(
      (c) =>
        c.operation === "book_status" &&
        c.p.id === "bad" &&
        c.p.status === "Suspended" &&
        c.p.error_code === "unsafe_sharing",
    ),
  ).toBe(true);
  expect(
    w.calls.some(
      (c) =>
        c.operation === "book_status" &&
        c.p.id === "bad" &&
        c.p.status === "Failed",
    ),
  ).toBe(false);
  expect(
    w.calls.some(
      (c) =>
        c.operation === "book_status" &&
        c.p.id === "healthy" &&
        c.p.status === "Synced",
    ),
  ).toBe(true);
});
it("completes the lease only after successful synchronization", async () => {
  const w = worker("none");
  expect((await w.run()).status).toBe(200);
  expect(w.calls.filter((c) => c.operation === "complete")).toHaveLength(1);
  expect(w.calls.filter((c) => c.operation === "retry")).toHaveLength(0);
});
it("suspends spreadsheets owned by another account before publishing", async () => {
  const w = worker("ownership", true);
  expect(
    (await w.run({ action: "sync", access_token: "ephemeral" })).status,
  ).toBe(503);
  expect(w.calls.some((c) => c.url?.includes(":batchUpdate"))).toBe(false);
  expect(
    w.calls.filter(
      (c) =>
        c.operation === "book_status" &&
        c.p.status === "Suspended" &&
        c.p.error_code === "ownership_mismatch",
    ),
  ).toHaveLength(2);
});
it("preserves the titles of user-selected spreadsheets", async () => {
  const w = worker("none", true);
  await w.run({ action: "sync", access_token: "ephemeral" });
  expect(
    w.calls.some(
      (c) => c.url === "https://www.googleapis.com/drive/v3/files/healthy",
    ),
  ).toBe(false);
});
it("rechecks Drive access before publishing if sharing changes during external reads", async () => {
  const w = worker("sharing-revoked", true);
  expect(
    (await w.run({ action: "sync", access_token: "ephemeral" })).status,
  ).toBe(503);
  expect(w.calls.some((c) => c.url?.includes(":batchUpdate"))).toBe(false);
  expect(
    w.calls.some(
      (c) =>
        c.operation === "book_status" && c.p.error_code === "unsafe_sharing",
    ),
  ).toBe(true);
});
it("checks every sharing page on an existing spreadsheet before writing", async () => {
  const w = worker("sharing-page", true);
  await w.run({ action: "sync", access_token: "ephemeral" });
  expect(w.calls.some((c) => c.url?.includes("pageToken=next"))).toBe(true);
  expect(w.calls.some((c) => c.url?.includes(":batchUpdate"))).toBe(false);
  expect(
    w.calls.filter(
      (c) => c.operation === "book_status" && c.p.status === "Suspended",
    ),
  ).toHaveLength(2);
});
it("identifies unapproved individual sharing without storing private email addresses", async () => {
  const w = worker("individual-sharing", true);
  await w.run({ action: "sync", access_token: "ephemeral" });
  expect(
    w.calls.filter(
      (c) =>
        c.operation === "book_status" && c.p.error_code === "unapproved_user",
    ),
  ).toHaveLength(2);
  expect(JSON.stringify(w.calls)).not.toContain("private@example.test");
});
