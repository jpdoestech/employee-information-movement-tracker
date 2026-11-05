import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { appsScriptIdentity } from "../../supabase/functions/_shared/appsScript";

afterEach(() => vi.unstubAllGlobals());
function account(owner = "original") {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.includes("/about")
        ? { user: { permissionId: owner, emailAddress: "owner@example.test" } }
        : { owners: [{ permissionId: "original" }] },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("requires a token and binds the verified Google identity", async () => {
  const transport = account();
  await expect(appsScriptIdentity(undefined, null)).rejects.toThrow(
    "authorization",
  );
  expect(transport).not.toHaveBeenCalled();
  expect(await appsScriptIdentity("ephemeral", null)).toEqual({
    owner_permission_id: "original",
    owner_email: "owner@example.test",
    verified_folder_id: undefined,
  });
});
it("rejects account switches and verifies legacy folder ownership", async () => {
  account("intruder");
  await expect(
    appsScriptIdentity("ephemeral", { owner_permission_id: "original" }),
  ).rejects.toThrow("original Google account");
  await expect(
    appsScriptIdentity("ephemeral", { folder_id: "legacy" }),
  ).rejects.toThrow("original folder owner");
  account();
  expect(
    (await appsScriptIdentity("ephemeral", { folder_id: "legacy" }))
      .verified_folder_id,
  ).toBe("legacy");
});

function script(status = 200) {
  const triggers: any[] = [];
  const fetcher = vi.fn((_url, init) => ({
    getResponseCode: () => status,
    getContentText: () =>
      JSON.stringify(
        JSON.parse(init.payload).action === "connect"
          ? { connected: true }
          : { synced: true },
      ),
  }));
  const releaseLock = vi.fn();
  const env: any = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name: string) =>
          name === "TRACKER_WORKER_URL"
            ? "https://synthetic.supabase.co/functions/v1/sheets-worker"
            : "s".repeat(32),
      }),
    },
    UrlFetchApp: { fetch: fetcher },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        tryLock: () => true,
        releaseLock,
      }),
    },
    ScriptApp: {
      getOAuthToken: () => "ephemeral",
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (t: any) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (name: string) => ({
        timeBased: () => ({
          everyMinutes: (n: number) => ({
            create: () =>
              triggers.push({ getHandlerFunction: () => name, minutes: n }),
          }),
        }),
      }),
    },
  };
  runInNewContext(readFileSync("google-apps-script/Sync.gs", "utf8"), env);
  return { env, triggers, fetcher, releaseLock };
}
it("creates only one five-minute trigger, sends one ephemeral request, and stops cleanly", () => {
  const s = script();
  s.env.setupTrackerSync();
  s.env.setupTrackerSync();
  expect(s.triggers).toHaveLength(1);
  expect(s.triggers[0].minutes).toBe(5);
  s.env.syncTracker();
  expect(s.fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.parse(s.fetcher.mock.calls[2][1].payload)).toEqual({
    action: "sync",
    access_token: "ephemeral",
  });
  s.env.stopTrackerSync();
  expect(s.triggers).toHaveLength(0);
});
it("does not install a trigger after a failed connection or retry a failed write", () => {
  const s = script(503);
  expect(() => s.env.setupTrackerSync()).toThrow("503");
  expect(s.triggers).toHaveLength(0);
  expect(s.fetcher).toHaveBeenCalledTimes(1);
  expect(s.releaseLock).toHaveBeenCalledOnce();
});
