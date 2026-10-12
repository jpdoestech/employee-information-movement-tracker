// Stable widths by field purpose; available column width always remains the upper bound.
export function choiceWidth(labels: string[]) {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  // Reserve space for the leading icon, chevron, clear control and padding.
  return `${Math.min(44, Math.max(22, longest + 12))}ch`;
}
export function valueWidth(
  type: string,
  labels: string[] = [],
  digits?: number,
  key?: string,
  configuredWidth?: number,
) {
  if (
    configuredWidth &&
    Number.isInteger(configuredWidth) &&
    configuredWidth >= 10 &&
    configuredWidth <= 80
  )
    return `${Math.max(configuredWidth, type === "date" ? 28 : digits ? digits + 16 : type === "select" ? parseInt(choiceWidth(labels), 10) : 10)}ch`;
  if (["last_name", "first_name", "middle_name"].includes(key ?? ""))
    return "30ch";
  if (key === "suffix") return "10ch";
  if (key === "department") return "26ch";
  if (key === "position") return "28ch";
  if (digits) return `${Math.max(26, digits + 16)}ch`;
  if (type === "date") return "28ch";
  if (type === "integer" || type === "decimal") return "24ch";
  if (type === "phone") return "28ch";
  if (type === "email") return "40ch";
  if (type === "select") return choiceWidth(labels);
  return type === "short_text" ? "32ch" : "100%";
}
