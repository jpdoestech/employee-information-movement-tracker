import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), confirm: vi.fn() }));
vi.mock("../../src/demo", () => ({
  demoQuery: vi.fn(),
  demoMutate: vi.fn(),
  demoIdentityPreview: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ functions: { invoke: mocks.invoke } }),
}));
vi.mock("../../src/components/TransactionConfirmation", () => ({
  requireConfirmation: mocks.confirm,
}));
vi.mock("../../src/transactions", () => ({
  trackTransaction: (_label: string, fn: () => unknown) => fn(),
}));
const input = {
  email: "colleague@example.test",
  display_name: "New colleague",
  password: "Synthetic-password-123!",
  role: "viewer",
  reason: "Synthetic onboarding",
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
  vi.stubEnv("VITE_DEMO_MODE", "false");
  mocks.confirm.mockReset().mockResolvedValue(undefined);
  mocks.invoke.mockReset();
});
it("sends no write when shared confirmation is cancelled", async () => {
  mocks.confirm.mockRejectedValue(new Error(""));
  const { createAccount } = await import("../../src/api");
  await expect(createAccount(input)).rejects.toThrow();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it("preserves the request ID on explicit retry, returns backend errors, and never retries automatically", async () => {
  mocks.invoke.mockResolvedValueOnce({
    error: {
      context: new Response(JSON.stringify({ error: "Enrollment pending" })),
    },
  });
  mocks.invoke.mockResolvedValueOnce({ data: { id: "created" }, error: null });
  const { createAccount } = await import("../../src/api");
  await expect(createAccount(input)).rejects.toThrow("Enrollment pending");
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  const first = mocks.invoke.mock.calls[0][1].body;
  expect(first).toMatchObject(input);
  expect(first.request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await createAccount(input)).toEqual({ id: "created" });
  expect(mocks.invoke.mock.calls[1][1].body).toEqual(first);
  expect(mocks.confirm).toHaveBeenCalledTimes(2);
});
