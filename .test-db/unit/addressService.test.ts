import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import data from "../../src/address/barangay-search-index.json";
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
const service = () => import("../../src/address/addressService");
const mock = (rows: unknown[] = data) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => rows }),
  );
describe("official Philippine addresses", () => {
  it("finds Agdao nationwide, distinguishes duplicates, ranks prefixes and caps results", async () => {
    mock();
    const s = await service();
    const found = await s.searchBarangays("aGD");
    expect(
      found.some((b) => b.name === "Agdao" && b.cityCode === "1130700000"),
    ).toBe(true);
    expect(found.filter((b) => b.name === "Agdao").length).toBeGreaterThan(1);
    expect(
      found.every((b) => s.cities.some((c) => c.code === b.cityCode)),
    ).toBe(true);
    expect((await s.searchBarangays("san")).length).toBe(20);
    mock([
      { code: "1", name: "Other Agdao", cityCode: "a" },
      { code: "2", name: "Agdao", cityCode: "b" },
    ]);
    vi.resetModules();
    expect((await (await service()).searchBarangays("agd"))[0].name).toBe(
      "Agdao",
    );
  });
  it("loads lazily and shares concurrent requests and subsequent validation", async () => {
    mock();
    const s = await service();
    expect(await s.searchBarangays(" ")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await Promise.all([s.searchBarangays("Agd"), s.searchBarangays("Agdao")]);
    expect(
      await s.addressValidationError({
        province: "davao del sur",
        city_municipality: "Davao City",
        barangay: "AGDAO",
      }),
    ).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries failed loads and does not cache a rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetchMock);
    const s = await service();
    await expect(s.searchBarangays("Agd")).rejects.toThrow("offline");
    expect((await s.searchBarangays("Agd")).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects unknown entries, mismatched hierarchy and unresolved barangay names", async () => {
    mock();
    const s = await service();
    for (const value of [
      { province: "Imaginary", city_municipality: null, barangay: null },
      {
        province: "Pangasinan",
        city_municipality: "Davao City",
        barangay: "Agdao",
      },
      {
        province: "Davao del Sur",
        city_municipality: "City of Davao",
        barangay: "Agd",
      },
      { province: null, city_municipality: null, barangay: "Agdao" },
    ])
      expect(await s.addressValidationError(value)).not.toBeNull();
    expect(
      await s.addressValidationError({
        province: null,
        city_municipality: "Caloocan City",
        barangay: null,
      }),
    ).toBeNull();
    expect(
      await s.addressValidationError({
        province: null,
        city_municipality: null,
        barangay: null,
      }),
    ).toBeNull();
  });
});
