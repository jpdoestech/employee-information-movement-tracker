import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { lengthOfService } from "../../src/employeeOverview";
import { EmployeeOverview } from "../../src/components/EmployeeOverview";
import { employmentDisplayOrder } from "../../src/profileFields";
import type { Field } from "../../src/domain";
describe("employment details", () => {
  it("uses today for active service and effective date for non-active service", () => {
    const base = {
      date_hired: "2020-01-15",
      status_effective_date: "2022-03-20",
    };
    expect(lengthOfService({ ...base, status: "Active" }, "2026-10-13")).toBe(
      "6 years, 8 months, 28 days",
    );
    for (const status of ["Inactive", "Separated", "Resigned", "Terminated"])
      expect(lengthOfService({ ...base, status }, "2026-10-13")).toBe(
        "2 years, 2 months, 5 days",
      );
    expect(
      lengthOfService(
        {
          date_hired: "2020-02-29",
          status: "Inactive",
          status_effective_date: "2021-02-28",
        },
        "2026-10-13",
      ),
    ).toBe("1 year");
    expect(
      lengthOfService(
        {
          date_hired: "2026-01-31",
          status: "Inactive",
          status_effective_date: "2026-02-28",
        },
        "2026-10-13",
      ),
    ).toBe("1 month");
    expect(
      lengthOfService(
        { date_hired: "2026-10-13", status: "Active" },
        "2026-10-13",
      ),
    ).toBe("0 days");
  });
  it("does not invent a cutoff for missing, invalid, future or reversed effective dates", () => {
    for (const end of [
      undefined,
      "invalid",
      "2026-02-30",
      "2027-01-01",
      "2019-01-01",
    ])
      expect(
        lengthOfService(
          {
            date_hired: "2020-01-01",
            status: "Inactive",
            status_effective_date: end,
          },
          "2026-10-13",
        ),
      ).toBe("—");
  });
  const fields = employmentDisplayOrder
    .filter((key) => key !== "date_hired-duration")
    .map(
      (key) =>
        ({
          id: key,
          key,
          label: key,
          group_id: "employment",
          group_name: "Employment Details",
          active: true,
          actions: ["R"],
          type: ["date_hired", "status_effective_date"].includes(key)
            ? "date"
            : "short_text",
          required: false,
          sensitivity: "normal",
          list_eligible: true,
          scope_mode: "all",
          row_version: 1,
        }) as Field,
    )
    .reverse();
  const render = (status: string, denied: string[] = []) =>
    renderToStaticMarkup(
      <EmployeeOverview
        values={{
          date_hired: "2020-01-15",
          status_effective_date: "2022-03-20",
          status,
          separation_category: "VOLUNTARY",
          separation_reason: "Others (specify)",
          separation_details: "Relocating",
          remarks: "Keep notes",
        }}
        fields={fields.map((f) => ({
          ...f,
          actions: denied.includes(f.key) ? [] : ["R"],
        }))}
        groups={[
          {
            id: "employment",
            name: "Employment Details",
            active: true,
            row_version: 1,
          },
        ]}
        today="2026-10-13"
        employeeId="one"
        canEdit={false}
        onEdit={() => {}}
      />,
    );
  it("orders the summary and shows non-active details only when appropriate", () => {
    const html = render("Inactive");
    const labels = [...html.matchAll(/<dt>(.*?)<\/dt>/g)].map(
      (match) => match[1],
    );
    expect(labels).toEqual(
      employmentDisplayOrder.filter((key) => key !== "replaced_employee_id").map((key) =>
        key === "date_hired-duration" ? "Length of Service" : key,
      ),
    );
    expect(html).toContain("2 years, 2 months, 5 days");
    const active = render("Active");
    for (const label of [
      "status_effective_date",
      "separation_category",
      "separation_reason",
      "separation_details",
    ])
      expect(active).not.toContain(`<dt>${label}</dt>`);
    expect(active).toContain("Keep notes");
  });
  it("does not derive service or conditional details from denied status/effective-date fields", () => {
    expect(render("Inactive", ["status_effective_date"])).not.toContain(
      "2 years, 2 months, 5 days",
    );
    const hiddenStatus = render("Inactive", ["status"]);
    expect(hiddenStatus).not.toContain("2 years, 2 months, 5 days");
    expect(hiddenStatus).not.toContain("<dt>separation_category</dt>");
  });
});
