import type { Field } from "../domain";
import { ValueEditor } from "./ValueEditor";
export function ManualClientId({
  field,
  value,
  onChange,
  required = false,
  disabled = false,
}: {
  field?: Field;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  if (!field?.actions.includes("C"))
    return (
      <p className="help-text">
        Create permission for ID is required to issue a manual ID.
      </p>
    );
  return (
    <fieldset className="manual-id-entry" disabled={disabled}>
      <ValueEditor
        field={{
          ...field,
          type: "short_text",
          label: "ID",
          required,
          validation: { max_length: 64, input_width: 32 },
          help_text: required
            ? "Unique within this client. Letters, digits, hyphens, underscores, dots or slashes."
            : "Enter an ID for the first assignment to this client. Existing IDs are retained on return.",
        }}
        value={value}
        onChange={(next) => onChange(String(next ?? ""))}
      />
    </fieldset>
  );
}
