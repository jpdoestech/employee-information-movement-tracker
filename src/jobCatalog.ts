import type { Field } from "./domain";

export function isJobField(key: string) {
  return key === "department" || key === "position";
}

export function officialJobMatch(value: unknown, choices: string[] = []) {
  const text = String(value ?? "").trim();
  return choices.find(
    (choice) => choice.trim().toLowerCase() === text.toLowerCase(),
  );
}

export function temporaryJobEntries(
  rows: { values: Record<string, unknown> }[],
  fields: Field[],
) {
  const entries = new Map<
    string,
    { id: string; field: Field; value: string }
  >();
  for (const field of fields.filter((field) => isJobField(field.key))) {
    for (const row of rows) {
      const value = String(row.values[field.key] ?? "").trim();
      if (!value || field.options?.includes(value)) continue;
      const id = JSON.stringify([field.key, value]);
      entries.set(id, { id, field, value });
    }
  }
  return [...entries.values()];
}

export function staffingVacancies(
  required: number | undefined,
  filled: number | null | undefined,
) {
  return required == null || filled == null
    ? null
    : Math.max(0, required - filled);
}

export function mapJobEntries<T extends { values: Record<string, unknown> }>(
  rows: T[],
  fields: Field[],
  mappings: Record<string, string>,
): T[] {
  return rows.map((row) => {
    const values = { ...row.values };
    for (const field of fields.filter((field) => isJobField(field.key))) {
      const id = JSON.stringify([
        field.key,
        String(values[field.key] ?? "").trim(),
      ]);
      const official = mappings[id];
      if (official && field.options?.includes(official))
        values[field.key] = official;
    }
    return { ...row, values };
  });
}
