export type ScopeGrant = {
  id: string;
  scope_type: string;
  scope_id: string | null;
  include_descendants: boolean;
  actions: string[];
  starts_on: string;
  ends_on: string | null;
  active?: boolean;
};
export function scopeLocation(
  grant: Pick<ScopeGrant, "scope_type" | "scope_id">,
) {
  return grant.scope_id || grant.scope_type;
}
function specification(grant: ScopeGrant) {
  return {
    scope_type: grant.scope_type,
    scope_id: grant.scope_id || null,
    include_descendants:
      grant.scope_type === "branch" && grant.include_descendants,
    actions: [...grant.actions].sort(),
    starts_on: grant.starts_on,
    ends_on: grant.ends_on || null,
    active: grant.active !== false,
  };
}
export function scopeDraftChanges(saved: ScopeGrant[], draft: ScopeGrant[]) {
  const equal = (a: ScopeGrant, b: ScopeGrant) =>
    JSON.stringify(specification(a)) === JSON.stringify(specification(b));
  return {
    scope_grants: draft
      .filter(
        (next) => !saved.some((old) => old.id === next.id && equal(old, next)),
      )
      .map(specification),
    revoke_scopes: saved
      .filter(
        (old) => !draft.some((next) => next.id === old.id && equal(old, next)),
      )
      .map((old) => old.id),
  };
}
