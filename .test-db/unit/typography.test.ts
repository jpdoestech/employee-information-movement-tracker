import { describe, expect, it } from "vitest";
import { fieldTextRole } from "../../src/typography";
describe("semantic typography", () => {
  const field = (key: string, type: string, validation = {}) => ({
    key,
    type,
    validation,
  });
  it("uses monospace for identifiers, dates and financial amounts", () => {
    expect(fieldTextRole(field("employee_number", "system"))).toBe("text-id");
    expect(fieldTextRole(field("client_employee_number", "system"))).toBe(
      "text-id",
    );
    expect(
      fieldTextRole(
        field("sss_number", "short_text", { government_id_digits: 10 }),
      ),
    ).toBe("text-id");
    expect(fieldTextRole(field("birth_date", "date"))).toBe("text-date");
    expect(fieldTextRole(field("monthly_salary", "decimal"))).toBe(
      "text-amount",
    );
  });
  it("retains the UI font for generic numeric fields and prose", () => {
    expect(fieldTextRole(field("headcount", "integer"))).toBe("");
    expect(fieldTextRole(field("workload_score", "decimal"))).toBe("");
    expect(fieldTextRole(field("name", "system"))).toBe("");
  });
});
