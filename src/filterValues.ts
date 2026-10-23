import type { Filter } from "./domain";

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
