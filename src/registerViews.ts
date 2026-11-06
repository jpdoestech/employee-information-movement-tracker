import {
  defaultColumns,
  reconcileLayout,
  type Field,
  type Filter,
  type Layout,
  type Option,
  type RegisterView,
} from "./domain";

export const managedDefaultColumns = [
  ...defaultColumns,
  "date_hired",
  "gender",
];

// Scope specificity wins first; an account rule wins at the same scope.
export function managedRegisterView(
  rules: RegisterView[],
  user: string,
  filter: Filter,
  options: Option[],
) {
  const clients = filter.clients.length
    ? filter.clients
    : filter.quick?.kind === "client"
      ? [filter.quick.id]
      : [];
  const branches = filter.branches.length
    ? filter.branches
    : filter.quick?.kind === "branch"
      ? [filter.quick.id]
      : [];
  const client =
    clients.length === 1
      ? options.find((o) => o.id === clients[0] && o.kind === "client")
      : undefined;
  const branch =
    client?.branch_id ||
    (!clients.length && branches.length === 1 ? branches[0] : undefined);
  const scope = (r: RegisterView) =>
    r.scope_type === "client" && client?.id === r.scope_id
      ? 3
      : r.scope_type === "branch" && branch === r.scope_id
        ? 2
        : r.scope_type === "head_office" &&
            filter.quick?.kind === "head_office" &&
            !clients.length &&
            !branches.length
          ? 2
          : r.scope_type === "all"
            ? 1
            : 0;
  return rules
    .filter((r) => (!r.user_id || r.user_id === user) && scope(r))
    .sort(
      (a, b) =>
        scope(b) - scope(a) ||
        Number(!!b.user_id) - Number(!!a.user_id) ||
        a.id.localeCompare(b.id),
    )[0];
}

export function applyRegisterView(
  layout: Layout,
  rule: RegisterView | undefined,
  fields: Field[],
): Layout {
  return reconcileLayout(rule ? { ...layout, ...rule.config } : layout, fields);
}
