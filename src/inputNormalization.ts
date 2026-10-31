export function normalizeText(value: string) {
  return value
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/ *\r?\n */g, "\n")
    .trim();
}

export const employeeNameKeys = new Set([
  "name",
  "last_name",
  "first_name",
  "middle_name",
  "suffix",
]);

export type NameCase = "upper" | "proper" | "user_defined";
export const nameCaseOptions = [
  { id: "upper", label: "UPPER CASE" },
  { id: "proper", label: "PROPER CASE" },
  { id: "user_defined", label: "USER DEFINED" },
];
export function applyNameCase(value: string, mode: NameCase) {
  if (mode === "upper") return value.toUpperCase();
  if (mode === "proper")
    return value
      .toLowerCase()
      .replace(/\p{L}[\p{L}\p{M}]*/gu, (word) =>
        word.replace(/^\p{L}/u, (letter) => letter.toUpperCase()),
      );
  return value;
}

// Credentials, opaque review tokens and saved filter literals must stay exact.
const exactKeys = new Set([
  "password",
  "new_password",
  "current_password",
  "token",
  "access_token",
  "refresh_token",
  "duplicate_review",
  "config",
]);
export function normalizeInputs<T>(value: T): T {
  if (typeof value === "string") return normalizeText(value) as T;
  if (Array.isArray(value)) return value.map(normalizeInputs) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        exactKeys.has(key) ? item : normalizeInputs(item),
      ]),
    ) as T;
  return value;
}
