import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testDerivedColumns({ owner, test, as, q, m, id, today }) {
  let employee;
  await test("calculated columns are list eligible, read only and preserve source values", async () => {
    employee = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: {
        first_name: "CALCULATED",
        last_name: "COLUMNS",
        birth_date: "2000-02-29",
        date_hired: "2020-01-31",
      },
    });
    const detail = await q(id.sa, "employee", { id: employee.id });
    const values = detail.employee.values;
    const [year, month, day] = today.split("-").map(Number);
    assert.equal(
      values.age,
      year - 2000 - Number(month < 2 || (month === 2 && day < 29)),
    );
    assert.match(values.length_of_service, /year/);
    for (const key of ["age", "length_of_service"]) {
      const field = detail.fields.find((f) => f.key === key);
      assert.equal(field.list_eligible, true);
      assert.deepEqual(field.actions, ["R"]);
      await assert.rejects(
        m(id.sa, "employee_update", {
          id: employee.id,
          expected_version: detail.employee.row_version,
          values: { [key]: 99 },
        }),
      );
    }
    assert.equal(values.date_hired, "2020-01-31");
    const grid = await owner.query(
      "select distinct key from app_private.field_policy_grid('branch',$1,null,array['age'])",
      [id.b1],
    );
    assert.deepEqual(grid.rows, [{ key: "age" }]);
    const periods = await owner.query(
      "select app_private.calendar_service('2024-01-31','2024-02-29') leap, app_private.calendar_service('2023-01-31','2023-03-01') normal, app_private.calendar_service('2024-01-01','2024-01-01') zero",
    );
    assert.deepEqual(periods.rows[0], {
      leap: "1 month",
      normal: "1 month, 1 day",
      zero: "0 days",
    });
  });
  await test("derived columns require readable source fields per placement, including non-active endpoints", async () => {
    const added = await owner.query(
      "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new,scope_type) select $1,id,'R','allow',true,'all' from public.field_groups where active on conflict do nothing returning id",
      [id.viewer],
    );
    let detail = await q(id.viewer, "employee", { id: employee.id });
    assert.equal(typeof detail.employee.values.age, "number");
    const deny = async (key) =>
      (
        await owner.query(
          "insert into public.field_access_policies(user_id,field_id,action,effect,scope_type) select $1,id,'R','deny','all' from public.field_definitions where key=$2 returning id",
          [id.viewer, key],
        )
      ).rows[0].id;
    for (const [source, derived] of [
      ["birth_date", "age"],
      ["date_hired", "length_of_service"],
      ["status", "length_of_service"],
    ]) {
      const policy = await deny(source);
      detail = await q(id.viewer, "employee", { id: employee.id });
      assert.equal(Object.hasOwn(detail.employee.values, derived), false);
      assert.equal(
        detail.fields.some((f) => f.key === derived),
        false,
      );
      const page = await q(id.viewer, "employees", {
        sort: "id",
        limit: 25,
        offset: 0,
      });
      assert.equal(
        Object.hasOwn(
          page.items.find((e) => e.id === employee.id).values,
          derived,
        ),
        false,
      );
      await owner.query(
        "delete from public.field_access_policies where id=$1",
        [policy],
      );
    }
    await owner.query(
      "update public.employees set initial_status='Inactive', custom_values=custom_values || '{\"status_effective_date\":\"2023-03-01\"}'::jsonb where id=$1",
      [employee.id],
    );
    detail = await q(id.viewer, "employee", { id: employee.id });
    assert.equal(
      detail.employee.values.length_of_service,
      "3 years, 1 month, 1 day",
    );
    const endpoint = await deny("status_effective_date");
    detail = await q(id.viewer, "employee", { id: employee.id });
    assert.equal(detail.employee.values.length_of_service, null);
    const page = await q(id.viewer, "employees", {
      sort: "id",
      limit: 25,
      offset: 0,
    });
    assert.equal(
      page.items.find((e) => e.id === employee.id).values.length_of_service,
      null,
    );
    await owner.query("delete from public.field_access_policies where id=$1", [
      endpoint,
    ]);
    await owner.query(
      "delete from public.field_access_policies where id=any($1::uuid[])",
      [added.rows.map((p) => p.id)],
    );
  });
  await test("computed columns save in managed and personal views and sort/export on the server", async () => {
    const older = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: {
        first_name: "CALCULATED",
        last_name: "ORDER",
        birth_date: "1980-01-01",
        date_hired: "2019-01-01",
      },
    });
    await owner.query(
      "update public.employees set initial_status='Inactive',custom_values=custom_values || '{\"status_effective_date\":\"2020-01-01\"}'::jsonb where id=$1",
      [older.id],
    );
    for (const [sort, expected] of [
      ["age", [employee.id, older.id]],
      ["length_of_service", [older.id, employee.id]],
    ]) {
      const ordered = await q(id.sa, "employees", {
        search: "CALCULATED",
        sort,
        direction: "asc",
        limit: 25,
        offset: 0,
      });
      assert.deepEqual(
        ordered.items.map((e) => e.id),
        expected,
      );
    }
    const settings = await as(
      id.sa,
      async (c) =>
        (await c.query("select public.register_settings() r")).rows[0].r,
    );
    const view = {
      id: randomUUID(),
      name: "Calculated columns",
      user_id: null,
      scope_type: "all",
      scope_id: null,
      config: {
        columns: ["name", "age", "length_of_service"],
        pinned: ["name"],
        showRowNumbers: true,
      },
      expected_version: settings.row_version,
      reason: "Synthetic calculated columns",
    };
    await as(id.sa, (c) =>
      c.query("select public.set_register_view($1,$2)", [view, randomUUID()]),
    );
    await m(id.sa, "save_view", {
      name: "Calculated personal",
      config: {
        ...view.config,
        filter: {
          search: "",
          branches: [],
          clients: [],
          statuses: [],
          predicates: [],
          sort: "age",
          direction: "asc",
          limit: 25,
          offset: 0,
          quick: null,
        },
      },
    });
    for (const sort of ["age", "length_of_service"]) {
      const page = await q(id.sa, "employees", {
        sort,
        direction: "asc",
        limit: 100,
        offset: 0,
      });
      assert.ok(page.items.some((e) => e.id === employee.id));
      const exported = await as(
        id.sa,
        async (c) =>
          (
            await c.query("select public.export_employees($1) r", [
              { sort, direction: "asc" },
            ])
          ).rows[0].r,
      );
      assert.ok(exported.fields.some((f) => f.key === sort));
      assert.ok(exported.items.some((e) => e.id === employee.id));
    }
    await as(id.sa, (c) =>
      c.query("select public.set_register_view($1,$2)", [
        { ...view, remove: true, expected_version: settings.row_version + 1 },
        randomUUID(),
      ]),
    );
  });
}
