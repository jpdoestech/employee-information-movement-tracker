import { formatIdentifier, identifierGroups } from "./identifiers";
import type { Field } from "./domain";

const numberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Formatting is presentation only: stored numbers and numeric queries stay intact.
export function displayFieldValue(
  field:
    | (Pick<Field, "type"> & Partial<Pick<Field, "key" | "validation">>)
    | undefined,
  value: unknown,
) {
  if (value != null && field) {
    const groups = identifierGroups({ ...field, key: field.key ?? "" });
    if (groups) return formatIdentifier(value, groups);
  }
  if (
    field?.type === "decimal" &&
    typeof value === "number" &&
    Number.isFinite(value)
  )
    return numberFormat.format(value);
  return String(value ?? "—");
}

// Invalid/incomplete text stays text so it cannot accidentally serialize NaN as null.
export function parseNumberInput(text: string): number | string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (
    !/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(
      trimmed,
    )
  )
    return text;
  const value = Number(trimmed.replaceAll(",", ""));
  return Number.isFinite(value) ? value : text;
}

export function fieldTypeLabel(type: string) {
  return type === "phone"
    ? "Mobile"
    : type === "decimal"
      ? "Number"
      : type.replaceAll("_", " ");
}
