import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testQuickFilters({ owner, test, as, m, id }) {
  const denied = (
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect,scope_type) select $1,id,'R','deny','all' from public.field_definitions where key='department' returning id",
      [id.viewer],
    )
  ).rows[0].id;
  const rpc = (user, name, p, request = randomUUID()) =>
    as(
      user,
      async (c) =>
        (
          await c.query(
            `select public.${name}($1${name === "set_quick_filters" ? ", $2" : ""}) r`,
            name === "set_quick_filters" ? [p, request] : [p],
          )
        ).rows[0].r,
    );
  const save = (p, request, user = id.sa) =>
    rpc(user, "set_quick_filters", p, request);
  const settings = (user) =>
    as(
      user,
      async (c) =>
        (await c.query("select public.register_settings() r")).rows[0].r,
    );
  await test("quick filters enforce superadmin, five fields, versions and idempotency without granting access", async () => {
    const initial = {
      user_id: id.viewer,
      filter_keys: ["department", "position"],
      expected_version: 0,
      reason: "Synthetic test",
    };
    await assert.rejects(save(initial, undefined, id.admin), /superadmin/);
    await assert.rejects(
      rpc(id.viewer, "quick_filter_settings", { user_id: id.sa }),
      /not authorized/,
    );
    await assert.rejects(
      save({
        ...initial,
        filter_keys: [
          "name",
          "status",
          "position",
          "department",
          "date_hired",
          "age",
        ],
      }),
      /five/,
    );
    await assert.rejects(
      save({ ...initial, filter_keys: ["position", "position"] }),
      /five/,
    );
    await assert.rejects(
      save({ ...initial, filter_keys: ["branch"] }),
      /unavailable/,
    );
    const request = randomUUID(),
      result = await save(initial, request);
    assert.equal(result.row_version, 1);
    assert.deepEqual(await save(initial, request), result);
    await assert.rejects(
      save({ ...initial, filter_keys: [] }, request),
      /different payload/,
    );
    await assert.rejects(save(initial), /changed/);
    const accessible = await settings(id.viewer);
    assert(Array.isArray(accessible.quick_filter_keys));
    assert(!accessible.quick_filter_keys.includes("department"));
    assert(
      accessible.quick_filter_keys.every((k) =>
        initial.filter_keys.includes(k),
      ),
    );
    const before = (
      await owner.query("select count(*) n from public.field_access_policies")
    ).rows[0].n;
    await save({ ...initial, filter_keys: null, expected_version: 1 });
    assert.equal((await settings(id.viewer)).quick_filter_keys, null);
    assert.equal(
      (await owner.query("select count(*) n from public.field_access_policies"))
        .rows[0].n,
      before,
    );
  });
  await test("field choices use current authorized values, branch boundaries and source-field permissions", async () => {
    const first = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: {
        first_name: "QUICK",
        last_name: "FILTER",
        department: "VISIBLE DEPT",
      },
    });
    await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b2,
      values: {
        first_name: "OUTSIDE",
        last_name: "FILTER",
        department: "OTHER DEPT",
      },
    });
    const choices = await rpc(id.sa, "filter_values", {
      key: "department",
      branches: [id.b1],
    });
    assert(choices.some((x) => x.label === "VISIBLE DEPT"));
    assert(!choices.some((x) => x.label === "OTHER DEPT"));
    for (const key of [
      "department",
      "position",
      "name",
      "age",
      "length_of_service",
    ]) {
      await owner.query("begin");
      await owner.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id.sa,
      ]);
      const expected = (
        await owner.query(
          "with v as (select app_private.project(e)->'values'->$1 value from public.employees e where deleted_at is null), choices as (select distinct value from v where value is not null and value<>'null'::jsonb order by value limit 100) select coalesce(jsonb_agg(jsonb_build_object('id',value::text,'label',value#>>'{}') order by value),'[]') r from choices",
          [key],
        )
      ).rows[0].r;
      await owner.query("rollback");
      assert.deepEqual(await rpc(id.sa, "filter_values", { key }), expected);
    }
    await assert.rejects(
      rpc(id.viewer, "filter_values", { key: "department" }),
      /unavailable/,
    );
    const deny = (
      await owner.query(
        "insert into public.field_access_policies(user_id,field_id,action,effect,scope_type) select $1,id,'R','deny','all' from public.field_definitions where key='birth_date' returning id",
        [id.admin],
      )
    ).rows[0].id;
    await assert.rejects(
      rpc(id.admin, "filter_values", { key: "age" }),
      /unavailable/,
    );
    await owner.query("delete from public.field_access_policies where id=$1", [
      deny,
    ]);
    assert(first.id);
  });
  await owner.query("delete from public.field_access_policies where id=$1", [
    denied,
  ]);
}
