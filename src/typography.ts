import type { Field } from "./domain";

// Semantic roles, not a blanket numeric font: ordinals, counts and generic
// integer/decimal fields retain the UI stack.
export function fieldTextRole(
  field?: Pick<Field, "key" | "type" | "validation">,
) {
  if (!field) return "";
  if (field.type === "date") return "text-date";
  if (
    field.validation?.government_id_digits ||
    field.key === "prf_number" ||
    /(?:^|_)(?:id|code)$/.test(field.key) ||
    (/(?:^|_)number$/.test(field.key) && field.type === "system")
  )
    return "text-id";
  if (
    ["decimal", "integer"].includes(field.type) &&
    /(?:^|_)(?:amount|salary|wage|pay|balance|cost|price|fee)(?:_|$)/.test(
      field.key,
    )
  )
    return "text-amount";
  return "";
}
