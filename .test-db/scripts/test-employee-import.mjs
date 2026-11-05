import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testEmployeeImport({ owner, test, m, q, as, id }) {
  const user = randomUUID();
  await owner.query("insert into auth.users values($1)", [user]);
  await owner.query(
    "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic importer','admin')",
    [user],
  );
  await owner.query(
    "insert into public.capability_grants values($1,'employee_create')",
    [user],
  );
  await owner.query(
    "insert into public.user_scope_grants(user_id,scope_type,scope_id,actions,include_descendants) values($1,'branch',$2,array['C','R'],true)",
    [user, id.b1],
  );
  await owner.query(
    "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,id,a,'allow',true from public.field_groups cross join unnest(array['C','R']) a where active",
    [user],
  );
  const row = (first, extra = {}) => ({
    values: { last_name: "Import", first_name: first, ...extra },
  });
  const batch = (rows, more = {}) => ({
    target_level: "branch",
    branch_id: id.b1,
    rows,
    ...more,
  });
  const snapshots = async () =>
    (
      await owner.query(
        "select (select count(*) from public.employees) employees,(select count(*) from public.audit_log) audits,(select count(*) from public.sync_outbox) outbox,(select count(*) from public.write_requests) requests,(select revision from public.system_state where id) revision",
      )
    ).rows[0];
  const allow = async (effect) =>
    owner.query(
      "insert into app_private.access_overrides values($1,'employees','import',$2) on conflict(user_id,module,action) do update set effect=excluded.effect",
      [user, effect],
    );
  await test("Import defaults to Superadmin, with no existing ordinary role or user grant", async () => {
    assert.equal(
      (await q(id.sa, "context")).module_permissions["employees.import"],
      true,
    );
    assert.equal(
      (await q(user, "context")).module_permissions["employees.import"],
      false,
    );
    await assert.rejects(
      m(user, "employee_import", batch([row("Denied")])),
      /import.*creation permissions/,
    );
    assert.equal(
      (
        await owner.query(
          "select count(*)::int n from app_private.access_role_permissions where module='employees' and action='import'",
        )
      ).rows[0].n,
      0,
    );
  });
  await allow("allow");
  await test("selected user imports with existing field/scope rules, generated category, employment, IDs and idempotent receipt", async () => {
    const p = batch([row("One", { position: "Clerk" }), row("Two")]);
    const req = randomUUID(),
      before = await snapshots();
    assert.deepEqual(await m(user, "employee_import", p, req), { imported: 2 });
    const after = await snapshots();
    assert.equal(Number(after.employees) - Number(before.employees), 2);
    assert(Number(after.audits) > Number(before.audits));
    assert(Number(after.outbox) > Number(before.outbox));
    const records = (
      await owner.query(
        "select e.name,e.custom_values,e.employee_number from public.employees e where e.custom_values->>'last_name'='Import' order by e.name",
      )
    ).rows;
    assert.equal(records.length, 2);
    assert.equal(records[0].custom_values.employee_category, "Agency");
    assert(records.every((e) => e.employee_number));
    assert.notEqual(records[0].employee_number, records[1].employee_number);
    assert.deepEqual(await m(user, "employee_import", p, req), { imported: 2 });
    assert.deepEqual(await snapshots(), after);
    await assert.rejects(
      m(user, "employee_import", batch([row("Changed")]), req),
      /different payload/,
    );
  });
  await test("Import preview rolls back employees, audit, outbox, write receipts and revision", async () => {
    const before = await snapshots();
    const result = await as(user, (c) =>
      c
        .query("select public.transaction_preview('employee_import',$1) r", [
          batch([row("Preview")]),
        ])
        .then((r) => r.rows[0].r),
    );
    assert.deepEqual(result, { imported: 1, valid: true });
    assert.deepEqual(await snapshots(), before);
  });
  await test("one unauthorized or invalid field rolls back all preceding import rows", async () => {
    const before = await snapshots();
    await assert.rejects(
      m(
        user,
        "employee_import",
        batch([row("Rollback"), row("Bad", { imaginary_field: "no" })]),
      ),
      /Row 2/,
    );
    assert.deepEqual(await snapshots(), before);
    const field = (
      await owner.query(
        "select id from public.field_definitions where key='first_name'",
      )
    ).rows[0].id;
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) values($1,$2,'C','deny')",
      [user, field],
    );
    await assert.rejects(
      m(user, "employee_import", batch([row("FieldDenied")])),
      /authorized/,
    );
    await owner.query(
      "delete from public.field_access_policies where user_id=$1 and field_id=$2",
      [user, field],
    );
  });
  await test("direct calls cannot import across branches or bypass Create, DENY or record restrictions", async () => {
    await assert.rejects(
      m(user, "employee_import", batch([row("Outside")], { branch_id: id.b2 })),
      /authorized/,
    );
    await allow("deny");
    await assert.rejects(
      m(user, "employee_import", batch([row("Denied")])),
      /permissions/,
    );
    await allow("allow");
    await owner.query(
      "insert into app_private.access_overrides values($1,'employees','create','deny')",
      [user],
    );
    await assert.rejects(
      m(user, "employee_import", batch([row("NoCreate")])),
      /permissions/,
    );
    await owner.query(
      "delete from app_private.access_overrides where user_id=$1 and action='create'",
      [user],
    );
    await owner.query(
      "insert into app_private.access_record_rules(user_id,mode) values($1,'assigned')",
      [user],
    );
    await assert.rejects(
      m(user, "employee_import", batch([row("Assigned")])),
      /permissions|restricted|authorized/,
    );
    await owner.query(
      "delete from app_private.access_record_rules where user_id=$1",
      [user],
    );
  });
  await test("viewer, anonymous callers and private-function bypasses cannot import", async () => {
    await owner.query(
      "insert into app_private.access_overrides values($1,'employees','import','allow')",
      [id.viewer],
    );
    await assert.rejects(
      m(id.viewer, "employee_import", batch([row("Viewer")])),
      /permissions/,
    );
    await assert.rejects(
      as(
        null,
        (c) =>
          c.query("select public.tracker_mutate('employee_import',$1,$2)", [
            batch([row("Anon")]),
            randomUUID(),
          ]),
        "anon",
      ),
      /permission denied/,
    );
    await assert.rejects(
      as(user, (c) =>
        c.query(
          "select app_private.tracker_mutate_before_import('employee_create',$1,$2)",
          [batch([row("Bypass")]), randomUUID()],
        ),
      ),
      /permission denied/,
    );
    await owner.query(
      "delete from app_private.access_overrides where user_id=$1 and action='import'",
      [id.viewer],
    );
  });
  await test("duplicates within a batch stop every row without a duplicate-review bypass", async () => {
    const before = await snapshots();
    await assert.rejects(
      m(
        id.sa,
        "employee_import",
        batch([
          row("Duplicate", { birth_date: "1990-01-02" }),
          row("Duplicate", { birth_date: "1990-01-02" }),
        ]),
      ),
      /Row 2.*duplicate/,
    );
    assert.deepEqual(await snapshots(), before);
    await assert.rejects(
      m(
        id.sa,
        "employee_import",
        batch([{ ...row("Bypass"), duplicate_review: "fake" }]),
      ),
      /Invalid employee row/,
    );
  });
  await test("managed columns, malformed payloads and oversized imports fail closed", async () => {
    for (const p of [
      batch([]),
      batch(Array.from({ length: 101 }, (_, i) => row(String(i)))),
      batch([row("Bad", { employee_category: "Admin" })]),
      batch([row("Bad")], { unexpected: true }),
      batch([{ values: [] }]),
    ])
      await assert.rejects(m(id.sa, "employee_import", p));
  });
  await test("import preserves Head Office category and configured client ID issuance", async () => {
    await m(id.sa, "employee_import", {
      target_level: "head_office",
      rows: [row("HeadOffice")],
    });
    const mode = (
      await owner.query(
        "select coalesce((select id_mode from public.client_entry_settings where client_id=$1),'automatic') mode",
        [id.c1],
      )
    ).rows[0].mode;
    await m(id.sa, "employee_import", {
      target_level: "client",
      branch_id: id.b1,
      client_id: id.c1,
      rows: [
        {
          ...row("Client"),
          ...(mode === "manual"
            ? { manual_client_id: "IMPORT-" + randomUUID().slice(0, 8) }
            : {}),
        },
      ],
    });
    const ho = (
      await owner.query(
        "select custom_values->>'employee_category' category from public.employees where custom_values->>'last_name'='Import' and custom_values->>'first_name'='HeadOffice'",
      )
    ).rows[0];
    assert.equal(ho.category, "Admin");
    const client = (
      await q(id.sa, "employees", { search: "Import, Client", limit: 100 })
    ).items.find((e) => e.values.first_name === "Client");
    assert.equal(client.values.employee_category, "Agency");
    assert(client.values.client_employee_number);
  });
}
