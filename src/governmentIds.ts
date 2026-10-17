import type { Field } from "./domain";

export const governmentDefinitions = [
  {
    key: "bir_tin",
    label: "BIR TIN",
    digits: 9,
    help_text: "9-digit personal TIN; exclude the branch code.",
  },
  {
    key: "sss_number",
    label: "SSS Number",
    digits: 10,
    help_text: "10 digits.",
  },
  {
    key: "philhealth_pin",
    label: "PhilHealth PIN",
    digits: 12,
    help_text: "12 digits.",
  },
  {
    key: "pagibig_mid",
    label: "Pag-IBIG MID",
    digits: 12,
    help_text: "12 digits; use the MID, not the registration tracking number.",
  },
];

export function normalizeGovernmentId(value: string) {
  return value.replace(/[ -]/g, "");
}
export function governmentIdError(
  field: Pick<Field, "validation" | "label">,
  value: unknown,
) {
  const digits = field.validation?.government_id_digits;
  if (!digits || value == null || value === "") return "";
  return typeof value === "string" &&
    new RegExp(`^[0-9]{${digits}}$`).test(normalizeGovernmentId(value))
    ? ""
    : `${field.label} must contain exactly ${digits} digits.`;
}

// New employees require IDs. Historical gaps do not block unrelated edits.
export function requiredForEdit(
  field: Field,
  values: Record<string, unknown>,
  changed: Record<string, unknown>,
  creating: boolean,
) {
  if (
    field.validation?.government_id_digits ||
    field.key === "manpower_classification"
  )
    return (
      field.required &&
      (creating || !!values[field.key] || Object.hasOwn(changed, field.key))
    );
  return field.required;
}
