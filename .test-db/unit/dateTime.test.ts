import { expect, it } from "vitest";
import { formatDateTime } from "../../src/dateTime";

it("formats the Manila calendar boundary independently of browser timezone", () => {
  expect(formatDateTime("2026-11-05T17:30:00Z")).toMatch(
    /Nov 6, 2026.*1:30.*AM/i,
  );
  expect(formatDateTime("2026-11-06T01:30:00+08:00")).toBe(
    formatDateTime("2026-11-05T17:30:00Z"),
  );
});
it("handles absent or malformed timestamps without crashing a screen", () => {
  for (const value of [undefined, null, "", "invalid"])
    expect(formatDateTime(value)).toBe("—");
});
