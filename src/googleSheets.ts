export function googleSpreadsheetId(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const id = text.startsWith("https://")
    ? /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(
        text,
      )?.[1]
    : text;
  if (!id || !/^[A-Za-z0-9_-]{10,200}$/.test(id))
    throw new Error("Enter a Google Sheets URL or spreadsheet ID.");
  return id;
}
