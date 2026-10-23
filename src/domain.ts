export type Option = {
  id: string;
  label: string;
  context?: string;
  kind?: string;
  branch_id?: string;
  active?: boolean;
  row_version?: number;
  code?: string;
  field_type?: string;
};
export type Field = {
  id: string;
  key: string;
  label: string;
  group_id: string;
  form_group_id?: string | null;
  group_name: string;
  type: string;
  active: boolean;
  required: boolean;
  is_unique?: boolean;
  unique_scope?: "global" | "client";
  sensitivity: string;
  list_eligible: boolean;
  scope_mode: string;
  row_version: number;
  help_text?: string;
  options?: string[];
  validation?: Record<string, number>;
  default_value?: unknown;
  actions: string[];
};
export type Employee = {
  id: string;
  row_version: number;
  values: Record<string, unknown>;
};
export type Filter = {
  search: string;
  branches: string[];
  clients: string[];
  statuses: string[];
  quick: { kind: string; id: string } | null;
  predicates: { key: string; op: string; value: unknown }[];
  sort: string;
  direction: "asc" | "desc";
  limit: number;
  offset: number;
};
export type Layout = {
  columns: string[];
  pinned: string[];
  filter: Filter;
  showRowNumbers?: boolean;
};
export type Context = {
  profile: { id: string; display_name: string; role: string };
  today: string;
  revision: number;
  register_settings: {
    row_numbers_allowed: boolean;
    row_version: number;
    duplicate_name_threshold?: number;
  };
  fields: Field[];
  groups: {
    id: string;
    name: string;
    active: boolean;
    row_version: number;
    description?: string;
    display_order?: number;
    parent_group_id?: string | null;
    tab_name?: string;
    tab_order?: number;
  }[];
  capabilities: string[];
  module_permissions?: Record<string, boolean>;
  views: { id: string; name: string; config: Layout }[];
};
export const defaultFilter: Filter = {
  search: "",
  branches: [],
  clients: [],
  statuses: [],
  quick: null,
  predicates: [],
  sort: "employee_number",
  direction: "asc",
  limit: 25,
  offset: 0,
};
export const defaultColumns = [
  "employee_number",
  "name",
  "employee_category",
  "client_employee_number",
  "status",
  "position",
  "branch",
  "client",
];
export const movementTypes = [
  ["transfer", "Transfer"],
  ["deployment", "Deployment"],
  ["reassignment", "Reassignment"],
  ["return", "Return / Pull-out"],
  ["temporary", "Temporary Assignment"],
  ["position", "Promotion / Position Change"],
  ["status", "Employment Status Change"],
].map(([id, label]) => ({ id, label }));
export const statuses = ["Active", "Inactive", "Separated"].map((id) => ({
  id,
  label: id,
}));
export function reconcileLayout(layout: Layout, fields: Field[]): Layout {
  const known = new Set(
    fields
      .filter((f) => f.active && f.list_eligible && f.actions.includes("R"))
      .map((f) => f.key),
  );
  const columns = [...new Set(layout.columns)].filter((k) => known.has(k));
  return {
    ...layout,
    columns,
    pinned: [...new Set(layout.pinned)]
      .filter((k) => columns.includes(k))
      .slice(0, 2),
  };
}
export function moveColumn(columns: string[], key: string, delta: number) {
  const copy = [...columns],
    i = copy.indexOf(key),
    j = i + delta;
  if (i >= 0 && j >= 0 && j < copy.length)
    [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
// Move a non-contiguous selection as one block, preserving its relative order.
export function moveColumnGroup(
  columns: string[],
  selected: string[],
  target: string,
  after = false,
) {
  const keys = new Set(selected);
  if (keys.has(target) || !columns.includes(target)) return [...columns];
  const moving = columns.filter((key) => keys.has(key));
  if (!moving.length) return [...columns];
  const remaining = columns.filter((key) => !keys.has(key));
  const index = remaining.indexOf(target) + (after ? 1 : 0);
  return [...remaining.slice(0, index), ...moving, ...remaining.slice(index)];
}
export function literal(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /^\s*[=+\-@]/.test(s) ? `'${s}` : s;
}
export function csv(rows: Employee[], fields: Field[], columns: string[]) {
  const allowed = columns.flatMap((k) => {
    const f = fields.find((f) => f.key === k && f.actions.includes("R"));
    return f ? [f] : [];
  });
  const quote = (v: unknown) => `"${literal(v).replaceAll('"', '""')}"`;
  return (
    "\ufeff" +
    [
      allowed.map((f) => quote(f.label)).join(","),
      ...rows.map((r) => allowed.map((f) => quote(r.values[f.key])).join(",")),
    ].join("\r\n")
  );
}
export function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
