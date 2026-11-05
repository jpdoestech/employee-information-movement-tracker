import type { Field } from "./domain";
import {
  applyNameCase,
  employeeNameKeys,
  normalizeText,
  type NameCase,
} from "./inputNormalization";

export const importLimit = 100;
const managed = new Set([
  "name",
  "employee_number",
  "client_employee_number",
  "branch",
  "client",
  "employee_category",
]);
export function importFields(fields: Field[]) {
  return fields.filter(
    (f) =>
      f.active &&
      f.actions.includes("C") &&
      !managed.has(f.key) &&
      (f.type !== "system" ||
        employeeNameKeys.has(f.key) ||
        ["position", "status"].includes(f.key)),
  );
}
export function canImport(context: {
  profile: { role: string };
  capabilities: string[];
  module_permissions?: Record<string, boolean>;
}) {
  return (
    context.capabilities.includes("employee_create") &&
    (context.profile.role === "superadmin" ||
      context.module_permissions?.["employees.import"] === true)
  );
}

// CSV quoting follows RFC 4180, including escaped quotes and embedded newlines.
export function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else cell += ch;
    } else if (ch === "," || ch === "\r" || ch === "\n") {
      row.push(cell);
      cell = "";
      closed = false;
      if (ch !== ",") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        rows.push(row);
        row = [];
      }
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || ch === '"')
        throw new Error(
          "Invalid CSV quoting. Save the file as CSV UTF-8 and try again.",
        );
      cell += ch;
    }
    if (row.length > 200 || rows.length > 1000)
      throw new Error(
        "The file has too many rows or columns. Import at most 100 employees per batch.",
      );
  }
  if (quoted) throw new Error("The CSV contains an unclosed quote.");
  if (cell || closed || row.length) rows.push([...row, cell]);
  return rows;
}
export async function readImportFile(file: File): Promise<unknown[][]> {
  if (!file.size || file.size > 1048576)
    throw new Error("Choose a non-empty file of at most 1 MB.");
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return readSheet(file);
  }
  throw new Error("Choose an Excel (.xlsx) or CSV (.csv) file.");
}
export type ImportRow = {
  values: Record<string, unknown>;
  manual_client_id?: string;
};
export function prepareImport(
  data: unknown[][],
  fields: Field[],
  mode: NameCase,
  manualIds = false,
) {
  const allowed = importFields(fields);
  const headers = (data[0] || []).map((v) =>
    typeof v === "string" ? v.trim() : "",
  );
  if (
    !headers.length ||
    headers.some((k) => !k) ||
    new Set(headers).size !== headers.length ||
    headers.length > 200
  )
    throw new Error(
      "Use unique, non-empty field keys in the first row. Download the template for this organization.",
    );
  for (const key of headers)
    if (
      !allowed.some((f) => f.key === key) &&
      !(manualIds && key === "manual_client_id")
    )
      throw new Error(
        `Column “${key}” is unavailable for this organization or your create permissions. Use the current template.`,
      );
  const rows: ImportRow[] = [];
  for (const cells of data.slice(1)) {
    if (cells.every((v) => v == null || v === "")) continue;
    const ordinal = rows.length + 1;
    if (cells.slice(headers.length).some((v) => v != null && v !== ""))
      throw new Error(`Row ${ordinal}: a value has no column header.`);
    const values: Record<string, unknown> = Object.create(null);
    let manual: string | undefined;
    headers.forEach((key, i) => {
      const raw = cells[i];
      if (raw == null || raw === "" || (typeof raw === "string" && !raw.trim()))
        return;
      const field = allowed.find((f) => f.key === key);
      let value: unknown = raw;
      const fail = (message: string): never => {
        throw new Error(`Row ${ordinal}, ${field?.label || key}: ${message}`);
      };
      if (key === "manual_client_id") {
        if (typeof raw !== "string")
          fail("format IDs as Text to preserve leading zeros.");
        manual = normalizeText(String(raw)).toUpperCase();
        return;
      }
      if (field!.type === "date") {
        value =
          raw instanceof Date
            ? raw.toISOString().slice(0, 10)
            : String(raw).trim();
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
          !Number.isFinite(Date.parse(String(value))) ||
          new Date(String(value)).toISOString().slice(0, 10) !== value
        )
          fail("use a real date in YYYY-MM-DD format.");
      } else if (["integer", "decimal"].includes(field!.type)) {
        if (
          typeof raw === "boolean" ||
          !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(raw).trim()) ||
          !Number.isFinite(Number(raw))
        )
          fail("enter a number without currency symbols or separators.");
        value = Number(raw);
        if (field!.type === "integer" && !Number.isSafeInteger(value))
          fail("enter a whole number within the safe numeric range.");
      } else if (field!.type === "checkbox") {
        if (![true, false, "true", "false"].includes(raw as boolean))
          fail("use true or false.");
        value = raw === true || raw === "true";
      } else {
        if (typeof raw !== "string")
          fail("format this column as Text; numbers may lose leading zeros.");
        value = normalizeText(String(raw));
        if (employeeNameKeys.has(key))
          value = applyNameCase(String(value), mode);
      }
      values[key] = value;
    });
    rows.push({ values, ...(manual ? { manual_client_id: manual } : {}) });
    if (rows.length > importLimit)
      throw new Error("Import at most 100 employees per batch.");
  }
  if (!rows.length)
    throw new Error("Add at least one employee below the header row.");
  return { headers, rows };
}
