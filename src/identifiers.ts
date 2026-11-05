import type { Field } from "./domain";
export const normalizeIdentifier = (value: string) =>
  value.replace(/[ -]/g, "");
export function identifierGroups(
  field: Pick<Field, "type" | "key" | "validation">,
) {
  if (field.type === "phone") return [4, 3, 4];
  return (
    {
      bir_tin: [3, 3, 3],
      sss_number: [2, 7, 1],
      philhealth_pin: [2, 9, 1],
      pagibig_mid: [4, 4, 4],
    } as Record<string, number[]>
  )[field.key];
}
export function formatIdentifier(value: unknown, groups: number[]) {
  const text = normalizeIdentifier(String(value ?? ""));
  if (!/^\d*$/.test(text)) return String(value ?? "");
  const parts: string[] = [];
  let offset = 0;
  for (const size of groups) {
    if (offset >= text.length) break;
    parts.push(text.slice(offset, offset + size));
    offset += size;
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return parts.join("-");
}
export function mobileError(value: unknown) {
  if (value == null || value === "") return "";
  return typeof value === "string" &&
    /^09\d{9}$/.test(normalizeIdentifier(value))
    ? ""
    : "Mobile must start with 09 and contain 11 digits (0912-345-6789).";
}
