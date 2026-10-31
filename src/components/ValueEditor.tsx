import { IdentifierInput } from "./IdentifierInput";
import { identifierGroups } from "../identifiers";
import { SearchFilterPicker } from "./SearchFilterPicker";
import type { Field } from "../domain";
import { useId, useState } from "react";
import { X } from "lucide-react";
import { displayFieldValue, parseNumberInput } from "../fieldValues";
import { governmentIdError, normalizeGovernmentId } from "../governmentIds";
import { valueWidth } from "../controlSizing";
import { FieldTypeIcon, fieldTypeIcons } from "./FieldTypeIcon";
import { fieldTextRole } from "../typography";
import { isJobField } from "../jobCatalog";
import { JobValueEditor } from "./JobValueEditor";
import {
  applyNameCase,
  employeeNameKeys,
  nameCaseOptions,
  normalizeText,
  type NameCase,
} from "../inputNormalization";

function NumberInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const invalid =
    typeof value === "string" && typeof parseNumberInput(value) === "string";
  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        data-number-field={field.key}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        title={value == null ? undefined : String(value)}
        value={
          focused ? text : value == null ? "" : displayFieldValue(field, value)
        }
        onFocus={() => {
          setText(value == null ? "" : String(value));
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseNumberInput(event.target.value));
        }}
      />
      {invalid && (
        <small id={`${id}-error`} role="alert" className="field-error">
          Enter a valid number, for example 1,000.00.
        </small>
      )}
    </>
  );
}
export function ValueEditor({
  field,
  value,
  onChange,
  blind = false,
  clearable = true,
  nameCase,
  onNameCaseChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  blind?: boolean;
  clearable?: boolean;
  nameCase?: NameCase;
  onNameCaseChange?: (mode: NameCase) => void;
}) {
  const f = field;
  const id = useId();
  const [localNameCase, setLocalNameCase] = useState<NameCase>("upper");
  const caseMode = nameCase ?? localNameCase;
  const showClear = clearable && (blind || (value != null && value !== ""));
  const idError = governmentIdError(f, value);
  if (isJobField(f.key))
    return (
      <JobValueEditor
        field={f}
        value={value}
        onChange={onChange}
        clearable={clearable}
        blind={blind}
      />
    );
  return (
    <div className={`field ${fieldTextRole(f)}`}>
      {employeeNameKeys.has(f.key) ? (
        <div className="field-label-row">
          <label htmlFor={id}>
            {f.label}
            {f.required ? " *" : ""}
          </label>
          <div className="name-case-control">
            <SearchFilterPicker
              mode="single"
              label={`Change case for ${f.label}`}
              displayLabel="Aa"
              options={nameCaseOptions}
              value={[caseMode]}
              clearable={false}
              onChange={([selected]) => {
                const mode = selected as NameCase;
                setLocalNameCase(mode);
                onNameCaseChange?.(mode);
                if (typeof value === "string") {
                  const next = applyNameCase(value, mode);
                  if (next !== value) onChange(next);
                }
              }}
            />
          </div>
        </div>
      ) : (
        <label htmlFor={f.type === "select" ? undefined : id}>
          {f.label}
          {f.required ? " *" : ""}
        </label>
      )}
      {blind && (
        <small>
          Current value is restricted. Entering a value does not reveal it.
        </small>
      )}
      <div
        style={{
          maxWidth: valueWidth(
            f.type,
            f.options,
            f.validation?.government_id_digits,
            f.key,
            f.validation?.input_width,
          ),
        }}
        className={`value-control${f.type !== "select" ? " has-type-icon" : ""}${f.type === "checkbox" ? " checkbox-control" : ""}${showClear && f.type !== "select" ? " with-clear" : ""}${f.type === "long_text" ? " multiline" : ""}`}
      >
        {f.type !== "select" && (
          <span className="value-type-icon">
            <FieldTypeIcon type={f.type} size={14} />
          </span>
        )}
        {f.type === "checkbox" ? (
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        ) : f.type === "select" ? (
          <SearchFilterPicker
            mode="single"
            icon={fieldTypeIcons[f.type]}
            label={f.label}
            clearable={clearable}
            options={(f.options || []).map((id) => ({ id, label: id }))}
            value={value ? [String(value)] : []}
            onChange={(v) => onChange(v[0] ?? null)}
          />
        ) : f.type === "long_text" ? (
          <textarea
            id={id}
            maxLength={f.validation?.max_length ?? 10000}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => {
              const clean = normalizeText(e.target.value);
              if (clean !== e.target.value) onChange(clean);
            }}
          />
        ) : identifierGroups(f) ? (
          <IdentifierInput
            id={id}
            field={f}
            value={value}
            onChange={onChange}
          />
        ) : f.type === "decimal" ? (
          <NumberInput id={id} field={f} value={value} onChange={onChange} />
        ) : (
          <input
            id={id}
            min={f.type === "integer" ? f.validation?.min : undefined}
            onBlur={(e) => {
              if (!["integer", "decimal", "date"].includes(f.type)) {
                const text = normalizeText(e.target.value);
                const clean = employeeNameKeys.has(f.key)
                  ? applyNameCase(text, caseMode)
                  : text;
                if (clean !== e.target.value) onChange(clean);
              }
            }}
            max={f.type === "integer" ? f.validation?.max : undefined}
            type={
              f.type === "integer" || f.type === "decimal"
                ? "number"
                : f.type === "date"
                  ? "date"
                  : f.type === "email"
                    ? "email"
                    : f.type === "phone"
                      ? "tel"
                      : "text"
            }
            inputMode={
              f.validation?.government_id_digits ? "numeric" : undefined
            }
            aria-invalid={idError ? true : undefined}
            aria-describedby={idError ? `${id}-id-error` : undefined}
            value={String(value ?? "")}
            onChange={(e) => {
              if (employeeNameKeys.has(f.key)) {
                const input = e.target;
                const text = input.value;
                const start = input.selectionStart;
                const end = input.selectionEnd;
                input.value = applyNameCase(text, caseMode);
                if (start !== null && end !== null)
                  input.setSelectionRange(
                    applyNameCase(text.slice(0, start), caseMode).length,
                    applyNameCase(text.slice(0, end), caseMode).length,
                  );
              }
              onChange(
                (f.type === "integer" || f.type === "decimal") &&
                  e.target.value !== ""
                  ? Number(e.target.value)
                  : f.validation?.government_id_digits
                    ? normalizeGovernmentId(e.target.value)
                    : e.target.value,
              );
            }}
            maxLength={
              f.validation?.government_id_digits
                ? f.validation.government_id_digits + 8
                : (f.validation?.max_length ??
                  (f.type === "long_text" ? 10000 : 500))
            }
          />
        )}
        {idError && !identifierGroups(f) && (
          <small id={`${id}-id-error`} role="alert" className="field-error">
            {idError}
          </small>
        )}
        {showClear && f.type !== "select" && (
          <button
            type="button"
            className="value-clear"
            aria-label={`Clear ${f.label}`}
            title={`Clear ${f.label}`}
            onClick={(event) => {
              event.preventDefault();
              onChange(null);
            }}
          >
            <X size={15} aria-hidden />
          </button>
        )}
      </div>
      <small>{f.help_text}</small>
    </div>
  );
}
