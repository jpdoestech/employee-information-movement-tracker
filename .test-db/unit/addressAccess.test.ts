import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  addressAccess,
  addressDefinitions,
  addressValue,
  relationshipOptions,
} from "../../src/address/addressFields";
import { AddressFields } from "../../src/components/forms/AddressFields";
import type { Field } from "../../src/domain";
const field = (key: string, actions: string[]): Field => ({
  id: key,
  key,
  label: key,
  type: "short_text",
  group_id: "address",
  group_name: "Address",
  active: true,
  required: false,
  sensitivity: "normal",
  list_eligible: true,
  scope_mode: "all",
  row_version: 1,
  actions,
});
describe("address column permissions", () => {
  it("uses independent C/U/D rights, keeps read-only fields visible and hides unauthorized columns", () => {
    const fields = [
      field("address", ["R"]),
      field("province", ["U"]),
      field("city_municipality", ["U", "D"]),
      field("current_address", ["C"]),
    ];
    const access = addressAccess(fields, true);
    expect(access.address).toMatchObject({
      visible: true,
      write: false,
      clear: false,
    });
    expect(access.province).toMatchObject({
      visible: true,
      write: true,
      clear: false,
    });
    expect(access.city_municipality.clear).toBe(true);
    expect(access.barangay.visible).toBe(false);
    expect(addressAccess(fields, false, "current_").address.write).toBe(true);
    expect(addressAccess(fields, true, "current_").address.visible).toBe(false);
  });
  it("read-only form never enables hierarchy changes or renders hidden postal values", () => {
    const fields = [
      field("address", ["R"]),
      field("province", ["R"]),
      field("city_municipality", ["R"]),
      field("barangay", ["R"]),
    ];
    const html = renderToStaticMarkup(
      createElement(AddressFields, {
        value: addressValue({
          address: "Existing Street",
          province: "Davao del Sur",
          city_municipality: "Davao City",
          barangay: "Agdao",
        }),
        access: addressAccess(fields, true),
        onChange: () => {},
      }),
    );
    expect(html).toContain("Existing Street");
    expect(html).not.toContain("Postal code");
    expect(html.match(/disabled=""/g)?.length).toBe(5);
  });
  it("permits child editing when parents are read-only instead of disabling all hierarchy selectors", () => {
    const fields = [
      field("province", ["R"]),
      field("city_municipality", ["R", "U", "D"]),
      field("barangay", ["R", "U", "D"]),
    ];
    const html = renderToStaticMarkup(
      createElement(AddressFields, {
        value: addressValue({
          province: "Davao del Sur",
          city_municipality: "City of Davao",
          barangay: "Agdao",
        }),
        access: addressAccess(fields, true),
        onChange: () => {},
      }),
    );
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });
  it("default definitions keep original storage names and comprehensive emergency relationships", () => {
    expect(addressDefinitions).toHaveLength(18);
    expect(addressDefinitions.some((f) => f.key === "region")).toBe(false);
    expect(
      addressAccess([field("emergency_address", ["R"])], true, "emergency_")
        .address,
    ).toMatchObject({ visible: true, write: false, clear: false });
    expect(relationshipOptions).toEqual(
      expect.arrayContaining([
        "Guardian",
        "Spouse",
        "Parent",
        "Friend",
        "Other",
      ]),
    );
    expect(
      addressValue({ current_barangay: "Agdao" }, "current_").barangay,
    ).toBe("Agdao");
  });
});
