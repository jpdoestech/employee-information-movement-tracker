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
  const updateUserById = vi.fn(async (id: string, attributes: any) => {
    const previous = users.get(id);
    const user = {
      ...previous,
      ...attributes,
      app_metadata: { ...previous.app_metadata, ...attributes.app_metadata },
    };
    users.set(id, user);
    return { data: { user }, error: null };
  });
  const receipts = new Map<string, any>();
  const receipt = vi.fn(async (_name: string, p: any) => {
    const key = `${p.p_actor}:${p.p_request}`;
    const previous = receipts.get(key);
    const payload = JSON.stringify([p.p_target, p.p_reason, p.p_fingerprint]);
    if (previous && previous !== payload)
      return { data: null, error: { code: "40001" } };
    if (p.p_complete) receipts.set(key, payload);
    return { data: { completed: p.p_complete || !!previous }, error: null };
  });
  const single = vi.fn(async () => ({ data: { role, active }, error: null }));
  const admin = {
    auth: { getUser, admin: { getUserById, createUser, updateUserById } },
    rpc: receipt,
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
  return {
    invoke,
    users,
    getUser,
    getUserById,
    createUser,
    updateUserById,
    receipt,
    single,
    rpc,
  };
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

const passwordRequest = {
  action: "set_password",
  user_id: payload.request_id,
  request_id: "30000000-0000-4000-8000-000000000003",
  password: "Replacement-synthetic-password-123!",
  reason: "Restore synthetic account access",
};
describe("trusted password changes", () => {
  it("rejects non-superadmins, inactive administrators and malformed requests before any Auth update", async () => {
    for (const [role, active] of [
      ["admin", true],
      ["viewer", true],
      ["superadmin", false],
    ] as const) {
      const s = setup(role, active);
      expect((await s.invoke(passwordRequest)).status).toBe(403);
      expect(s.updateUserById).not.toHaveBeenCalled();
    }
    const s = setup();
    for (const change of [
      { user_id: "invalid" },
      { password: "short" },
      { reason: "" },
      { request_id: "bad" },
      { action: "unknown" },
    ])
      expect((await s.invoke({ ...passwordRequest, ...change })).status).toBe(
        400,
      );
    expect(s.updateUserById).not.toHaveBeenCalled();
  });
  it("sets only the password and retry marker, records success, and never replays an older completed password change", async () => {
    const s = setup();
    await s.invoke();
    const oldMetadata = s.users.get(payload.request_id).app_metadata;
    const result = await s.invoke(passwordRequest);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ id: payload.request_id });
    expect(s.updateUserById).toHaveBeenCalledWith(payload.request_id, {
      password: passwordRequest.password,
      app_metadata: {
        eimt_password_change: expect.objectContaining({
          request_id: passwordRequest.request_id,
          actor,
        }),
      },
    });
    expect(
      s.users.get(payload.request_id).app_metadata.eimt_provisioning,
    ).toEqual(oldMetadata.eimt_provisioning);
    expect(
      JSON.stringify(s.users.get(payload.request_id).app_metadata),
    ).not.toContain(passwordRequest.password);
    expect(s.rpc).toHaveBeenCalledTimes(1);
    await s.invoke({
      ...passwordRequest,
      request_id: "40000000-0000-4000-8000-000000000004",
      password: "Later-synthetic-password-456!",
    });
    expect((await s.invoke(passwordRequest)).status).toBe(200);
    expect(s.updateUserById).toHaveBeenCalledTimes(2);
    expect(
      (
        await s.invoke({
          ...passwordRequest,
          password: "Altered-synthetic-password-789!",
        })
      ).status,
    ).toBe(409);
    expect(s.updateUserById).toHaveBeenCalledTimes(2);
  });
  it("reconciles an unfinished audit on explicit retry without resending the password", async () => {
    const s = setup();
    await s.invoke();
    const original = s.receipt.getMockImplementation()!;
    s.receipt
      .mockImplementationOnce(original)
      .mockResolvedValueOnce({ data: null, error: { code: "offline" } } as any);
    const first = await s.invoke(passwordRequest);
    expect(first.status).toBe(503);
    expect((await first.json()).code).toBe("password_audit_pending");
    expect(s.updateUserById).toHaveBeenCalledTimes(1);
    expect((await s.invoke(passwordRequest)).status).toBe(200);
    expect(s.updateUserById).toHaveBeenCalledTimes(1);
  });
  it("fails closed before Auth on receipt failures and redacts Auth rejection diagnostics without retrying", async () => {
    const s = setup();
    await s.invoke();
    s.receipt.mockResolvedValueOnce({
      data: null,
      error: { code: "42501" },
    } as any);
    expect((await s.invoke(passwordRequest)).status).toBe(409);
    expect(s.updateUserById).not.toHaveBeenCalled();
    s.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, message: "PRIVATE password diagnostic" },
    } as any);
    const failure = await s.invoke(passwordRequest);
    expect(failure.status).toBe(400);
    expect(await failure.text()).not.toContain("PRIVATE");
    expect(s.updateUserById).toHaveBeenCalledTimes(1);
  });
});
