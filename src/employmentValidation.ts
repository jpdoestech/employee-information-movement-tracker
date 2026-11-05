import type { Employee, Field } from "./domain";

export function manpowerError(
  values: Record<string, unknown>,
  creating = false,
) {
  const classification = values.manpower_classification;
  if (
    !creating &&
    classification == null &&
    values.replaced_employee_id == null
  )
    return;
  if (!["New/Additional", "Replacement"].includes(String(classification)))
    return "Choose New/Additional or Replacement for Employment Manpower Classification.";
  if (classification === "Replacement" && !values.replaced_employee_id)
    return "Select the employee being replaced.";
  if (classification !== "Replacement" && values.replaced_employee_id)
    return "An employee being replaced is only valid for Replacement.";
}

export function normalizedUniqueValue(
  field: Field,
  value: unknown,
): string | null {
  if (value == null || (typeof value === "string" && !value.trim()))
    return null;
  if (field.validation?.government_id_digits || field.type === "phone")
    return String(value).replace(/[ -]/g, "");
  return String(value)
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function uniqueValuesError(
  fields: Field[],
  employees: Employee[],
  clientScopes: (id: string) => string[],
) {
  for (const field of fields.filter((f) => f.is_unique)) {
    const seen = new Set<string>();
    for (const employee of employees) {
      const value = normalizedUniqueValue(field, employee.values[field.key]);
      if (value == null) continue;
      for (const scope of field.unique_scope === "client"
        ? clientScopes(employee.id)
        : ["global"]) {
        const key = JSON.stringify([scope, value]);
        if (seen.has(key)) return `${field.label} must have a unique value.`;
        seen.add(key);
      }
    }
  }
}
