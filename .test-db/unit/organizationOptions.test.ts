import { afterEach, expect, it, vi } from "vitest";
import { demoQuery } from "../../src/demo";

vi.mock("../../src/demo", () => ({
  demoQuery: vi.fn(),
  demoMutate: vi.fn(),
  demoIdentityPreview: vi.fn(),
}));
afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("loads every authorized metadata page while keeping each request bounded", async () => {
  vi.stubEnv("VITE_DEMO_MODE", "true");
  const first = Array.from({ length: 100 }, (_, i) => ({
    id: `${i}`,
    label: `Branch ${i}`,
  }));
  const last = [{ id: "last", label: "Last branch" }];
  vi.mocked(demoQuery).mockResolvedValueOnce(first).mockResolvedValueOnce(last);
  const { organizationOptions } = await import("../../src/api");
  expect(await organizationOptions()).toEqual([...first, ...last]);
  expect(demoQuery).toHaveBeenNthCalledWith(1, "options", { offset: 0 });
  expect(demoQuery).toHaveBeenNthCalledWith(2, "options", { offset: 100 });
});

it("rejects a failed later page instead of presenting a truncated catalog", async () => {
  vi.stubEnv("VITE_DEMO_MODE", "true");
  vi.mocked(demoQuery)
    .mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, label: `${i}` })),
    )
    .mockRejectedValueOnce(new Error("Access revoked"));
  const { organizationOptions } = await import("../../src/api");
  await expect(organizationOptions()).rejects.toThrow("Access revoked");
});
