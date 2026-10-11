import { describe, expect, it, vi } from "vitest";
import { addressValidationError, searchBarangays } from "./addressService";

describe("official address references", () => {
  it("shares the reference load, finds partial names and validates the selected hierarchy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { code: "1130700002", name: "Agdao", cityCode: "1130700000" },
    ] });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const [first, second] = await Promise.all([searchBarangays("Agd"), searchBarangays("Agdao")]);
      expect(first[0].name).toBe("Agdao");
      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await addressValidationError({ province: "Davao del Sur", city_municipality: "City of Davao", barangay: "Agdao" })).toBeNull();
      expect(await addressValidationError({ province: "Davao del Sur", city_municipality: "City of Davao", barangay: "Agd" })).not.toBeNull();
      expect(await addressValidationError({ province: "Pangasinan", city_municipality: "City of Davao", barangay: "Agdao" })).not.toBeNull();
      expect(await addressValidationError({ province: "Imaginary", city_municipality: null, barangay: null })).not.toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
