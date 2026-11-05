import { describe, expect, it } from "vitest";
import { scopeDraftChanges, type ScopeGrant } from "../../src/scopeDraft";

const all: ScopeGrant = {
  id: "saved",
  scope_type: "all",
  scope_id: null,
  include_descendants: false,
  actions: ["R", "U"],
  starts_on: "2026-01-01",
  ends_on: null,
  active: true,
};
describe("complete organization selection", () => {
  it("leaves unchanged grants and schedules intact", () => {
    expect(scopeDraftChanges([all], [{ ...all, actions: ["U", "R"] }])).toEqual(
      { scope_grants: [], revoke_scopes: [] },
    );
  });
  it("replaces broad access with only the selected clients and omits draft IDs", () => {
    const clients = ["c1", "c2"].map((id) => ({
      ...all,
      id,
      scope_type: "client",
      scope_id: id,
      actions: ["R"],
    }));
    const change = scopeDraftChanges([all], clients);
    expect(change.revoke_scopes).toEqual([all.id]);
    expect(change.scope_grants.map((g) => g.scope_id)).toEqual(["c1", "c2"]);
    expect(change.scope_grants.every((g) => !("id" in g))).toBe(true);
  });
  it("replaces edited actions or dates atomically and allows removing every grant", () => {
    expect(
      scopeDraftChanges([all], [{ ...all, active: false }]).revoke_scopes,
    ).toEqual([all.id]);
    expect(scopeDraftChanges([all], []).scope_grants).toEqual([]);
    expect(scopeDraftChanges([all], []).revoke_scopes).toEqual([all.id]);
  });
});
