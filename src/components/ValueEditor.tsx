import { SearchFilterPicker } from "./SearchFilterPicker";
import type { Field } from "../domain";
export function ValueEditor({
  field,
  value,
  onChange,
  blind = false,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  blind?: boolean;
}) {
  const f = field;
  return (
    <label className="field">
      <span>
        {f.label}
        {f.required ? " *" : ""}
      </span>
      {blind && (
        <small>
          Current value is restricted. Entering a value does not reveal it.
        </small>
      )}
      {f.type === "checkbox" ? (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : f.type === "select" ? (
        <SearchFilterPicker
          mode="single"
          label={f.label}
          options={(f.options || []).map((id) => ({ id, label: id }))}
          value={value ? [String(value)] : []}
          onChange={(v) => onChange(v[0] ?? null)}
        />
      ) : f.type === "long_text" ? (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
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
          step={f.type === "decimal" ? "any" : undefined}
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              (f.type === "integer" || f.type === "decimal") &&
                e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value,
            )
          }
          maxLength={f.type === "long_text" ? 10000 : 500}
        />
      )}
      <small>{f.help_text}</small>
    </label>
  );
}
