import type { Employee } from "./domain";
import { combinedName, nameKeys } from "./employeeForm";
export type DuplicateReview = {
  items: (Employee & { similarity: number; candidate_name?: string })[];
  total: number;
  threshold: number;
  token?: string;
};

export function bulkDuplicateEmployees(
  employees: Employee[],
  rows: { id: string }[],
  patch: Record<string, unknown>,
  threshold: number,
): DuplicateReview {
  const proposed = employees.map((e) => {
    if (!rows.some((row) => row.id === e.id)) return e;
    const values = { ...e.values, ...patch };
    if (nameKeys.some((key) => Object.hasOwn(patch, key)))
      values.name = combinedName(values);
    return { ...e, row_version: e.row_version + 1, values };
  });
  const reviews = rows.map((row) => {
    const employee = proposed.find((e) => e.id === row.id)!;
    return {
      employee,
      review: duplicateEmployees(
        proposed,
        row.id,
        String(employee.values.name),
        employee.values.birth_date,
        threshold,
      ),
    };
  });
  return {
    items: reviews
      .flatMap(({ employee, review }) =>
        review.items.map((match) => ({
          ...match,
          id: `${employee.id}:${match.id}`,
          candidate_name: String(employee.values.name),
        })),
      )
      .slice(0, 20),
    total: reviews.reduce((sum, { review }) => sum + review.total, 0),
    threshold,
    token: JSON.stringify(
      reviews.map(({ employee, review }) => [employee.id, review.token]),
    ),
  };
}
export function nameSimilarity(left: string, right: string) {
  const normalize = (name: string) =>
    Array.from(
      name
        .normalize("NFKC")
        .toLowerCase()
        .replace(/ß/g, "ss")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim(),
    );
  const a = normalize(left),
    b = normalize(right);
  if (!a.length || !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current.push(
        Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    previous = current;
  }
  return 100 * (1 - previous[b.length] / Math.max(a.length, b.length));
}
export function duplicateEmployees(
  employees: Employee[],
  id: string | undefined,
  name: string,
  birthday: unknown,
  threshold: number,
): DuplicateReview {
  if (!birthday || !name.trim()) return { items: [], total: 0, threshold };
  const matches = employees
    .filter((e) => e.id !== id && e.values.birth_date === birthday)
    .map((e) => ({
      ...e,
      similarity: nameSimilarity(name, String(e.values.name || "")),
    }))
    .filter((e) => e.similarity >= threshold)
    .sort((a, b) => a.id.localeCompare(b.id));
  const token = JSON.stringify([
    name,
    birthday,
    threshold,
    matches.map((e) => [
      e.id,
      e.row_version,
      e.values.name,
      e.values.branch,
      e.values.client,
      e.values.department,
      e.values.position,
    ]),
  ]);
  return {
    items: matches.slice(0, 20),
    total: matches.length,
    threshold,
    token,
  };
}
