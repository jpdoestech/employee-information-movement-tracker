import { describe, expect, it } from "vitest";
import { fieldConfigurationError } from "../../src/fieldConfiguration";
import { valueWidth } from "../../src/controlSizing";
import { fieldTypeIcons } from "../../src/components/FieldTypeIcon";
describe("Field setup", () => {
  it("covers every supported type with an icon", () => {
    for (const type of [
      "short_text",
      "long_text",
      "integer",
      "decimal",
      "date",
      "checkbox",
      "select",
      "email",
      "phone",
      "system",
    ])
      expect(fieldTypeIcons[type]).toBeDefined();
  });
  it("separates bounded display sizing from data length", () => {
    expect(valueWidth("short_text", [], undefined, undefined, 18)).toBe("18ch");
    expect(
      fieldConfigurationError({ validation: { input_width: 9 } }),
    ).toContain("10 to 80");
    expect(
      fieldConfigurationError({ validation: { max_length: 0 } }),
    ).toContain("Maximum length");
    expect(
      fieldConfigurationError({
        validation: { input_width: 20, max_length: 200 },
      }),
    ).toBeUndefined();
  });
  it("validates choices and checkbox defaults including false", () => {
    expect(
      fieldConfigurationError({ type: "checkbox", default_value: false }),
    ).toBeUndefined();
    expect(
      fieldConfigurationError({ type: "checkbox", default_value: "false" }),
    ).toContain("checked");
    expect(
      fieldConfigurationError({ type: "select", options: ["A", "a"] }),
    ).toContain("distinct");
    expect(
      fieldConfigurationError({
        type: "select",
        options: ["A"],
        default_value: "B",
      }),
    ).toContain("choices");
  });
  it("rejects defaults beyond numeric or text bounds", () => {
    expect(
      fieldConfigurationError({ type: "integer", default_value: 2.5 }),
    ).toContain("numeric");
    expect(
      fieldConfigurationError({
        type: "decimal",
        default_value: 10,
        validation: { max: 5 },
      }),
    ).toContain("bounds");
    expect(
      fieldConfigurationError({
        type: "short_text",
        default_value: "abcd",
        validation: { max_length: 3 },
      }),
    ).toContain("length");
  });
});
