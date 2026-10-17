import type { Field, Filter } from "./domain";
type FilterField = Pick<Field, "type" | "key" | "options">;
export function filterKind(field: FilterField) {
  if (field.key === "status" || field.type === "select") return "choice";
  if (field.type === "checkbox") return "boolean";
  if (["integer", "decimal"].includes(field.type)) return "number";
  return field.type === "date" ? "date" : "text";
}
export function filterOperators(field: FilterField) {
  const kind = filterKind(field);
  return kind === "number" || kind === "date"
    ? ["eq", "before", "after", "between", "empty"]
    : kind === "choice"
      ? ["eq", "in", "empty"]
      : kind === "boolean"
        ? ["eq", "empty"]
        : ["contains", "eq", "empty"];
}
export function filterValue(
  field: FilterField,
  op: string,
  values: string[],
): unknown {
  if (!filterOperators(field).includes(op))
    throw new Error("Choose an operator for this column type.");
  if (op === "empty") return null;
  const kind = filterKind(field);
  const parse = (value: string | undefined): unknown => {
    if (!value?.trim()) throw new Error("Enter a filter value.");
    if (kind === "number") {
      const number = Number(value);
      if (
        !Number.isFinite(number) ||
        (field.type === "integer" && !Number.isInteger(number))
      )
        throw new Error("Enter a valid number for this column.");
      return number;
    }
    if (kind === "date") {
      const date = new Date(value + "T00:00:00Z");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        throw new Error("Enter a valid date.");
    }
    if (kind === "boolean") {
      if (!["true", "false"].includes(value))
        throw new Error("Choose Yes or No.");
      return value === "true";
    }
    if (
      kind === "choice" &&
      !(
        field.key === "status"
          ? ["Active", "Inactive", "Resigned", "Terminated"]
          : field.options || []
      ).includes(value)
    )
      throw new Error("Choose a listed value.");
    return value;
  };
  if (op === "in") {
    if (!values.length) throw new Error("Choose at least one value.");
    return [...new Set(values)].map(parse);
  }
  if (op === "between") {
    const range = [parse(values[0]), parse(values[1])] as [
      number | string,
      number | string,
    ];
    if (range[0] > range[1])
      throw new Error("The range start must not exceed its end.");
    return range;
  }
  return parse(values[0]);
}

// Synthetic preview parity only. Real queries evaluate authorized projections in SQL.
export function matchesFilterValue(
  value: unknown,
  predicate: Filter["predicates"][number],
) {
  if (predicate.op === "empty") return value == null || value === "";
  if (value == null) return false;
  const rhs = predicate.value;
  if (predicate.op === "eq") return value === rhs;
  if (predicate.op === "in") return Array.isArray(rhs) && rhs.includes(value);
  if (predicate.op === "contains")
    return String(value).toLowerCase().includes(String(rhs).toLowerCase());
  if (typeof value !== "string" && typeof value !== "number") return false;
  if (predicate.op === "between")
    return (
      Array.isArray(rhs) &&
      rhs.length === 2 &&
      value >= rhs[0] &&
      value <= rhs[1]
    );
  if (
    typeof rhs !== typeof value ||
    (typeof rhs !== "number" && typeof rhs !== "string")
  )
    return false;
  if (predicate.op === "before") return value < rhs;
  if (predicate.op === "after") return value > rhs;
  return false;
}
