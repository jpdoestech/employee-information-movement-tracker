import { describe, expect, it } from "vitest";
import {
  governmentDefinitions,
  governmentIdError,
  normalizeGovernmentId,
  requiredForEdit,
} from "../../src/governmentIds";
import type { Field } from "../../src/domain";
describe("government IDs", () => {
  for (const definition of governmentDefinitions) {
    it(`${definition.label} validates its exact digit count and preserves zeroes`, () => {
      const field = {
        label: definition.label,
        validation: { government_id_digits: definition.digits },
      };
      const valid = "0" + "1".repeat(definition.digits - 1);
      expect(governmentIdError(field, valid)).toBe("");
      expect(governmentIdError(field, valid.slice(1))).toContain("exactly");
      expect(governmentIdError(field, valid + "1")).toContain("exactly");
      expect(governmentIdError(field, valid.slice(1) + "A")).toContain(
        "exactly",
      );
      expect(governmentIdError(field, Number(valid))).toContain("exactly");
      expect(
        governmentIdError(field, valid.slice(0, 3) + "-" + valid.slice(3)),
      ).toBe("");
    });
  }
  it("canonicalizes only supported separators", () => {
    expect(normalizeGovernmentId("012-345-678")).toBe("012345678");
    expect(normalizeGovernmentId("012 345 678")).toBe("012345678");
    expect(normalizeGovernmentId("012/345/678")).toBe("012/345/678");
  });
  it("keeps IDs optional on creation, editing and clearing even with stale required metadata", () => {
    const field = {
      key: "bir_tin",
      required: true,
      validation: { government_id_digits: 9 },
    } as Field;
    expect(requiredForEdit(field, {}, {}, true)).toBe(false);
    expect(requiredForEdit(field, {}, {}, false)).toBe(false);
    expect(requiredForEdit(field, { bir_tin: "012345678" }, {}, false)).toBe(
      false,
    );
    expect(requiredForEdit(field, {}, { bir_tin: null }, false)).toBe(false);
    expect(requiredForEdit({ ...field, required: false }, {}, {}, true)).toBe(
      false,
    );
    expect(requiredForEdit({ ...field, validation: {} }, {}, {}, false)).toBe(
      true,
    );
  });
});
