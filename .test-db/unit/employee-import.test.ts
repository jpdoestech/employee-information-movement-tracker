import { describe, expect, it } from "vitest";
import {
  canImport,
  importFields,
  parseCsv,
  prepareImport,
} from "../../src/employeeImport";
import type { Field } from "../../src/domain";
const field = (key: string, type = "short_text", actions = ["C"]): Field => ({
  id: key,
  key,
  label: key,
  type,
  actions,
  active: true,
  required: false,
  group_id: "core",
  group_name: "Core",
  sensitivity: "normal",
  list_eligible: true,
  scope_mode: "all",
  row_version: 1,
});
const fields = [
  field("last_name", "system"),
  field("first_name", "system"),
  field("daily_rate", "decimal"),
  field("count", "integer"),
  field("birth_date", "date"),
  field("enabled", "checkbox"),
  field("account_number"),
  field("employee_category"),
  field("secret", "short_text", ["R"]),
];
describe("employee import boundary", () => {
  it("parses CSV quoting, BOM, CRLF, embedded newlines and trailing empty cells", () => {
    expect(
      parseCsv(
        '\uFEFFlast_name,first_name,remarks\r\n"Santos, Jr.","Ma""ria","line 1\r\nline 2"\r\nA,B,',
      ),
    ).toEqual([
      ["last_name", "first_name", "remarks"],
      ["Santos, Jr.", 'Ma"ria', "line 1\r\nline 2"],
      ["A", "B", ""],
    ]);
    for (const source of ['a\n"unclosed', 'a\na"b', 'a\n"a"oops'])
      expect(() => parseCsv(source)).toThrow();
  });
  it("requires an explicit import grant and independent Create", () => {
    const base = {
      profile: { role: "admin" },
      capabilities: ["employee_create"],
      module_permissions: { "employees.import": true },
    };
    expect(canImport(base)).toBe(true);
    expect(canImport({ ...base, module_permissions: {} })).toBe(false);
    expect(canImport({ ...base, capabilities: [] })).toBe(false);
    expect(
      canImport({
        profile: { role: "superadmin" },
        capabilities: ["employee_create"],
      }),
    ).toBe(true);
  });
  it("rejects hidden, managed, duplicate and unknown field keys", () => {
    expect(importFields(fields).map((f) => f.key)).not.toContain("secret");
    for (const headers of [
      ["secret"],
      ["employee_category"],
      ["name"],
      ["Last Name"],
      ["last_name", "last_name"],
      [""],
    ])
      expect(() =>
        prepareImport([headers, ["value"]], fields, "upper"),
      ).toThrow();
    expect(() =>
      prepareImport([["last_name"], ["A", "extra"]], fields, "upper"),
    ).toThrow("no column header");
  });
  it("normalizes text, preserves IDs, converts exact types and applies the chosen name case", () => {
    const data = [
      [
        "last_name",
        "account_number",
        "daily_rate",
        "count",
        "birth_date",
        "enabled",
      ],
      [
        "  McDonald  ",
        " 001234 ",
        "123.45",
        3,
        new Date("2000-01-02T00:00:00Z"),
        false,
      ],
    ];
    expect(prepareImport(data, fields, "user_defined").rows[0].values).toEqual({
      last_name: "McDonald",
      account_number: "001234",
      daily_rate: 123.45,
      count: 3,
      birth_date: "2000-01-02",
      enabled: false,
    });
    expect(prepareImport(data, fields, "upper").rows[0].values.last_name).toBe(
      "MCDONALD",
    );
    expect(
      prepareImport([["last_name"], ["mARiA sANTOS"]], fields, "proper").rows[0]
        .values.last_name,
    ).toBe("Maria Santos");
  });
  it("rejects lossy numeric identifiers, invalid dates and non-finite or fractional integers", () => {
    for (const [key, value] of [
      ["account_number", 123],
      ["birth_date", "2025-02-29"],
      ["birth_date", "01/02/2000"],
      ["count", 1.2],
      ["count", "1e9"],
      ["daily_rate", "1,000"],
      ["enabled", "yes"],
    ])
      expect(() => prepareImport([[key], [value]], fields, "upper")).toThrow(
        "Row 1",
      );
  });
  it("omits blank cells for defaults, rejects empty/oversized batches and permits manual IDs only in manual mode", () => {
    expect(
      prepareImport(
        [
          ["first_name", "last_name"],
          ["Maria", ""],
          [null, null],
        ],
        fields,
        "upper",
      ).rows,
    ).toEqual([{ values: { first_name: "MARIA" } }]);
    expect(() => prepareImport([["last_name"]], fields, "upper")).toThrow(
      "at least one",
    );
    expect(() =>
      prepareImport(
        [["last_name"], ...Array.from({ length: 101 }, () => ["A"])],
        fields,
        "upper",
      ),
    ).toThrow("100");
    expect(() =>
      prepareImport([["manual_client_id"], ["001"]], fields, "upper"),
    ).toThrow("unavailable");
    expect(
      prepareImport([["manual_client_id"], ["001"]], fields, "upper", true)
        .rows[0].manual_client_id,
    ).toBe("001");
  });
});
