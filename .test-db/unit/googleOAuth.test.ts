import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
const compiled = ts.transpileModule(
  readFileSync("supabase/functions/google-oauth/index.ts", "utf8").replace(
    /^import[\s\S]*?from\s+"[^"]+";\s*/gm,
    "",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
async function callback(owner: string) {
  const stored: any[] = [];
  let serve!: (request: Request) => Promise<Response>;
  runInNewContext(compiled, {
    exports: {},
    Request,
    Response,
    URL,
    URLSearchParams,
    TextEncoder,
    crypto,
    AbortSignal,
    Deno: {
      env: { get: () => "synthetic" },
      serve: (fn: typeof serve) => (serve = fn),
    },
    createClient: () => ({
      rpc: async (_: string, { operation, p }: any) => {
        if (operation === "store_connection") stored.push(p);
        return {
          data:
            operation === "connection" ? { folder_id: "legacy-folder" } : {},
          error: null,
        };
      },
    }),
    fetch: async () =>
      new Response(
        JSON.stringify({
          refresh_token: "synthetic-refresh",
          access_token: "synthetic-access",
        }),
      ),
    cryptToken: async () => "encrypted-synthetic-token",
    google: async (url: string) =>
      url.includes("/about")
        ? {
            user: {
              permissionId: "original-owner",
              emailAddress: "original@example.test",
            },
          }
        : { owners: [{ permissionId: owner }] },
  });
  const response = await serve(
    new Request(
      "https://synthetic.example.test/?state=synthetic&code=synthetic",
    ),
  );
  return { response, stored };
}
it("legacy reconnect binds the verified original folder owner and keeps tokens encrypted", async () => {
  const { response, stored } = await callback("original-owner");
  expect(response.status).toBe(200);
  expect(stored).toEqual([
    {
      encrypted_refresh_token: "encrypted-synthetic-token",
      owner_email: "original@example.test",
      owner_permission_id: "original-owner",
      verified_folder_id: "legacy-folder",
    },
  ]);
});
it("another legacy folder owner cannot replace the saved connection", async () => {
  const { response, stored } = await callback("another-owner");
  expect(response.status).toBe(400);
  expect(stored).toHaveLength(0);
  expect(await response.text()).not.toContain("synthetic-refresh");
});
