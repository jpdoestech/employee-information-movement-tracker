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
const payload = {
  name: "My columns",
  config: { columns: ["name"], pinned: ["name"], filter: { sort: "name" } },
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("VITE_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
  vi.stubEnv("VITE_DEMO_MODE", "false");
  mocks.rpc
    .mockReset()
    .mockResolvedValue({ data: { id: "saved" }, error: null });
  mocks.confirm.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("confirms once and calls the atomic personal-view endpoint once", async () => {
  const { mutate } = await import("../../src/api");
  await mutate("personal_view", payload);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith("save_personal_view", {
    p: payload,
    request_id: expect.any(String),
  });
});
it("sends no write on cancellation and never retries a failed save automatically", async () => {
  const { mutate } = await import("../../src/api");
  mocks.confirm.mockRejectedValueOnce(new Error("Cancelled"));
  await expect(mutate("personal_view", payload)).rejects.toThrow("Cancelled");
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({
    error: { message: "Activation unavailable" },
  });
  await expect(mutate("personal_view", payload)).rejects.toThrow(
    "Activation unavailable",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  const request = mocks.rpc.mock.calls[0][1];
  await mutate("personal_view", payload);
  expect(mocks.rpc.mock.calls[1][1]).toEqual(request);
});
