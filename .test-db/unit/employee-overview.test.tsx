import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { EmployeeOverview } from "../../src/components/EmployeeOverview";
import { fullYears, maskedIdentifier } from "../../src/employeeOverview";
import type { Field } from "../../src/domain";
const field = (key: string, actions = ["R"]): Field => ({
  id: key,
  key,
  label: key,
  group_id: "g",
  group_name: "Custom details",
  type: "short_text",
  active: true,
  required: false,
  sensitivity: "normal",
  list_eligible: true,
  scope_mode: "all",
  row_version: 1,
  actions,
});
describe("employee overview privacy and derived values", () => {
  it("masks existing values without duplicating them", () => {
    expect(maskedIdentifier("09-1234567-8")).toBe("**-****567-8");
    expect(maskedIdentifier("—")).toBe("—");
    expect(maskedIdentifier("123")).toBe("••••");
  });
  it("uses full anniversaries and rejects invalid or future dates", () => {
    expect(fullYears("2000-10-13", "2026-10-12")).toBe(25);
    expect(fullYears("2000-10-13", "2026-10-13")).toBe(26);
    expect(fullYears("2000-02-29", "2026-03-01")).toBe(26);
    expect(fullYears("2026-02-30", "2026-10-13")).toBeNull();
    expect(fullYears("2027-01-01", "2026-10-13")).toBeNull();
  });
  it("omits denied fields, derived values and address parts; uses current group names", () => {
    const fields = [
      field("birth_date", []),
      field("date_hired", []),
      { ...field("sss_number", []), validation: { government_id_digits: 10 } },
      field("address"),
      field("province", []),
      field("custom"),
    ];
    const html = renderToStaticMarkup(
      <EmployeeOverview
        values={{
          birth_date: "2000-10-13",
          date_hired: "2020-01-01",
          sss_number: "0912345678",
          address: "Readable Street",
          province: "Hidden Province",
          custom: "Custom value",
        }}
        fields={fields}
        groups={[
          { id: "g", name: "Renamed group", active: true, row_version: 1 },
        ]}
        today="2026-10-13"
        employeeId="one"
        canEdit={false}
        onEdit={() => {}}
      />,
    );
    expect(html).toContain("Readable Street");
    expect(html).toContain("Renamed group");
    for (const hidden of [
      "0912345678",
      "Hidden Province",
      "Age",
      "Length of Service",
      "Unmask Government IDs",
      "Edit details",
    ])
      expect(html).not.toContain(hidden);
  });
});
