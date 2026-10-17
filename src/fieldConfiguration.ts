import type { Field } from "./domain";

export const textFieldTypes = ["short_text", "long_text", "email", "phone"];
// Shared with the definition form and synthetic demo. PostgreSQL is authoritative.
export function fieldConfigurationError(
  field: Partial<Field>,
): string | undefined {
  if (field.is_unique !== undefined && typeof field.is_unique !== "boolean")
    return "Unique values must be enabled or disabled.";
  if (
    field.unique_scope !== undefined &&
    !["global", "client"].includes(field.unique_scope)
  )
    return "Choose Global or Per-client uniqueness.";
  if (field.is_unique && field.type === "system")
    return "System IDs retain their existing allocation and uniqueness rules.";
  const rules = field.validation ?? {};
  if (Object.values(rules).some((v) => v !== undefined && !Number.isFinite(v)))
    return "Validation values must be finite numbers.";
  if (
    rules.input_width !== undefined &&
    (!Number.isInteger(rules.input_width) ||
      rules.input_width < 10 ||
      rules.input_width > 80)
  )
    return "Input width must be a whole number from 10 to 80 characters.";
  if (
    rules.max_length !== undefined &&
    (!Number.isInteger(rules.max_length) ||
      rules.max_length < 1 ||
      rules.max_length > 10000)
  )
    return "Maximum length must be a whole number from 1 to 10,000.";
  if (
    rules.min !== undefined &&
    rules.max !== undefined &&
    rules.min > rules.max
  )
    return "Minimum must not exceed maximum.";
  if (
    field.type === "select" &&
    (!field.options?.length ||
      field.options.some((v) => !v.trim()) ||
      new Set(field.options.map((v) => v.trim().toLowerCase())).size !==
        field.options.length)
  )
    return "Add distinct, nonempty dropdown choices.";
  const value = field.default_value;
  if (value === undefined || value === null) return;
  if (field.type === "checkbox" && typeof value !== "boolean")
    return "Choose a checked or unchecked default.";
  if (field.type === "select" && !field.options?.includes(String(value)))
    return "The default must be one of the dropdown choices.";
  if (
    ["integer", "decimal"].includes(field.type ?? "") &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.type === "integer" && !Number.isInteger(value)))
  )
    return "Enter a valid numeric default before saving.";
  if (
    typeof value === "number" &&
    ((rules.min !== undefined && value < rules.min) ||
      (rules.max !== undefined && value > rules.max))
  )
    return "The default must be within the configured bounds.";
  if (
    typeof value === "string" &&
    value.length >
      (rules.max_length ?? (field.type === "long_text" ? 10000 : 500))
  )
    return "The default exceeds the maximum length.";
}
