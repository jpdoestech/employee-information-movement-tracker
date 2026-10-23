export function normalizeText(value: string) {
  return value
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/ *\r?\n */g, "\n")
    .trim();
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
