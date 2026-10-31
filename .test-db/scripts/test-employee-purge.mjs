import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testEmployeePurge({ owner, test, m, as, id }) {
  const preview = (user, q) =>
    as(user, (c) =>
      c
        .query("select public.preview_employee_purge($1) r", [q])
        .then((r) => r.rows[0].r),
    );
  const purge = (user, p, req = randomUUID()) =>
    as(user, (c) =>
      c
        .query("select public.hard_delete_employees($1,$2) r", [p, req])
        .then((r) => r.rows[0].r),
    );
  const count = async (table, column, value) =>
    Number(
      (
        await owner.query(
          `select count(*) n from ${table} where ${column}=$1`,
          [value],
        )
      ).rows[0].n,
    );
  const b = randomUUID(),
    c = randomUUID(),
    other = randomUUID(),
    linked = randomUUID();
  const today = (await owner.query("select app_private.today() d")).rows[0].d;
  await owner.query(
    "insert into public.branches(id,code,name) values($1,$2,$2),($3,$4,$4)",
    [b, `Purge-${b}`, other, `Keep-${other}`],
  );
  await owner.query(
    "insert into public.clients(id,branch_id,code,name) values($1,$2,'PURGE','Synthetic purge client')",
    [c, b],
  );
  const create = (name, target_level, branch_id, client_id) =>
    m(id.sa, "employee_create", {
      target_level,
      branch_id,
      client_id,
      values: { name },
    });
  const branch = (await create("Purge branch", "branch", b)).id;
  const client = (await create("Purge client", "client", b, c)).id;
  const keep = (await create("Purge outside survivor", "branch", other)).id;
  const ho = (await create("Purge head office", "head_office")).id;
  const createReceipt = (
    await owner.query(
      "select * from public.write_requests where result->>'id'=$1 order by created_at limit 1",
      [branch],
    )
  ).rows[0];
  await m(id.sa, "movement", {
    employee_id: branch,
    expected_version: 1,
    type: "position",
    position: "Synthetic purge position",
    effective_on: today,
    reason: "Synthetic purge history",
  });
  const movementId = (
    await owner.query(
      "select id from public.employee_movements where employee_id=$1",
      [branch],
    )
  ).rows[0].id;
  await owner.query(
    "insert into app_private.position_text_corrections(employee_id,movement_id,value,actor_id) values($1,$2,'Synthetic corrected position',$3)",
    [branch, movementId, id.sa],
  );
  // Give the survivor old history in the selected branch: it must not be selected.
  await owner.query(
    "insert into public.employee_assignments(employee_id,target_level,branch_id,category,starts_on,ends_on) values($1,'branch',$2,'primary',app_private.today()-10,app_private.today())",
    [keep, b],
  );
  await owner.query(
    "insert into public.employee_assignments(employee_id,target_level,branch_id,category,starts_on,ends_on) values($1,'branch',$2,'temporary',app_private.today(),app_private.today()+2)",
    [keep, b],
  );
  // Selected employee's old history outside the scope must be included and counted.
  await owner.query(
    "insert into public.employee_assignments(employee_id,target_level,branch_id,category,starts_on,ends_on) values($1,'branch',$2,'primary',app_private.today()-10,app_private.today())",
    [branch, other],
  );
  await owner.query(
    "update public.employees set deleted_at=now() where id=$1",
    [client],
  );
  await owner.query("insert into auth.users values($1)", [linked]);
  await owner.query(
    "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic retained login','viewer')",
    [linked],
  );
  await owner.query(
    "insert into app_private.access_record_rules(user_id,mode,employee_id) values($1,'self',$2)",
    [linked, branch],
  );
  await owner.query(
    "insert into app_private.employee_reporting(employee_id,manager_id) values($1,$2)",
    [keep, branch],
  );
  const revision = async () =>
    Number(
      (
        await owner.query(
          "select revision from public.system_state where id=true",
        )
      ).rows[0].revision,
    );
  let reviewed;
  await test("hard delete preview and mutation reject anonymous, Admin and Viewer, including raw helper bypass", async () => {
    for (const user of [null, id.admin, id.viewer]) {
      await assert.rejects(preview(user, { scope_type: "all" }), {
        code: "42501",
      });
      await assert.rejects(
        purge(user, {
          token: randomUUID(),
          confirmation: "DELETE 1 EMPLOYEES",
          reason: "Unauthorized test",
        }),
        { code: "42501" },
      );
    }
    await assert.rejects(
      as(id.sa, (connection) =>
        connection.query("select * from app_private.employee_purge_previews"),
      ),
      { code: "42501" },
    );
  });
  await test("hard delete scope uses current primary, includes archived/client rows, excludes historical and temporary-only membership", async () => {
    for (const invalid of [
      {},
      { scope_type: "other" },
      { scope_type: "branch" },
      { scope_type: "all", scope_id: b },
      { scope_type: "client", scope_id: randomUUID() },
    ])
      await assert.rejects(preview(id.sa, invalid), { code: "22023" });
    const clientPreview = await preview(id.sa, {
      scope_type: "client",
      scope_id: c,
    });
    assert.equal(clientPreview.counts.employees, 1);
    assert.equal(clientPreview.counts.archived, 1);
    reviewed = await preview(id.sa, { scope_type: "branch", scope_id: b });
    assert.equal(reviewed.counts.employees, 2);
    assert.equal(reviewed.counts.archived, 1);
    assert.equal(reviewed.counts.other_location_history, 1);
    assert.equal(reviewed.counts.linked_accounts, 1);
    assert.equal(reviewed.counts.movements, 1);
    assert.equal(reviewed.sample.length, 2);
    const hos = await preview(id.sa, { scope_type: "head_office" });
    assert(hos.sample.some((e) => e.employee_number));
    assert.equal(await count("public.employees", "id", ho), 1);
  });
  await test("hard delete requires actor-bound, unexpired, unchanged preview and exact confirmation", async () => {
    reviewed = await preview(id.sa, { scope_type: "branch", scope_id: b });
    const payload = {
      token: reviewed.token,
      confirmation: reviewed.confirmation,
      reason: "Synthetic permanent deletion test",
    };
    const anotherSuper = randomUUID();
    await owner.query("insert into auth.users values($1)", [anotherSuper]);
    await owner.query(
      "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic other superadmin','superadmin')",
      [anotherSuper],
    );
    await assert.rejects(purge(anotherSuper, payload), { code: "40001" });
    await assert.rejects(purge(id.sa, { ...payload, confirmation: "wrong" }), {
      code: "22023",
    });
    await assert.rejects(purge(id.sa, { ...payload, reason: "" }), {
      code: "22023",
    });
    await owner.query(
      "update app_private.employee_purge_previews set expires_at=now()-interval '1 second' where token=$1",
      [reviewed.token],
    );
    await assert.rejects(purge(id.sa, payload), { code: "40001" });
    reviewed = await preview(id.sa, { scope_type: "branch", scope_id: b });
    await owner.query(
      "update public.system_state set revision=revision+1 where id=true",
    );
    await assert.rejects(purge(id.sa, { ...payload, token: reviewed.token }), {
      code: "40001",
    });
    await owner.query(
      "update public.user_profiles set role='admin' where id=$1",
      [id.sa],
    );
    try {
      await assert.rejects(purge(id.sa, payload), { code: "42501" });
    } finally {
      await owner.query(
        "update public.user_profiles set role='superadmin' where id=$1",
        [id.sa],
      );
    }
    assert.equal(await count("public.employees", "id", branch), 1);
  });
  await test("hard delete rolls back every dependent delete on failure", async () => {
    reviewed = await preview(id.sa, { scope_type: "branch", scope_id: b });
    await owner.query(
      "create function app_private.synthetic_purge_failure() returns trigger language plpgsql as $$ begin raise exception 'Synthetic purge failure'; end $$; create trigger synthetic_purge_failure before delete on public.employees for each statement execute function app_private.synthetic_purge_failure()",
    );
    const before = await revision();
    try {
      await assert.rejects(
        purge(id.sa, {
          token: reviewed.token,
          confirmation: reviewed.confirmation,
          reason: "Rollback check",
        }),
        /Synthetic purge failure/,
      );
    } finally {
      await owner.query(
        "drop trigger synthetic_purge_failure on public.employees; drop function app_private.synthetic_purge_failure()",
      );
    }
    assert.equal(await revision(), before);
    assert.equal(
      await count("public.employee_client_ids", "employee_id", client),
      1,
    );
    assert.equal(
      await count("app_private.employee_reporting", "employee_id", keep),
      1,
    );
  });
  await test("hard delete removes selected profiles and history, preserves other scopes/accounts, fails closed, queues synchronization and replays once", async () => {
    reviewed = await preview(id.sa, { scope_type: "branch", scope_id: b });
    const payload = {
        token: reviewed.token,
        confirmation: reviewed.confirmation,
        reason: "Synthetic scope purge",
      },
      request = randomUUID();
    const result = await purge(id.sa, payload, request);
    assert.equal(result.deleted_employees, 2);
    assert.equal(result.deleted_movements, 1);
    await assert.rejects(
      m(
        id.sa,
        createReceipt.operation,
        createReceipt.payload,
        createReceipt.request_id,
      ),
      /different payload/,
    );
    assert.deepEqual(await purge(id.sa, payload, request), result);
    await assert.rejects(
      purge(id.sa, { ...payload, reason: "Changed" }, request),
      /different payload/,
    );
    for (const eid of [branch, client]) {
      for (const table of [
        "public.employee_assignments",
        "public.employee_movements",
        "public.employee_client_ids",
        "app_private.audit_value_changes",
        "app_private.position_text_corrections",
        "app_private.unique_field_values",
      ])
        assert.equal(await count(table, "employee_id", eid), 0, table);
      assert.equal(await count("public.employees", "id", eid), 0);
      assert.equal(await count("public.audit_log", "entity_id", eid), 0);
      assert.equal(
        (
          await owner.query(
            "select count(*) n from public.write_requests where result::text like $1 or payload::text like $1",
            [`%${eid}%`],
          )
        ).rows[0].n,
        "0",
      );
    }
    assert.equal(await count("public.employees", "id", keep), 1);
    assert.equal(await count("public.employees", "id", ho), 1);
    assert.equal(await count("public.user_profiles", "id", linked), 1);
    assert.equal(await count("public.branches", "id", b), 1);
    assert.equal(await count("public.clients", "id", c), 1);
    const restriction = (
      await owner.query(
        "select * from app_private.access_record_rules where user_id=$1",
        [linked],
      )
    ).rows[0];
    assert.equal(restriction.mode, "assigned");
    assert.deepEqual(restriction.assigned, []);
    assert.equal(
      (
        await as(
          linked,
          (connection) =>
            connection.query("select app_private.record_access($1) allowed", [
              keep,
            ]),
          "postgres",
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await owner.query(
          "select count(*) n from public.sync_outbox where action='employee_purge' and entity_id is null",
        )
      ).rows[0].n,
      "1",
    );
    assert.equal(
      (
        await owner.query(
          "select count(*) n from public.audit_log where entity='employee_purge' and operation='hard_delete'",
        )
      ).rows[0].n,
      "1",
    );
  });
  await test("all-data hard delete covers unassigned rows and can be rehearsed transactionally without losing fixtures", async () => {
    await as(
      id.sa,
      async (connection) => {
        await connection.query("savepoint purge_rehearsal");
        const before = Number(
          (await connection.query("select count(*) n from public.employees"))
            .rows[0].n,
        );
        const reviewed = (
          await connection.query(
            'select public.preview_employee_purge(\'{"scope_type":"all"}\') r',
          )
        ).rows[0].r;
        assert.equal(reviewed.counts.employees, before);
        await connection.query("select public.hard_delete_employees($1,$2)", [
          {
            token: reviewed.token,
            confirmation: reviewed.confirmation,
            reason: "Rollback-only all-data test",
          },
          randomUUID(),
        ]);
        assert.equal(
          (await connection.query("select count(*) n from public.employees"))
            .rows[0].n,
          "0",
        );
        await connection.query("rollback to savepoint purge_rehearsal");
      },
      "postgres",
    );
    assert.equal(await count("public.employees", "id", keep), 1);
  });
}
