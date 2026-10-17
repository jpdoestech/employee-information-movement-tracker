import { describe, it, expect } from "vitest";
import {
  filterOperators,
  filterValue,
  matchesFilterValue,
} from "../../src/filterValues";
describe("typed filter predicates", () => {
  it("synthetic matching agrees on range, choice, empty and boolean semantics", () => {
    const matches = (v: unknown, op: string, value: unknown) =>
      matchesFilterValue(v, { key: "test", op, value });
    expect(matches(25, "between", [20, 30])).toBe(true);
    expect(matches(35, "between", [20, 30])).toBe(false);
    expect(matches("Remote", "in", ["Onsite", "Remote"])).toBe(true);
    expect(matches(false, "eq", false)).toBe(true);
    expect(matches(null, "before", 30)).toBe(false);
    expect(matches("2026-01-01", "after", "2025-12-31")).toBe(true);
    expect(matches("", "empty", null)).toBe(true);
    expect(matches("Ana", "contains", "AN")).toBe(true);
  });
  it("text cannot use numeric/date operators or empty values accidentally", () => {
    const f = { key: "name", type: "short_text" };
    expect(filterValue(f, "contains", ["Ana"])).toBe("Ana");
    expect(filterValue(f, "empty", [])).toBeNull();
    expect(() => filterValue(f, "between", ["a", "z"])).toThrow("operator");
    expect(() => filterValue(f, "eq", [])).toThrow("filter value");
  });
  it("numeric ranges are ordered and do not coerce blank, infinity or fractions to integers", () => {
    const f = { key: "n", type: "integer" };
    expect(filterValue(f, "between", ["0", "12"])).toEqual([0, 12]);
    for (const value of ["", "Infinity", "NaN", "1.2"])
      expect(() => filterValue(f, "eq", [value])).toThrow();
    expect(() => filterValue(f, "between", ["12", "1"])).toThrow("range start");
    expect(filterValue({ ...f, type: "decimal" }, "eq", ["1.2"])).toBe(1.2);
  });
  it("dates use calendar values and reject invalid ranges", () => {
    const f = { key: "d", type: "date" };
    expect(filterValue(f, "between", ["2024-02-29", "2024-03-01"])).toEqual([
      "2024-02-29",
      "2024-03-01",
    ]);
    expect(() => filterValue(f, "eq", ["2025-02-29"])).toThrow("valid date");
    expect(() =>
      filterValue(f, "between", ["2024-03-01", "2024-02-29"]),
    ).toThrow("range start");
  });
  it("multi-choice predicates contain listed values, retain OR semantics and deduplicate", () => {
    const f = { key: "select", type: "select", options: ["A", "B"] };
    expect(filterValue(f, "in", ["A", "B", "A"])).toEqual(["A", "B"]);
    expect(() => filterValue(f, "in", ["C"])).toThrow("listed");
    expect(() => filterValue(f, "in", [])).toThrow("at least one");
    expect(filterOperators(f)).not.toContain("contains");
  });
  it("boolean No remains false, and status choices remain controlled", () => {
    expect(filterValue({ key: "b", type: "checkbox" }, "eq", ["false"])).toBe(
      false,
    );
    expect(() =>
      filterValue({ key: "b", type: "checkbox" }, "eq", ["no"]),
    ).toThrow("Yes or No");
    expect(
      filterValue({ key: "status", type: "system" }, "in", [
        "Active",
        "Inactive",
      ]),
    ).toEqual(["Active", "Inactive"]);
  });
});
