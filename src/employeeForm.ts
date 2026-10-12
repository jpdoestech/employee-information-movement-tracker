import type { Context, Field } from "./domain";

export const nameKeys = [
  "last_name",
  "first_name",
  "middle_name",
  "suffix",
] as const;
export const nameLabels = ["Last Name", "First Name", "Middle Name", "Suffix"];
export function combinedName(values: Record<string, unknown>) {
  return [
    typeof values.last_name === "string" ? values.last_name.trim() : "",
    [values.first_name, values.middle_name, values.suffix]
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => String(v).trim())
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}
export function employeeTabs(groups: Context["groups"], fields: Field[]) {
  const allowed = new Set(
    fields.filter((f) => f.active && f.actions.length).map((f) => f.group_id),
  );
  const tabs = new Map<
    string,
    { name: string; order: number; groups: string[] }
  >();
  for (const group of [...groups].sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      a.id.localeCompare(b.id),
  )) {
    if (!group.active || !allowed.has(group.id)) continue;
    const name = group.tab_name || group.name;
    const tab = tabs.get(name) ?? {
      name,
      order: group.tab_order ?? 0,
      groups: [],
    };
    tab.groups.push(group.id);
    tabs.set(name, tab);
  }
  return [...tabs.values()].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );
}
