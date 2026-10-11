import { useState } from "react";
import type { Field, Filter } from "../domain";
import { statuses } from "../domain";
import { filterKind, filterOperators, filterValue } from "../filterValues";
import { SearchFilterPicker } from "./SearchFilterPicker";

export function ColumnFilters({
  fields,
  filter,
  onChange,
  onError,
}: {
  fields: Field[];
  filter: Filter;
  onChange: (filter: Filter) => void;
  onError: (message: string) => void;
}) {
  const [key, setKey] = useState(""),
    [operator, setOperator] = useState("contains"),
    [values, setValues] = useState<string[]>([]);
  const field = fields.find((f) => f.key === key);
  const kind = field ? filterKind(field) : "text";
  const operations = field
    ? filterOperators(field)
    : ["contains", "eq", "empty"];
  const op = operations.includes(operator) ? operator : operations[0];
  const choices =
    kind === "boolean"
      ? [
          { id: "true", label: "Yes" },
          { id: "false", label: "No" },
        ]
      : field?.key === "status"
        ? statuses
        : (field?.options || []).map((id) => ({ id, label: id }));
  return (
    <div className="advanced-filter">
      <SearchFilterPicker
        mode="single"
        label="Filter column"
        options={fields.map((f) => ({
          id: f.key,
          label: f.label,
          context: f.group_name,
        }))}
        value={key ? [key] : []}
        onChange={(v) => {
          setKey(v[0] || "");
          setValues([]);
          setOperator("contains");
        }}
      />
      <SearchFilterPicker
        mode="single"
        label="Operator"
        clearable={false}
        options={operations.map((id) => ({
          id,
          label:
            id === "eq"
              ? "Equals"
              : id === "in"
                ? "Is any of"
                : id === "before" && kind === "number"
                  ? "Less than"
                  : id === "after" && kind === "number"
                    ? "Greater than"
                    : id.charAt(0).toUpperCase() + id.slice(1),
        }))}
        value={[op]}
        onChange={(v) => {
          setOperator(v[0] || operations[0]);
          setValues([]);
        }}
      />
      {op !== "empty" && (
        <div className="column-filter-values">
          {kind === "choice" || kind === "boolean" ? (
            <SearchFilterPicker
              mode={op === "in" ? "multiple" : "single"}
              label="Column filter value"
              options={choices}
              value={values}
              onChange={setValues}
            />
          ) : (
            (op === "between" ? [0, 1] : [0]).map((i) => (
              <label key={i}>
                <span>{op === "between" ? (i ? "To" : "From") : "Value"}</span>
                <input
                  aria-label={
                    op === "between"
                      ? i
                        ? "Range end"
                        : "Range start"
                      : "Column filter value"
                  }
                  type={
                    kind === "number"
                      ? "number"
                      : kind === "date"
                        ? "date"
                        : "text"
                  }
                  step={field?.type === "decimal" ? "any" : undefined}
                  value={values[i] || ""}
                  onChange={(e) =>
                    setValues((old) => {
                      const next = [...old];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                />
              </label>
            ))
          )}
        </div>
      )}
      <button
        disabled={!field}
        onClick={() => {
          try {
            const value = filterValue(field!, op, values);
            onChange({
              ...filter,
              predicates: [...filter.predicates, { key, op, value }],
              offset: 0,
            });
          } catch (e) {
            onError((e as Error).message);
          }
        }}
      >
        Add filter
      </button>
      {filter.predicates.map((p, i) => (
        <button
          key={i}
          aria-label={`Remove ${fields.find((f) => f.key === p.key)?.label || "unavailable column"} filter`}
          onClick={() =>
            onChange({
              ...filter,
              predicates: filter.predicates.filter((_, j) => i !== j),
              offset: 0,
            })
          }
        >
          {fields.find((f) => f.key === p.key)?.label || "Unavailable column"}{" "}
          {p.op} ×
        </button>
      ))}
    </div>
  );
}
