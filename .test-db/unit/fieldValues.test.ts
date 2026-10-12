import { expect, it } from "vitest";
import {
  displayFieldValue,
  fieldTypeLabel,
  parseNumberInput,
} from "../../src/fieldValues";

it("formats Number with grouping and two decimal places without changing values", () => {
  expect(displayFieldValue({ type: "decimal" }, 100)).toBe("100.00");
  expect(displayFieldValue({ type: "decimal" }, 1000)).toBe("1,000.00");
  expect(displayFieldValue({ type: "decimal" }, 0)).toBe("0.00");
  expect(displayFieldValue({ type: "decimal" }, -1200.5)).toBe("-1,200.50");
  expect(displayFieldValue({ type: "decimal" }, 1.2345)).toBe("1.23");
  expect(parseNumberInput("1.2345")).toBe(1.2345);
});
it("keeps Integer, text and empty values distinct", () => {
  expect(displayFieldValue({ type: "integer" }, 1000)).toBe("1000");
  expect(displayFieldValue({ type: "short_text" }, "00100")).toBe("00100");
  expect(displayFieldValue({ type: "decimal" }, null)).toBe("—");
  expect(fieldTypeLabel("decimal")).toBe("Number");
});
it("parses comma-grouped, fractional and existing scientific numeric values", () => {
  expect(parseNumberInput("1,000.00")).toBe(1000);
  expect(parseNumberInput("-1,234.56")).toBe(-1234.56);
  expect(parseNumberInput(".50")).toBe(0.5);
  expect(parseNumberInput("100.")).toBe(100);
  expect(parseNumberInput("1e-7")).toBe(1e-7);
  expect(parseNumberInput("")).toBeNull();
});
it.each(["1,00", "1,2,3", "invalid", "-", "1e400", "NaN"])(
  "retains invalid input %s instead of clearing data",
  (text) => {
    expect(parseNumberInput(text)).toBe(text);
  },
);
