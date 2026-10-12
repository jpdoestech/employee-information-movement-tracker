// Stable widths by field purpose; available column width always remains the upper bound.
export function choiceWidth(labels: string[]) {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  return `${Math.min(36, Math.max(18, longest + 7))}ch`;
}
export function valueWidth(
  type: string,
  labels: string[] = [],
  digits?: number,
  key?: string,
) {
  if (["last_name", "first_name", "middle_name"].includes(key ?? ""))
    return "24ch";
  if (key === "suffix") return "10ch";
  if (key === "department") return "26ch";
  if (key === "position") return "28ch";
  if (digits) return `${Math.max(20, digits + 8)}ch`;
  if (type === "date") return "20ch";
  if (type === "integer" || type === "decimal") return "24ch";
  if (type === "phone") return "28ch";
  if (type === "email") return "40ch";
  if (type === "select") return choiceWidth(labels);
  return type === "short_text" ? "32ch" : "100%";
}
