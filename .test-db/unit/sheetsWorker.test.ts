import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
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
function worker(failure: "network" | "sharing" | "none") {
  const calls: { operation?: string; p?: any; url?: string }[] = [];
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
    Deno: {
      env: { get: () => "synthetic" },
      serve: (fn: typeof serve) => {
        serve = fn;
      },
    },
    createClient: () => ({
      rpc: async (_name: string, { operation, p }: any) => {
        calls.push({ operation, p });
        const data =
          operation === "claim"
            ? {
                token: "synthetic",
                revision: 1,
                branch_routes: ["bad", "healthy"],
              }
            : operation === "connection"
              ? { folder_id: "synthetic", encrypted_refresh_token: "synthetic" }
              : operation === "workbooks"
                ? books
                : operation === "heartbeat"
                  ? { valid: true }
                  : operation === "snapshot"
                    ? {
                        fields: [],
                        rows: [],
                        assignments: [],
                        movements: [],
                        revision: 2,
                      }
                    : {};
        if (operation === "book_status" && p.status === "Synced")
          books.find((book) => book.id === p.id)!.last_synced_revision =
            p.revision;
        return { data, error: null };
      },
    }),
    accessToken: async () => "synthetic",
    google: async (url: string) => {
      calls.push({ url });
      if (url.includes("/bad/") && failure === "network")
        throw Error("Synthetic Google failure");
      if (url.includes("/permissions"))
        return {
          permissions:
            url.includes("/bad/") && failure === "sharing"
              ? [{ type: "anyone", role: "reader" }]
              : [],
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
  });
  return {
    calls,
    run: () =>
      serve(
        new Request("https://synthetic.local", {
          method: "POST",
          headers: { "x-worker-secret": "synthetic" },
        }),
      ),
  };
}
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
  ).toHaveLength(1);
  await w.run();
  expect(
    w.calls.filter((c) => c.url?.includes("/healthy:batchUpdate")),
  ).toHaveLength(1);
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
        c.p.status === "Suspended",
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
