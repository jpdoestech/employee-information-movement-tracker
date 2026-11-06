import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testParentInheritance({
  owner,
  test,
  m,
  q,
  as,
  id,
  revision,
}) {
  const user = randomUUID(),
    parent = randomUUID(),
    child = randomUUID(),
    other = randomUUID(),
    normal = randomUUID(),
    restricted = randomUUID(),
    placed = randomUUID();
  await owner.query("insert into auth.users values($1)", [user]);
  await owner.query(
    "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic parent inheritance','admin')",
    [user],
  );
  await owner.query(
    "insert into public.field_groups(id,name) values($1,'Synthetic permission parent'),($2,'Synthetic unrelated parent')",
    [parent, other],
  );
  await owner.query(
    "insert into public.field_groups(id,name,parent_group_id) values($1,'Synthetic permission child',$2)",
    [child, parent],
  );
  await owner.query(
    "insert into public.field_definitions(id,group_id,key,label,type,sensitivity,form_group_id) values($1,$2,'parent_normal','Parent normal','short_text','normal',null),($3,$2,'parent_restricted','Parent restricted','short_text','restricted',null),($4,$5,'parent_placement_only','Parent placement only','short_text','normal',$2)",
    [normal, child, restricted, placed, other],
  );
  await owner.query(
    "insert into public.user_scope_grants(user_id,scope_type,scope_id,actions) values($1,'branch',$2,array['C','R','U','D'])",
    [user, id.b1],
  );
  await owner.query(
    "insert into public.capability_grants select $1,c from unnest(array['employee_create','bulk_update','schema_manage']) c",
    [user],
  );
  await owner.query(
    "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,$2,a,'allow',true from unnest(array['C','R','U','D']) a",
    [user, id.core],
  );
  const policy = async (group, action, effect, extra = {}) => {
    const result = await owner.query(
      "insert into public.field_access_policies(user_id,group_id,field_id,action,effect,inherit_new,scope_type,scope_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
      [
        user,
        extra.field ? null : group,
        extra.field || null,
        action,
        effect,
        extra.inherit ?? true,
        extra.scope || "all",
        extra.scope_id || null,
      ],
    );
    return result.rows[0].id;
  };
  const remove = async (pid) =>
    owner.query("delete from public.field_access_policies where id=$1", [pid]);
  const grid = async (key, action = "R", branch = id.b1) =>
    as(id.sa, async (c) => {
      const result = (
        await c.query("select public.effective_access($1) r", [
          { user_id: user, target_level: "branch", branch_id: branch },
        ])
      ).rows[0].r;
      return result.fields.find((f) => f.key === key).actions[action];
    });
  const record = (
    await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: {
        last_name: "Parent",
        first_name: "Example",
        parent_normal: "Visible parent value",
        parent_restricted: "Restricted value",
        parent_placement_only: "Hidden placement value",
      },
    })
  ).id;
  await test("parent group policies inherit to child fields across projection, create, update, import and export", async () => {
    assert.equal((await grid("parent_normal")).allowed, false);
    for (const action of ["C", "R", "U", "D"])
      await policy(parent, action, "allow");
    const effective = await grid("parent_normal");
    assert.equal(effective.allowed, true);
    assert.match(
      effective.reason,
      /Parent group Synthetic permission parent allow/,
    );
    assert.equal(effective.policy.group_id, parent);
    const detail = await q(user, "employee", { id: record });
    assert.equal(detail.employee.values.parent_normal, "Visible parent value");
    assert.equal(detail.employee.values.parent_restricted, undefined);
    assert.equal(detail.employee.values.parent_placement_only, undefined);
    await m(user, "employee_update", {
      id: record,
      expected_version: await revision(record),
      values: { parent_normal: "Updated" },
    });
    await owner.query(
      "insert into app_private.access_overrides values($1,'employees','import','allow')",
      [user],
    );
    await m(user, "employee_import", {
      target_level: "branch",
      branch_id: id.b1,
      rows: [
        {
          values: {
            last_name: "Parent",
            first_name: "Imported",
            parent_normal: "Imported child value",
          },
        },
      ],
    });
    const exported = await as(user, (c) =>
      c
        .query("select public.export_employees('{}') r")
        .then((r) => r.rows[0].r),
    );
    assert(
      exported.items.some(
        (e) => e.values.parent_normal === "Imported child value",
      ),
    );
    assert.equal((await grid("parent_normal", "R", id.b2)).allowed, false);
  });
  await test("parent and child DENY override individual and role allows independently for every action", async () => {
    for (const action of ["C", "R", "U", "D"]) {
      const fieldAllow = await policy(null, action, "allow", { field: normal });
      const parentDeny = await policy(parent, action, "deny", {
        scope: "branch",
        scope_id: id.b1,
      });
      assert.equal((await grid("parent_normal", action)).allowed, false);
      await remove(parentDeny);
      await remove(fieldAllow);
    }
    const fieldAllow = await policy(null, "R", "allow", { field: normal });
    const parentDeny = await policy(parent, "R", "deny", {
      scope: "branch",
      scope_id: id.b1,
    });
    assert.equal(
      (await q(user, "employee", { id: record })).employee.values.parent_normal,
      undefined,
    );
    await remove(parentDeny);
    const childDeny = await policy(child, "R", "deny");
    assert.equal((await grid("parent_normal")).allowed, false);
    await remove(childDeny);
    await remove(fieldAllow);
    const fieldDeny = await policy(null, "U", "deny", { field: normal });
    assert.equal((await grid("parent_normal", "R")).allowed, true);
    assert.equal((await grid("parent_normal", "U")).allowed, false);
    await assert.rejects(
      m(user, "employee_update", {
        id: record,
        expected_version: await revision(record),
        values: { parent_normal: "Denied" },
      }),
      /authorized/,
    );
    await remove(fieldDeny);
  });
  await test("restricted child fields still require explicit field grants and parent DENY still wins", async () => {
    assert.equal((await grid("parent_restricted")).allowed, false);
    const allow = await policy(null, "R", "allow", { field: restricted });
    assert.equal((await grid("parent_restricted")).allowed, true);
    const deny = await policy(parent, "R", "deny", {
      scope: "branch",
      scope_id: id.b1,
    });
    assert.equal((await grid("parent_restricted")).allowed, false);
    await remove(deny);
    await remove(allow);
  });
  await test("role-derived parents work, role DENY wins, and same-group policies have accurate provenance", async () => {
    await owner.query(
      "insert into app_private.access_roles values('parent_test','Synthetic parent role')",
    );
    await owner.query(
      "insert into app_private.access_memberships values($1,'parent_test')",
      [user],
    );
    const rolePolicy = (
      await owner.query(
        "insert into public.field_access_policies(role,group_id,action,effect,inherit_new) values('parent_test',$1,'R','deny',true) returning id",
        [parent],
      )
    ).rows[0].id;
    assert.equal((await grid("parent_normal")).allowed, false);
    await owner.query(
      "update public.field_access_policies set effect='allow' where id=$1",
      [rolePolicy],
    );
    const direct = await policy(child, "R", "allow");
    const own = await grid("parent_normal");
    assert.equal(own.policy.group_id, child);
    assert.match(own.reason, /Group allow/);
    await remove(direct);
    await owner.query(
      "delete from public.field_access_policies where user_id=$1 and group_id=$2 and action='R'",
      [user, parent],
    );
    assert.equal((await grid("parent_normal")).policy.role, "parent_test");
    await owner.query("delete from public.field_access_policies where id=$1", [
      rolePolicy,
    ]);
    await policy(parent, "R", "allow");
  });
  await test("inherit_new, inactive parents, field applicability and form placement do not bypass restrictions", async () => {
    await owner.query(
      "update public.field_access_policies set inherit_new=false where user_id=$1 and group_id=$2 and action='R'",
      [user, parent],
    );
    assert.equal((await grid("parent_normal")).allowed, false);
    await owner.query(
      "update public.field_access_policies set inherit_new=true where user_id=$1 and group_id=$2 and action='R'",
      [user, parent],
    );
    await owner.query(
      "update public.field_groups set active=false where id=$1",
      [parent],
    );
    assert.equal((await grid("parent_normal")).allowed, false);
    await owner.query(
      "update public.field_groups set active=true where id=$1",
      [parent],
    );
    await owner.query(
      "update public.field_definitions set scope_mode='selected' where id=$1",
      [normal],
    );
    assert.equal((await grid("parent_normal")).allowed, false);
    await owner.query(
      "update public.field_definitions set scope_mode='all' where id=$1",
      [normal],
    );
    assert.equal((await grid("parent_placement_only")).allowed, false);
  });
  await test("permission reviews include inherited child changes without persisting the draft", async () => {
    const p = {
      user_id: user,
      fields: [
        { group_id: parent, action: "R", effect: "deny", inherit_new: true },
      ],
      scope_type: "all",
      scope_id: null,
      reason: "Synthetic inherited access review",
    };
    const review = await as(id.sa, (c) =>
      c
        .query("select public.access_change_preview('access_matrix',$1) r", [p])
        .then((r) => r.rows[0].r),
    );
    assert(
      review.changes.some(
        (change) =>
          change.key === "parent_normal" &&
          change.action === "R" &&
          change.before === true &&
          change.after === false,
      ),
    );
    assert.equal((await grid("parent_normal")).allowed, true);
  });
  await test("ordinary schema editors cannot reparent groups to gain inherited permissions or call private predecessors", async () => {
    await assert.rejects(
      m(user, "group", {
        id: child,
        expected_version: 1,
        name: "Synthetic permission child",
        parent_group_id: other,
      }),
      /Only a Superadmin/,
    );
    await assert.rejects(
      as(user, (c) =>
        c.query(
          "select * from app_private.field_policy_grid_before_parent_inheritance('branch',$1,null)",
          [id.b1],
        ),
      ),
      /permission denied/,
    );
    assert.equal((await grid("parent_normal")).allowed, true);
  });
  await test("private predecessors prove rollback restores independent permissions without changing employee data", async () => {
    const original = (
      await owner.query(
        "select pg_get_functiondef('app_private.field_policy_grid_before_parent_inheritance(text,uuid,uuid,text[])'::regprocedure) definition",
      )
    ).rows[0].definition;
    await owner.query("begin");
    try {
      await owner.query(
        original.replace(
          "FUNCTION app_private.field_policy_grid_before_parent_inheritance(",
          "FUNCTION app_private.field_policy_grid(",
        ),
      );
      await owner.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      assert.equal(
        (
          await owner.query(
            "select allowed from app_private.field_policy_grid('branch',$1,null,array['parent_normal']) where key='parent_normal' and action='R'",
            [id.b1],
          )
        ).rows[0].allowed,
        false,
      );
    } finally {
      await owner.query("rollback");
    }
    assert.equal((await grid("parent_normal")).allowed, true);
    assert.equal(
      (await q(id.sa, "employee", { id: record })).employee.values
        .parent_normal,
      "Updated",
    );
  });
}
