import type { Context, Field } from "./domain";
import { profileDefinitions } from "./profileFields";
import { governmentDefinitions } from "./governmentIds";
import { addressDefinitions } from "./address/addressFields";

const profileKeys = new Set([
  "employee_number",
  "client_employee_number",
  "name",
  "last_name",
  "first_name",
  "middle_name",
  "suffix",
  "status",
  "position",
  "branch",
  "client",
  "email",
  "phone",
  ...profileDefinitions.map((f) => f.key),
]);
const governmentKeys = new Set(governmentDefinitions.map((f) => f.key));
const locationKeys = new Set(addressDefinitions.map((f) => f.key));
export function defaultEntryPriority(key: string) {
  return profileKeys.has(key)
    ? 0
    : governmentKeys.has(key)
      ? 1
      : locationKeys.has(key)
        ? 2
        : 3;
}

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
  function priority(tab: { name: string; groups: string[] }) {
    const byName =
      tab.name === "Profile"
        ? 0
        : ["Government ID", "Government IDs"].includes(tab.name)
          ? 1
          : tab.name === "Address"
            ? 2
            : 3;
    return Math.min(
      byName,
      ...fields
        .filter(
          (f) =>
            f.active && f.actions.length && tab.groups.includes(f.group_id),
        )
        .map((f) => defaultEntryPriority(f.key)),
    );
  }
  return [...tabs.values()].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      a.order - b.order ||
      a.name.localeCompare(b.name),
  );
}
