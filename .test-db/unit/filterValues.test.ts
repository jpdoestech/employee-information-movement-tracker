import { describe, it, expect } from "vitest";
import { matchesFilterValue } from "../../src/filterValues";
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
});
