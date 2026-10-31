import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), confirm: vi.fn() }));
vi.mock("../../src/demo", () => ({
  demoQuery: vi.fn(),
  demoMutate: vi.fn(),
  demoIdentityPreview: vi.fn(),
  demoImport: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("../../src/components/TransactionConfirmation", () => ({
  requireConfirmation: mocks.confirm,
}));
vi.mock("../../src/transactions", () => ({
  trackTransaction: (_label: string, fn: () => unknown) => fn(),
}));
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("VITE_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
  vi.stubEnv("VITE_DEMO_MODE", "false");
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: { deleted_employees: 2 }, error: null });
  mocks.confirm.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const payload = {
  token: "receipt",
  confirmation: "DELETE 2 EMPLOYEES",
  reason: "Synthetic cleanup",
};
it("sends no hard delete when shared confirmation is cancelled", async () => {
  const { mutate } = await import("../../src/api");
  mocks.confirm.mockRejectedValue(new Error(""));
  await expect(mutate("employee_purge", payload)).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("calls the dedicated hard delete RPC once after count-bound irreversible confirmation", async () => {
  const { mutate } = await import("../../src/api");
  await mutate("employee_purge", payload, "synthetic-request");
  expect(mocks.confirm).toHaveBeenCalledWith(
    "Permanently delete employee data",
    expect.stringContaining("DELETE 2 EMPLOYEES"),
  );
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("hard_delete_employees", {
    p: payload,
    request_id: "synthetic-request",
  });
});
it("uses the preview endpoint and does not automatically retry failed deletion", async () => {
  const { mutate, query } = await import("../../src/api");
  await query("preview_employee_purge", {
    scope_type: "head_office",
    scope_id: null,
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("preview_employee_purge", {
    q: { scope_type: "head_office", scope_id: null },
  });
  mocks.rpc
    .mockReset()
    .mockResolvedValue({
      data: null,
      error: { code: "40001", message: "Preview stale" },
    });
  await expect(mutate("employee_purge", payload)).rejects.toThrow(
    "Preview stale",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
