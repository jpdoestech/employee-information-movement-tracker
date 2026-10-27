import { useId } from "react";
import { List, X } from "lucide-react";
import { FieldTypeIcon } from "./FieldTypeIcon";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { normalizeText } from "../inputNormalization";
import { officialJobMatch } from "../jobCatalog";
import type { Field } from "../domain";

export function JobValueEditor({
  field,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  clearable = true,
  blind = false,
}: {
  field: Pick<Field, "key" | "label"> &
    Partial<Pick<Field, "options" | "required" | "help_text" | "validation">>;
  value: unknown;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  readOnly?: boolean;
  clearable?: boolean;
  blind?: boolean;
}) {
  const id = useId();
  const text = String(value ?? "");
  const choices = field.options || [];
  const temporary = !!text.trim() && !choices.includes(text);
  const match = temporary ? officialJobMatch(text, choices) : undefined;
  return (
    <div className="field job-field">
      <label htmlFor={id}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {blind && (
        <small>
          Current value is restricted. You can select or enter a new value.
        </small>
      )}
      <div className="job-value-row">
        <span
          className={`value-control has-type-icon${clearable && text && !readOnly ? " with-clear" : ""}`}
        >
          <span className="value-type-icon">
            <FieldTypeIcon type="short_text" size={14} />
          </span>
          <input
            id={id}
            required={field.required}
            maxLength={
              field.validation?.max_length ??
              (field.key === "position" ? 200 : 500)
            }
            disabled={disabled}
            readOnly={readOnly}
            value={text}
            title={text || undefined}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              const clean = normalizeText(text);
              if (clean !== text) onChange(clean || null);
            }}
            aria-describedby={`${id}-info`}
          />
          {clearable && text && !readOnly && (
            <button
              type="button"
              className="value-clear"
              aria-label={`Clear ${field.label}`}
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              <X size={13} />
            </button>
          )}
        </span>
        <SearchFilterPicker
          mode="single"
          icon={List}
          label={`Choose existing ${field.label}`}
          displayLabel="Choose existing"
          disabled={disabled || readOnly || !choices.length}
          clearable={false}
          value={[]}
          options={choices.map((choice) => ({ id: choice, label: choice }))}
          onChange={([choice]) => onChange(choice || null)}
        />
      </div>
      <small
        id={`${id}-info`}
        className={temporary ? "job-temporary-note" : ""}
      >
        {temporary
          ? "Temporary entry. Check spelling and consistency; choose an official value or ask a Superadmin to add it in Field Builder. Saving is allowed."
          : choices.length
            ? "Choose an official value or type a temporary entry."
            : "No official choices configured. Temporary entry is allowed; a Superadmin can set the shared list in Field Builder."}
      </small>
      {match && !readOnly && (
        <button
          type="button"
          className="job-match-action"
          title={match}
          aria-label={`Use official spelling ${match}`}
          disabled={disabled}
          onClick={() => onChange(match)}
        >
          Use official spelling
        </button>
      )}
      {field.help_text && <small>{field.help_text}</small>}
    </div>
  );
}
