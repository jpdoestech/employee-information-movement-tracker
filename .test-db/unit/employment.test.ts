import { expect, it } from "vitest";
import { employmentError, employmentStatus } from "../../src/profileFields";
it("requires the complete non-active employment section without requiring IDs or remarks", () => {
  expect(employmentError({ status: "Active" })).toBeUndefined();
  expect(employmentError({ status: "Inactive" })?.key).toBe("department");
  const complete = {
    status: "Separated",
    department: "Operations",
    position: "Analyst",
    date_hired: "2026-01-01",
    employment_type: "Regular",
    status_effective_date: "2026-10-12",
    separation_category: "VOLUNTARY",
    separation_reason: "Others (specify)",
  };
  expect(employmentError(complete)?.key).toBe("separation_details");
  expect(
    employmentError({ ...complete, separation_details: "Relocating" }),
  ).toBeUndefined();
  expect(employmentStatus("Resigned")).toBe("Separated");
  expect(employmentStatus("Terminated")).toBe("Separated");
});
