import { describe, it, expect, vi } from "vitest";
import { manageUsers } from "../../supabase/functions/manage-users/handler";
const origin = "https://tracker.example.test";
const actor = "10000000-0000-4000-8000-000000000001";
const payload = {
  request_id: "20000000-0000-4000-8000-000000000002",
  email: "new@example.test",
  display_name: "New colleague",
  password: "Synthetic-password-123!",
  role: "viewer",
  reason: "Synthetic onboarding",
};
function setup(role = "superadmin", active = true) {
  const users = new Map<string, any>();
  const getUser = vi.fn(async () => ({
    data: { user: { id: actor, app_metadata: { role: "superadmin" } } },
    error: null,
  }));
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: users.get(id) || null },
    error: users.has(id) ? null : { status: 404 },
  }));
  const createUser = vi.fn(async (attributes: any) => {
    const user = {
      id: attributes.id,
      email: attributes.email,
      app_metadata: attributes.app_metadata,
    };
    users.set(user.id, user);
    return { data: { user }, error: null };
  });
  const single = vi.fn(async () => ({ data: { role, active }, error: null }));
  const admin = {
    auth: { getUser, admin: { getUserById, createUser } },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
  };
  const rpc = vi.fn(async () => ({
    data: { id: payload.request_id },
    error: null,
  }));
  const invoke = (
    body: unknown = payload,
    options: { origin?: string; token?: string; method?: string } = {},
  ) =>
    manageUsers(
      new Request(origin + "/manage-users", {
        method: options.method || "POST",
        headers: {
          Origin: options.origin ?? origin,
          ...(options.token === ""
            ? {}
            : {
                Authorization:
                  "Bearer " + (options.token || "synthetic-caller-token"),
              }),
        },
        body: options.method === "OPTIONS" ? undefined : JSON.stringify(body),
      }),
      admin as any,
      { rpc } as any,
      origin,
      "synthetic-backend-fingerprint-key",
    );
  return { invoke, users, getUser, getUserById, createUser, single, rpc };
}
describe("trusted account provisioning", () => {
  it("rejects other origins, unauthenticated callers and invalid sessions before any write", async () => {
    const s = setup();
    expect(
      (await s.invoke(payload, { origin: "https://other.example.test" }))
        .status,
    ).toBe(403);
    expect((await s.invoke(payload, { token: "" })).status).toBe(401);
    s.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Expired" },
    } as any);
    expect((await s.invoke()).status).toBe(401);
    expect(s.createUser).not.toHaveBeenCalled();
    expect(s.rpc).not.toHaveBeenCalled();
  });
  for (const [role, active] of [
    ["admin", true],
    ["viewer", true],
    ["superadmin", false],
  ] as const)
    it(`denies ${role}, active=${active}, regardless of JWT metadata`, async () => {
      const s = setup(role, active);
      expect((await s.invoke()).status).toBe(403);
      expect(s.createUser).not.toHaveBeenCalled();
    });
  it("handles CORS without authentication and validates all input at the server boundary", async () => {
    const s = setup();
    expect((await s.invoke(undefined, { method: "OPTIONS" })).status).toBe(204);
    expect(s.getUser).not.toHaveBeenCalled();
    for (const change of [
      { role: "owner" },
      { email: "invalid" },
      { display_name: "" },
      { password: "short" },
      { reason: "" },
      { request_id: actor.replace("4000", "1000") },
    ])
      expect((await s.invoke({ ...payload, ...change })).status).toBe(400);
    expect(s.createUser).not.toHaveBeenCalled();
  });
  it("creates a confirmed sign-in account and enrolls only through the caller-authorized idempotent RPC", async () => {
    const s = setup();
    const response = await s.invoke({
      ...payload,
      email: " NEW@EXAMPLE.TEST ",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: payload.request_id });
    expect(s.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: payload.request_id,
        email: payload.email,
        password: payload.password,
        email_confirm: true,
      }),
    );
    expect(s.rpc).toHaveBeenCalledWith("tracker_mutate", {
      operation: "profile",
      p: {
        id: payload.request_id,
        display_name: payload.display_name,
        role: payload.role,
        active: true,
        reason: payload.reason,
      },
      request_id: payload.request_id,
    });
    expect(
      JSON.stringify(s.users.get(payload.request_id).app_metadata),
    ).not.toContain(payload.password);
  });
  it("does not create another account on an identical retry and rejects altered replay input", async () => {
    const s = setup();
    expect((await s.invoke()).status).toBe(200);
    expect((await s.invoke()).status).toBe(200);
    expect(s.createUser).toHaveBeenCalledTimes(1);
    expect(
      (await s.invoke({ ...payload, password: "Changed-password-456!" }))
        .status,
    ).toBe(409);
    expect(s.rpc).toHaveBeenCalledTimes(2);
  });
  it("keeps a failed enrollment fail-closed and resumes it only on an explicit identical request", async () => {
    const s = setup();
    s.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501" },
    } as any);
    const first = await s.invoke();
    expect(first.status).toBe(503);
    expect((await first.json()).code).toBe("enrollment_pending");
    expect(s.rpc).toHaveBeenCalledTimes(1);
    expect(s.createUser).toHaveBeenCalledTimes(1);
    expect((await s.invoke()).status).toBe(200);
    expect(s.createUser).toHaveBeenCalledTimes(1);
    expect(s.rpc).toHaveBeenCalledTimes(2);
  });
  it("never enrolls another request's existing identity", async () => {
    const s = setup();
    s.users.set(payload.request_id, {
      id: payload.request_id,
      app_metadata: {
        eimt_provisioning: { actor: "other", fingerprint: "other" },
      },
    });
    expect((await s.invoke()).status).toBe(409);
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("reads a concurrent identical creation without repeating the Auth write", async () => {
    const s = setup();
    s.createUser.mockImplementationOnce(async (attributes: any) => {
      s.users.set(attributes.id, {
        id: attributes.id,
        app_metadata: attributes.app_metadata,
      });
      return {
        data: { user: null },
        error: { status: 422, message: "Already exists" },
      } as any;
    });
    expect((await s.invoke()).status).toBe(200);
    expect(s.createUser).toHaveBeenCalledTimes(1);
    expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it("returns safe errors for upstream failures and never repeats a failed write", async () => {
    const s = setup();
    s.createUser.mockRejectedValueOnce(
      new Error("PRIVATE credential diagnostics"),
    );
    const response = await s.invoke();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE");
    expect(s.createUser).toHaveBeenCalledTimes(1);
    expect(s.rpc).not.toHaveBeenCalled();
  });
});
