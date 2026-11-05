import { expect, it } from "vitest";
import { googleSpreadsheetId } from "../../src/googleSheets";
it("accepts owned spreadsheet IDs and Google Sheets URLs, or blank for provisioning", () => {
  expect(googleSpreadsheetId(" ")).toBeNull();
  expect(googleSpreadsheetId(" user_sheet-123 ")).toBe("user_sheet-123");
  expect(
    googleSpreadsheetId(
      "https://docs.google.com/spreadsheets/d/user_sheet-123/edit#gid=0",
    ),
  ).toBe("user_sheet-123");
  for (const value of [
    "https://evil.test/spreadsheets/d/user_sheet-123",
    "../../files",
    "short",
    "https://docs.google.com.evil.test/spreadsheets/d/user_sheet-123",
  ])
    expect(() => googleSpreadsheetId(value)).toThrow("Google Sheets URL");
});
