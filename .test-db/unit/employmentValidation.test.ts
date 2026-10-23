import { describe, expect, it } from "vitest";
import {
  manpowerError,
  normalizedUniqueValue,
  uniqueValuesError,
} from "../../src/employmentValidation";
import { fieldConfigurationError } from "../../src/fieldConfiguration";
import type { Field, Employee } from "../../src/domain";
const field = {
  id: "f",
  key: "code",
  label: "Code",
  type: "short_text",
  is_unique: true,
  unique_scope: "global",
} as Field;
const rows = (a: unknown, b: unknown) =>
  [
    { id: "a", values: { code: a } },
    { id: "b", values: { code: b } },
  ] as Employee[];
describe("Manpower and configurable uniqueness", () => {
  it("requires classification for creation and a reference only for Replacement", () => {
    expect(manpowerError({})).toBeUndefined();
    expect(manpowerError({}, true)).toContain("Classification");
    expect(
      manpowerError({ manpower_classification: "New/Additional" }, true),
    ).toBeUndefined();
    expect(manpowerError({ manpower_classification: "Replacement" })).toContain(
      "Select",
    );
    expect(
      manpowerError({
        manpower_classification: "Replacement",
        replaced_employee_id: "a",
      }),
    ).toBeUndefined();
    expect(
      manpowerError({
        manpower_classification: "New/Additional",
        replaced_employee_id: "a",
      }),
    ).toContain("only valid");
  });
  it("ignores blanks and normalizes case, spaces and identifier formatting", () => {
    for (const value of [null, undefined, "", "  "])
      expect(normalizedUniqueValue(field, value)).toBeNull();
    expect(normalizedUniqueValue(field, "  ＡBC   def ")).toBe("abc def");
    expect(
      normalizedUniqueValue(
        { ...field, validation: { government_id_digits: 10 } },
        "09-1234567-8",
      ),
    ).toBe("0912345678");
    expect(
      uniqueValuesError([field], rows("ABC", " abc "), () => []),
    ).toContain("unique");
    expect(
      uniqueValuesError([field], rows(null, ""), () => []),
    ).toBeUndefined();
    expect(
      uniqueValuesError(
        [{ ...field, is_unique: false }],
        rows("same", "same"),
        () => [],
      ),
    ).toBeUndefined();
  });
  it("reserves every client scope and allows values without a common client", () => {
    const scoped = { ...field, unique_scope: "client" as const };
    expect(
      uniqueValuesError([scoped], rows("same", "same"), (id) => [id]),
    ).toBeUndefined();
    expect(
      uniqueValuesError([scoped], rows("same", "same"), () => []),
    ).toBeUndefined();
    expect(
      uniqueValuesError([scoped], rows("same", "same"), (id) =>
        id === "a" ? ["past", "future"] : ["future"],
      ),
    ).toContain("unique");
  });
  it("rejects invalid scopes and leaves system ID allocation separate", () => {
    expect(
      fieldConfigurationError({ is_unique: true, unique_scope: "client" }),
    ).toBeUndefined();
    expect(fieldConfigurationError({ unique_scope: "branch" })).toBeTruthy();
    expect(fieldConfigurationError({ is_unique: "true" })).toBeTruthy();
    expect(
      fieldConfigurationError({ is_unique: true, type: "system" }),
    ).toBeTruthy();
  });
});
