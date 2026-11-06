import type { Context, Field } from "./domain";
import { profileDefinitions } from "./profileFields";
import { governmentDefinitions } from "./governmentIds";
import { addressDefinitions } from "./address/addressFields";
import { normalizeText } from "./inputNormalization";

export function fieldGroupPath(groups: Context["groups"], id: string) {
  const group = groups.find((g) => g.id === id);
  if (!group) return "Group";
  const parent = groups.find((g) => g.id === group.parent_group_id);
  return parent ? `${parent.name} / ${group.name}` : group.name;
}
export function orderedFieldGroups(groups: Context["groups"]) {
  return [...groups].sort((a, b) => {
    const rootA = groups.find((g) => g.id === a.parent_group_id) || a;
    const rootB = groups.find((g) => g.id === b.parent_group_id) || b;
    return (
      (rootA.tab_order ?? 0) - (rootB.tab_order ?? 0) ||
      rootA.name.localeCompare(rootB.name) ||
      Number(!!a.parent_group_id) - Number(!!b.parent_group_id) ||
      (a.display_order ?? 0) - (b.display_order ?? 0)
    );
  });
}

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
    typeof values.last_name === "string" ? normalizeText(values.last_name) : "",
    [values.first_name, values.middle_name, values.suffix]
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => normalizeText(String(v)))
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}
export function employeeTabs(groups: Context["groups"], fields: Field[]) {
  const allowed = new Set(
    fields
      .filter((f) => f.active && f.actions.length)
      .map((f) => f.form_group_id || f.group_id),
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
    const parent = groups.find(
      (candidate) => candidate.id === group.parent_group_id,
    );
    if (parent && !parent.active) continue;
    const root = parent || group;
    const hierarchical =
      !!parent ||
      groups.some((candidate) => candidate.parent_group_id === group.id);
    const name = hierarchical ? root.name : root.tab_name || root.name;
    const tab = tabs.get(name) ?? {
      name,
      order: root.tab_order ?? 0,
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
            f.active &&
            f.actions.length &&
            tab.groups.includes(f.form_group_id || f.group_id),
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
