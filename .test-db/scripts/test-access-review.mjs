import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testAccessReview({
  owner,
  test,
  m,
  as,
  id,
  today,
  date,
}) {
  const user = randomUUID(),
    group = randomUUID(),
    normal = randomUUID(),
    restricted = randomUUID();
  await owner.query("insert into auth.users values($1)", [user]);
  await owner.query(
    "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic access review','admin')",
    [user],
  );
  await owner.query(
    "insert into public.field_groups(id,name) values($1,'Synthetic access review')",
    [group],
  );
  await owner.query(
    "insert into public.field_definitions(id,group_id,key,label,type,sensitivity) values($1,$2,'review_public','Review public','short_text','normal'),($3,$2,'review_private','Review private','short_text','restricted')",
    [normal, group, restricted],
  );
  await owner.query(
    "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,$2,a,'allow',true from unnest(array['R','U']) a",
    [user, group],
  );
  const payload = {
    user_id: user,
    scope_type: "branch",
    scope_id: id.b1,
    include_descendants: false,
    actions: ["R", "U"],
    starts_on: today,
    reason: "Synthetic access review",
  };
  const review = (op, p, who = id.sa, role = "authenticated") =>
    as(
      who,
      (c) =>
        c
          .query("select public.access_change_preview($1,$2) r", [op, p])
          .then((r) => r.rows[0].r),
      role,
    );
  const state = async () =>
    (
      await owner.query(`select revision,
    (select count(*) from public.user_scope_grants) scopes,
    (select count(*) from public.field_access_policies) policies,
    (select count(*) from public.audit_log) audit,
    (select count(*) from public.sync_outbox) outbox,
    (select count(*) from public.write_requests) requests from public.system_state`)
    ).rows[0];

  await test("access review is trusted-only and exposes no alternate private API", async () => {
    for (const who of [id.admin, id.viewer])
      await assert.rejects(review("scope", payload, who), { code: "42501" });
    await assert.rejects(review("scope", payload, null, "anon"), {
      code: "42501",
    });
    await assert.rejects(
      review("profile", payload),
      /Unsupported access review/,
    );
    await assert.rejects(
      as(id.sa, (c) =>
        c.query("select app_private.access_review_snapshot($1,'[]')", [user]),
      ),
      { code: "42501" },
    );
  });
  await test("access review rolls back grants, audit, outbox, revision and idempotency records", async () => {
    const before = await state();
    const result = await review("scope", payload);
    assert.deepEqual(await state(), before);
    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0].id, id.b1);
    assert(
      result.changes.some(
        (c) => c.key === "_scope" && c.action === "R" && c.after,
      ),
    );
    assert(
      result.changes.some(
        (c) => c.key === "review_public" && c.action === "U" && c.after,
      ),
    );
    assert(!result.changes.some((c) => c.restricted));
    assert(!JSON.stringify(result).includes("custom_values"));
    await as(id.sa, async (c) => {
      await c.query("select public.access_change_preview('scope',$1)", [
        payload,
      ]);
      assert.equal((await c.query("select auth.uid() id")).rows[0].id, id.sa);
      await c.query("select public.permission_preview($1)", [
        { user_id: user, target_level: "branch", branch_id: id.b1 },
      ]);
    });
  });
  await test("scope review keeps Head Office, branch clients, scheduled grants and inactive accounts distinct", async () => {
    const inclusive = await review("scope", {
      ...payload,
      include_descendants: true,
    });
    assert(inclusive.targets.some((t) => t.id === id.c1));
    assert(!inclusive.targets.some((t) => t.id === id.b2));
    const head = await review("scope", {
      ...payload,
      scope_type: "head_office",
      scope_id: null,
      include_descendants: false,
    });
    assert.deepEqual(
      head.targets.map((t) => t.id),
      ["head_office"],
    );
    assert.deepEqual(
      (await review("scope", { ...payload, starts_on: date(1) })).changes,
      [],
    );
    await owner.query(
      "update public.user_profiles set active=false where id=$1",
      [user],
    );
    assert.deepEqual((await review("scope", payload)).changes, []);
    await owner.query(
      "update public.user_profiles set active=true where id=$1",
      [user],
    );
  });
  await test("reviewed permission saves reject stale revisions and retain payload-bound replay", async () => {
    const result = await review("scope", payload);
    const request = randomUUID(),
      p = { ...payload, review_revision: result.revision, review_date: today };
    await assert.rejects(m(id.sa, "scope", { ...p, review_date: date(-1) }), {
      code: "40001",
    });
    const saved = await m(id.sa, "scope", p, request);
    assert.deepEqual(await m(id.sa, "scope", p, request), saved);
    await assert.rejects(m(id.sa, "scope", { ...p, actions: ["R"] }), {
      code: "40001",
    });
    await assert.rejects(
      m(id.sa, "scope", { ...p, actions: ["R"] }, request),
      /different payload/,
    );
    const revoked = await review("scope", {
      id: saved.id,
      remove: true,
      reason: payload.reason,
    });
    assert(
      revoked.changes.some(
        (c) => c.key === "review_public" && c.before && !c.after,
      ),
    );
    assert.equal(revoked.targets.length, 1);
  });
  await test("field review reports restricted grants and access restored by revoking a deny", async () => {
    const common = {
      user_id: user,
      scope_type: "branch",
      scope_id: id.b1,
      actions: ["R"],
      reason: payload.reason,
    };
    const before = await state();
    const result = await review("policy_batch", {
      ...common,
      field_id: restricted,
      effect: "allow",
    });
    assert(
      result.changes.some(
        (c) => c.key === "review_private" && c.restricted && c.after,
      ),
    );
    assert.deepEqual(await state(), before);
    const denied = await m(id.sa, "policy", {
      ...common,
      actions: undefined,
      action: "R",
      field_id: normal,
      effect: "deny",
    });
    const restored = await review("policy", {
      id: denied.id,
      remove: true,
      reason: payload.reason,
    });
    assert(restored.changes.some((c) => c.key === "review_public" && c.after));
    await owner.query(
      "update public.user_profiles set role='viewer' where id=$1",
      [user],
    );
    const viewer = await review("scope", {
      ...payload,
      include_descendants: true,
    });
    assert(!viewer.changes.some((c) => c.action !== "R"));
  });
  await test("revoking a role policy reviews every matching account without changing grants", async () => {
    const policy = randomUUID();
    await owner.query(
      "insert into public.field_access_policies(id,role,field_id,action,effect,scope_type,scope_id) values($1,'viewer',$2,'R','allow','branch',$3)",
      [policy, restricted, id.b1],
    );
    const before = await state();
    const result = await review("policy", {
      id: policy,
      remove: true,
      reason: payload.reason,
    });
    const count = (
      await owner.query(
        "select count(*)::int n from public.user_profiles where role='viewer'",
      )
    ).rows[0].n;
    assert.equal(result.user_count, count);
    assert(
      result.changes.some(
        (c) =>
          c.user_id === user &&
          c.key === "review_private" &&
          c.before &&
          !c.after,
      ),
    );
    assert.deepEqual(await state(), before);
  });
}
