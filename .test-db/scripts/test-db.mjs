import EmbeddedPostgres from "embedded-postgres";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const run = promisify(execFile),
  port = 55000 + Math.floor(Math.random() * 9000),
  databaseDir = resolve(".test-db", "runs", `postgres-${Date.now()}`);
const db = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: randomUUID(),
  port,
  persistent: false,
  initdbFlags: ["--encoding=UTF8"],
  onLog: (m) => {
    if (String(m).includes("FATAL")) console.error(String(m));
  },
  onError: () => {},
});
let owner;
const opened = [],
  results = [],
  migrationVersions = [];
const id = {
  sa: "40000000-0000-0000-0000-000000000001",
  admin: "40000000-0000-0000-0000-000000000002",
  viewer: "40000000-0000-0000-0000-000000000003",
  client: "40000000-0000-0000-0000-000000000004",
  b1: "20000000-0000-0000-0000-000000000001",
  b2: "20000000-0000-0000-0000-000000000002",
  c1: "30000000-0000-0000-0000-000000000001",
  c2: "30000000-0000-0000-0000-000000000002",
  core: "10000000-0000-0000-0000-000000000001",
  contact: "10000000-0000-0000-0000-000000000002",
};
async function as(user, fn, role = "authenticated", connection = owner) {
  await connection.query("begin");
  try {
    await connection.query(`set local role ${role}`);
    await connection.query(
      "select set_config('request.jwt.claim.sub',$1,true)",
      [user || ""],
    );
    const r = await fn(connection);
    await connection.query("commit");
    return r;
  } catch (e) {
    await connection.query("rollback");
    throw e;
  }
}
const q = (user, op, p = {}) =>
  as(user, (c) =>
    c
      .query("select public.tracker_query($1,$2) r", [op, p])
      .then((r) => r.rows[0].r),
  );
const m = (user, op, p, req = randomUUID()) =>
  as(user, (c) =>
    c
      .query("select public.tracker_mutate($1,$2,$3) r", [op, p, req])
      .then((r) => r.rows[0].r),
  );
const worker = (op, p = {}) =>
  as(
    null,
    (c) =>
      c
        .query("select public.worker_command($1,$2) r", [op, p])
        .then((r) => r.rows[0].r),
    "service_role",
  );
const revision = async (e) =>
  (await q(id.sa, "employee", { id: e })).employee.row_version;
async function test(name, fn) {
  const t = performance.now();
  await fn();
  results.push({ name, ms: Math.round(performance.now() - t) });
  console.log(`PASS ${name}`);
}
async function concurrent(operation, payloads, principals = []) {
  return Promise.all(
    payloads.map(async (p, i) => {
      const c = db.getPgClient();
      await c.connect();
      opened.push(c);
      try {
        return {
          ok: true,
          result: await as(
            principals[i] || id.sa,
            (c) =>
              c
                .query("select public.tracker_mutate($1,$2,$3) r", [
                  operation,
                  p,
                  randomUUID(),
                ])
                .then((r) => r.rows[0].r),
            "authenticated",
            c,
          ),
        };
      } catch (e) {
        return { ok: false, code: e.code };
      }
    }),
  );
}
try {
  console.log("Starting disposable PostgreSQL");
  await db.initialise();
  await db.start();
  owner = db.getPgClient();
  await owner.connect();
  await owner.query(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    await owner.query(await readFile(`supabase/migrations/${file}`, "utf8"));
    migrationVersions.push(file);
    console.log(`APPLIED ${file}`);
  }
  await owner.query(await readFile("supabase/seed.sql", "utf8"));
  await test("active application writes are scoped for Supabase safeupdate", async () => {
    const functions = await owner.query(
      "select n.nspname||'.'||p.proname name,p.prosrc source from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.prosecdef",
    );
    let checked = 0;
    for (const f of functions.rows) {
      const sql = f.source
        .replace(/'(?:''|[^'])*'/g, "''")
        .replace(/--[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      for (const statement of sql.matchAll(
        /\b(?:update\s+(?:public|app_private)\.\w+\s+set|delete\s+from\s+(?:public|app_private)\.\w+)\b[^;]*/gi,
      )) {
        assert.match(statement[0], /\bwhere\b/i, `Unscoped write in ${f.name}`);
        checked++;
      }
    }
    assert(checked >= 15, "Application mutation bodies were inspected");
  });

  for (const [key, role] of [
    ["sa", "superadmin"],
    ["admin", "admin"],
    ["viewer", "viewer"],
    ["client", "viewer"],
  ]) {
    await owner.query("insert into auth.users values($1)", [id[key]]);
    await owner.query(
      "insert into public.user_profiles(id,display_name,role) values($1,$2,$3)",
      [id[key], `Synthetic ${key}`, role],
    );
  }
  await owner.query(
    `insert into public.user_scope_grants(user_id,scope_type,scope_id,include_descendants,actions) values($1,'branch',$2,true,array['C','R','U','D']),($3,'branch',$2,false,array['R']),($4,'client',$5,false,array['R'])`,
    [id.admin, id.b1, id.viewer, id.client, id.c1],
  );
  for (const who of [id.admin, id.viewer, id.client])
    await owner.query(
      `insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,$2,a,'allow',true from unnest(array['C','R','U','D']) a`,
      [who, id.core],
    );
  await owner.query(
    `insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new,scope_type,scope_id,include_descendants) select $1,$2,a,'allow',true,'branch',$3,true from unnest(array['C','R','U']) a`,
    [id.admin, id.contact, id.b1],
  );
  for (const cap of [
    "employee_create",
    "employee_delete",
    "movement_create",
    "schema_manage",
    "bulk_update",
  ])
    await owner.query("insert into public.capability_grants values($1,$2)", [
      id.admin,
      cap,
    ]);
  let e1, e2, e3;
  const today = (await q(id.sa, "context")).today;
  const date = (n) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  await test("create profiles allocates permanent IDs and atomic outbox", async () => {
    e1 = (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: { name: "Synthetic One", email: "one@example.invalid" },
      })
    ).id;
    e2 = (
      await m(id.sa, "employee_create", {
        target_level: "client",
        branch_id: id.b2,
        client_id: id.c2,
        values: { name: "Synthetic Two" },
      })
    ).id;
    assert.equal(
      (await owner.query("select count(*) n from public.sync_outbox")).rows[0]
        .n,
      "2",
    );
  });
  await test("register display policy denies non-superadmins, raw access and anonymous calls", async () => {
    const read = () =>
      as(id.viewer, (c) =>
        c.query("select public.register_settings() r").then((r) => r.rows[0].r),
      );
    assert.equal((await read()).row_numbers_allowed, true);
    for (const user of [id.admin, id.viewer])
      await assert.rejects(
        as(user, (c) =>
          c.query("select public.set_register_settings($1,$2)", [
            { row_numbers_allowed: false, expected_version: 1, reason: "Test" },
            randomUUID(),
          ]),
        ),
        (e) => e.code === "42501",
      );
    await assert.rejects(
      as(id.sa, (c) =>
        c.query(
          "update public.register_display_settings set row_numbers_allowed=false where id=true",
        ),
      ),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      as(null, (c) => c.query("select public.register_settings()"), "anon"),
      (e) => e.code === "42501",
    );
  });
  await test("register policy saves are atomic, versioned, audited and idempotent", async () => {
    const request = randomUUID(),
      payload = {
        row_numbers_allowed: false,
        expected_version: 1,
        reason: "Hide row ordinals",
      };
    const save = (p, req = randomUUID()) =>
      as(id.sa, (c) =>
        c
          .query("select public.set_register_settings($1,$2) r", [p, req])
          .then((r) => r.rows[0].r),
      );
    const result = await save(payload, request);
    assert.equal(result.row_numbers_allowed, false);
    assert.equal(result.row_version, 2);
    assert.deepEqual(await save(payload, request), result);
    await assert.rejects(
      save({ ...payload, row_numbers_allowed: true }, request),
    );
    await assert.rejects(
      save({ ...payload, row_numbers_allowed: true }),
      (e) => e.code === "40001",
    );
    assert.equal(
      (
        await owner.query(
          "select count(*) n from public.audit_log where entity='register_settings'",
        )
      ).rows[0].n,
      "1",
    );
    await save({
      row_numbers_allowed: true,
      expected_version: 2,
      reason: "Restore row ordinals",
    });
    const clients = await Promise.all(
      [0, 1].map(async () => {
        const c = db.getPgClient();
        await c.connect();
        opened.push(c);
        return c;
      }),
    );
    const outcomes = await Promise.allSettled(
      clients.map((c) =>
        as(
          id.sa,
          (c) =>
            c.query("select public.set_register_settings($1,$2)", [
              {
                row_numbers_allowed: false,
                expected_version: 3,
                reason: "Concurrent setting",
              },
              randomUUID(),
            ]),
          "authenticated",
          c,
        ),
      ),
    );
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      outcomes.filter(
        (r) => r.status === "rejected" && r.reason.code === "40001",
      ).length,
      1,
    );
    await save({
      row_numbers_allowed: true,
      expected_version: 4,
      reason: "Restore after race",
    });
  });
  await test("raw tables and alternate privilege escalation denied", async () => {
    for (const t of [
      "employees",
      "field_definitions",
      "user_profiles",
      "audit_log",
      "employee_assignments",
      "sync_outbox",
    ])
      await assert.rejects(
        as(id.admin, (c) => c.query(`select * from public.${t}`)),
        { code: "42501" },
      );
    await assert.rejects(
      as(id.admin, (c) =>
        c.query("update public.user_profiles set role='superadmin'"),
      ),
      { code: "42501" },
    );
    await assert.rejects(
      m(id.admin, "profile", {
        id: id.admin,
        display_name: "Attack",
        role: "superadmin",
        active: true,
        reason: "Attack",
      }),
      { code: "42501" },
    );
    await assert.rejects(
      as(id.admin, (c) =>
        c.query("select public.worker_command($1,$2)", ["snapshot", {}]),
      ),
      { code: "42501" },
    );
  });
  await test("branch-only and client-only scopes do not broaden", async () => {
    assert.equal((await q(id.admin, "employees")).total, 1);
    assert.equal((await q(id.viewer, "employees")).total, 1);
    assert.equal((await q(id.client, "employees")).total, 0);
    await assert.rejects(q(id.admin, "employee", { id: e2 }), {
      code: "42501",
    });
  });
  await test("viewer cannot mutate; personal saved views remain permitted", async () => {
    await assert.rejects(
      m(id.viewer, "employee_update", {
        id: e1,
        expected_version: 1,
        values: { name: "Attack" },
      }),
      { code: "42501" },
    );
    await m(id.viewer, "save_view", {
      name: "Viewer view",
      config: { columns: ["name"] },
    });
    assert.equal((await q(id.viewer, "context")).views.length, 1);
    assert.equal((await q(id.admin, "context")).views.length, 0);
  });
  await test("idempotent create and mismatched request rejection", async () => {
    const req = randomUUID(),
      p = {
        target_level: "branch",
        branch_id: id.b1,
        values: { name: "Synthetic Retry" },
      };
    assert.deepEqual(
      await m(id.sa, "employee_create", p, req),
      await m(id.sa, "employee_create", p, req),
    );
    await assert.rejects(
      m(id.sa, "employee_create", { ...p, values: { name: "Changed" } }, req),
    );
  });
  await test("new fields inherit only configured group permissions; restricted metadata denied", async () => {
    const f = await m(id.admin, "field", {
        group_id: id.contact,
        key: "emergency_contact",
        label: "Emergency Contact",
        type: "short_text",
      }),
      secret = await m(id.sa, "field", {
        group_id: id.contact,
        key: "secret_note",
        label: "Secret Note",
        type: "short_text",
        sensitivity: "restricted",
      });
    assert((await q(id.admin, "context")).fields.some((x) => x.id === f.id));
    assert(
      !(await q(id.admin, "context")).fields.some((x) => x.id === secret.id),
    );
    assert(!(await q(id.viewer, "context")).fields.some((x) => x.id === f.id));
  });
  await test("database normalization prevents Unicode/spacing/key duplicates", async () => {
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "emergency_two",
        label: " emergency   contact ",
        type: "short_text",
      }),
      { code: "23505" },
    );
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "emergency_contact",
        label: "Other",
        type: "short_text",
      }),
      { code: "23505" },
    );
    await m(id.sa, "field", {
      group_id: id.contact,
      key: "unicode_a",
      label: "Straße Ａ",
      type: "short_text",
    });
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "unicode_b",
        label: "STRASSE A",
        type: "short_text",
      }),
      { code: "23505" },
    );
  });
  await test("hidden values preserved and malicious custom keys rejected", async () => {
    await m(id.sa, "employee_update", {
      id: e1,
      expected_version: 1,
      values: { secret_note: "Synthetic hidden" },
    });
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e1,
        expected_version: 2,
        values: { secret_note: "Attack" },
      }),
      { code: "42501" },
    );
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e1,
        expected_version: 2,
        values: { unknown_key: "Attack" },
      }),
      { code: "42501" },
    );
    await m(id.admin, "employee_update", {
      id: e1,
      expected_version: 2,
      values: { name: "Synthetic Renamed" },
    });
    assert.equal(
      (
        await owner.query(
          "select custom_values->>'secret_note' v from public.employees where id=$1",
          [e1],
        )
      ).rows[0].v,
      "Synthetic hidden",
    );
    assert(
      !(
        "secret_note" in
        (await q(id.admin, "employee", { id: e1 })).employee.values
      ),
    );
  });
  await test("hidden search/filter/exports never infer restricted values", async () => {
    assert.equal(
      (await q(id.admin, "employees", { search: "Synthetic hidden" })).total,
      0,
    );
    assert.equal(
      (
        await q(id.admin, "employees", {
          predicates: [
            { key: "secret_note", op: "contains", value: "Synthetic" },
          ],
        })
      ).total,
      0,
    );
    const r = await as(id.admin, (c) =>
      c
        .query("select public.export_employees($1) r", [{}])
        .then((r) => r.rows[0].r),
    );
    assert(r.items.every((x) => !("secret_note" in x.values)));
  });
  await test("stale/missing revisions rejected and bulk rollback is atomic", async () => {
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e1,
        expected_version: 1,
        values: { name: "Stale" },
      }),
      { code: "40001" },
    );
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e1,
        values: { name: "No revision" },
      }),
      { code: "40001" },
    );
    await assert.rejects(
      m(id.admin, "bulk_update", {
        rows: [
          { id: e1, row_version: 3 },
          { id: e2, row_version: 1 },
        ],
        values: { name: "Attack" },
      }),
      { code: "42501" },
    );
    assert.equal(
      (await q(id.sa, "employee", { id: e1 })).employee.values.name,
      "Synthetic Renamed",
    );
  });
  await test("future transfer preserves today; GiST prevents primary overlaps", async () => {
    await m(id.sa, "movement", {
      employee_id: e1,
      expected_version: 3,
      type: "transfer",
      target_level: "branch",
      branch_id: id.b2,
      effective_on: date(10),
      reason: "Synthetic future transfer",
    });
    assert.equal(
      (await q(id.admin, "employee", { id: e1 })).employee.values.branch,
      "Example North Branch",
    );
    await assert.rejects(
      m(id.sa, "movement", {
        employee_id: e1,
        expected_version: 4,
        type: "transfer",
        target_level: "branch",
        branch_id: id.b1,
        effective_on: date(10),
        reason: "Overlap",
      }),
      { code: "23P01" },
    );
    await assert.rejects(
      owner.query(
        `insert into public.employee_assignments(employee_id,target_level,branch_id,category,starts_on) values($1,'branch',$2,'primary',$3)`,
        [e1, id.b1, today],
      ),
      { code: "23P01" },
    );
  });
  await test("void restores prior interval without deleting movement history", async () => {
    const event = (await q(id.sa, "employee", { id: e1 })).movements.find(
      (x) => x.type === "transfer",
    );
    await m(id.sa, "void_movement", {
      id: event.id,
      expected_version: 4,
      reason: "Synthetic correction",
    });
    assert.equal(
      (
        await owner.query(
          `select branch_id from public.employee_assignments where employee_id=$1 and category='primary' and not voided and daterange(starts_on,ends_on,'[)') @> $2::date`,
          [e1, date(11)],
        )
      ).rows[0].branch_id,
      id.b1,
    );
    assert.equal(
      (await q(id.sa, "employee", { id: e1 })).movements[0].state,
      "Voided",
    );
  });
  await test("live revocation blocks existing sessions and old row revisions", async () => {
    await owner.query(
      "update public.user_scope_grants set active=false where user_id=$1",
      [id.admin],
    );
    assert.equal((await q(id.admin, "employees")).total, 0);
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e1,
        expected_version: 5,
        values: { name: "Revoked" },
      }),
      { code: "42501" },
    );
    await owner.query(
      "update public.user_scope_grants set active=true where user_id=$1",
      [id.admin],
    );
  });
  await test("explicit deny, blind Update, separate Delete and client field scope", async () => {
    const fields = (await q(id.sa, "schema")).fields,
      email = fields.find((f) => f.key === "email").id,
      secret = fields.find((f) => f.key === "secret_note").id;
    await m(id.sa, "policy", {
      user_id: id.admin,
      field_id: email,
      action: "R",
      effect: "deny",
      reason: "Synthetic deny",
    });
    assert(
      !("email" in (await q(id.admin, "employee", { id: e1 })).employee.values),
    );
    await m(id.admin, "employee_update", {
      id: e1,
      expected_version: await revision(e1),
      values: { email: "blind@example.invalid" },
    });
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e1,
        expected_version: await revision(e1),
        values: { email: null },
      }),
      { code: "42501" },
    );
    await m(id.sa, "policy", {
      user_id: id.admin,
      field_id: email,
      action: "D",
      effect: "allow",
      reason: "Synthetic clear grant",
    });
    await m(id.admin, "employee_update", {
      id: e1,
      expected_version: await revision(e1),
      values: { email: null },
    });
    await m(id.sa, "policy", {
      user_id: id.admin,
      field_id: secret,
      action: "U",
      effect: "allow",
      scope_type: "client",
      scope_id: id.c1,
      reason: "Synthetic client grant",
    });
    const p = await as(id.sa, (c) =>
      c
        .query("select public.permission_preview($1) r", [
          {
            user_id: id.admin,
            target_level: "client",
            branch_id: id.b1,
            client_id: id.c1,
          },
        ])
        .then((r) => r.rows[0].r),
    );
    const f = p.find((f) => f.key === "secret_note");
    assert(f.actions.includes("U"));
    assert(!f.actions.includes("R"));
  });
  await test("temporary/additional coexist and never grant primary visibility", async () => {
    e3 = (
      await m(id.sa, "employee_create", {
        target_level: "client",
        branch_id: id.b1,
        client_id: id.c1,
        values: { name: "Synthetic Client Placement" },
      })
    ).id;
    await m(id.sa, "movement", {
      employee_id: e3,
      expected_version: 1,
      type: "temporary",
      target_level: "branch",
      branch_id: id.b1,
      effective_on: today,
      ends_on: date(5),
      reason: "Synthetic temporary",
    });
    await m(id.sa, "movement", {
      employee_id: e3,
      expected_version: 2,
      type: "deployment",
      category: "additional",
      target_level: "client",
      branch_id: id.b2,
      client_id: id.c2,
      effective_on: today,
      reason: "Synthetic additional",
    });
    assert.equal(
      (
        await owner.query(
          "select count(*) n from public.employee_assignments where employee_id=$1 and not voided",
          [e3],
        )
      ).rows[0].n,
      "3",
    );
    await assert.rejects(q(id.viewer, "employee", { id: e3 }), {
      code: "42501",
    });
    assert.equal((await q(id.client, "employees")).total, 1);
    const temp = (await q(id.sa, "employee", { id: e3 })).assignments.find(
      (a) => a.category === "temporary",
    );
    await m(id.sa, "movement", {
      employee_id: e3,
      expected_version: 3,
      type: "return",
      assignment_id: temp.id,
      target_level: "head_office",
      effective_on: date(2),
      reason: "Synthetic early return",
    });
    assert.equal(
      (await q(id.sa, "employee", { id: e3 })).employee.values.client,
      "Example Client",
    );
  });
  await test("applicability is independent; rename/inactivation retains values and immutable types", async () => {
    const f = await m(id.sa, "field", {
      group_id: id.contact,
      key: "local_reference",
      label: "Local Reference",
      type: "short_text",
      scope_mode: "selected",
      targets: [
        { scope_type: "branch", scope_id: id.b1, include_descendants: false },
        { scope_type: "client", scope_id: id.c2 },
      ],
    });
    await m(id.sa, "employee_update", {
      id: e1,
      expected_version: await revision(e1),
      values: { local_reference: "Synthetic retained" },
    });
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: e3,
        expected_version: await revision(e3),
        values: { local_reference: "Excluded client" },
      }),
      { code: "42501" },
    );
    const definition = (await q(id.sa, "schema")).fields.find(
      (x) => x.id === f.id,
    );
    await assert.rejects(
      m(id.sa, "field", {
        ...definition,
        expected_version: definition.row_version,
        type: "integer",
        targets: [],
      }),
      /Populated field types/,
    );
    await m(id.sa, "field", {
      ...definition,
      expected_version: definition.row_version,
      label: "Renamed Local Reference",
      active: false,
      targets: [{ scope_type: "branch", scope_id: id.b1 }],
    });
    assert.equal(
      (
        await owner.query(
          "select custom_values->>'local_reference' v from public.employees where id=$1",
          [e1],
        )
      ).rows[0].v,
      "Synthetic retained",
    );
    assert(
      !(
        "local_reference" in
        (await q(id.sa, "employee", { id: e1 })).employee.values
      ),
    );
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "local_ref2",
        label: "renamed local reference",
        type: "short_text",
      }),
      { code: "23505" },
    );
  });
  await test("effective position/status and explicit separation schedule conflicts", async () => {
    await m(id.sa, "movement", {
      employee_id: e3,
      expected_version: await revision(e3),
      type: "position",
      position: "Synthetic promoted position",
      effective_on: date(3),
      reason: "Synthetic position",
    });
    assert.equal(
      (await q(id.sa, "employee", { id: e3 })).employee.values.position,
      "",
    );
    await m(id.sa, "movement", {
      employee_id: e3,
      expected_version: await revision(e3),
      type: "reassignment",
      target_level: "branch",
      branch_id: id.b2,
      effective_on: date(4),
      reason: "Synthetic reassignment",
    });
    await assert.rejects(
      m(id.sa, "movement", {
        employee_id: e3,
        expected_version: await revision(e3),
        type: "status",
        status: "Resigned",
        effective_on: date(2),
        reason: "Conflict",
      }),
      { code: "23P01" },
    );
    await m(id.sa, "movement", {
      employee_id: e3,
      expected_version: await revision(e3),
      type: "status",
      status: "Resigned",
      effective_on: date(8),
      reason: "Synthetic future separation",
    });
    assert.equal(
      (await q(id.sa, "employee", { id: e3 })).employee.values.status,
      "Active",
    );
    await assert.rejects(
      m(id.sa, "movement", {
        employee_id: e3,
        expected_version: await revision(e3),
        type: "deployment",
        target_level: "client",
        branch_id: id.b2,
        client_id: id.c2,
        effective_on: date(9),
        reason: "After separation",
      }),
      /not active/,
    );
  });
  await test("rollback-only preview retains revision and audit/outbox", async () => {
    const v = await revision(e1),
      before = (await owner.query("select count(*) n from public.sync_outbox"))
        .rows[0].n;
    await as(id.admin, (c) =>
      c.query("select public.transaction_preview($1,$2)", [
        "bulk_update",
        {
          rows: [{ id: e1, row_version: v }],
          values: { name: "Preview only" },
        },
      ]),
    );
    assert.equal(await revision(e1), v);
    assert.equal(
      (await owner.query("select count(*) n from public.sync_outbox")).rows[0]
        .n,
      before,
    );
  });
  await test("Head Office is an explicit scope, never company-wide", async () => {
    await m(id.sa, "scope", {
      user_id: id.viewer,
      scope_type: "head_office",
      actions: ["R"],
      reason: "Explicit HO",
    });
    const ho = (
      await m(id.sa, "employee_create", {
        target_level: "head_office",
        values: { name: "Synthetic HO" },
      })
    ).id;
    assert((await q(id.viewer, "employees")).items.some((e) => e.id === ho));
    await assert.rejects(q(id.viewer, "employee", { id: e2 }), {
      code: "42501",
    });
  });
  await test("worker export approval, branch isolation and exclusive leases/backoff", async () => {
    const book = (await worker("workbooks")).find((b) => b.branch_id === id.b1);
    await assert.rejects(worker("snapshot", { id: book.id }), /export policy/);
    await m(id.sa, "workbook", {
      id: book.id,
      row_version: book.row_version,
      approved: true,
      allowed_fields: ["employee_number", "name", "branch"],
      allowed_clients: [id.c1],
      include_branch: true,
      sharing_emails: [],
      reason: "Synthetic approval",
    });
    const snap = await worker("snapshot", { id: book.id });
    assert(snap.rows.some((e) => e.id === e1));
    assert(snap.assignments.every((a) => a.client_id === null));
    assert(!snap.rows.some((e) => e.id === e2));
    assert(snap.rows.every((e) => !("secret_note" in e.values)));
    const job = await worker("claim");
    assert(job.token);
    assert.equal(await worker("claim"), null);
    await worker("retry", { token: job.token });
    assert(
      Number(
        (
          await owner.query(
            "select count(*) n from public.sync_outbox where attempts>0 and status='pending' and next_retry>now()",
          )
        ).rows[0].n,
      ) > 0,
    );
  });
  await test("simultaneous duplicate creators: exactly one field commits", async () => {
    const answers = await concurrent(
      "field",
      Array.from({ length: 8 }, (_, i) => ({
        group_id: id.contact,
        key: `concurrent_${i}`,
        label: i % 2 ? " Concurrent   Field " : "CONCURRENT FIELD",
        type: "short_text",
      })),
    );
    assert.equal(answers.filter((a) => a.ok).length, 1);
    assert.equal(answers.filter((a) => a.code === "23505").length, 7);
  });
  await test("20 concurrent same-revision edits: one commit, 19 conflicts", async () => {
    const principals = [];
    for (let i = 0; i < 20; i++) {
      const user = randomUUID();
      principals.push(user);
      await owner.query("insert into auth.users values($1)", [user]);
      await owner.query(
        "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic load principal','admin')",
        [user],
      );
      await owner.query(
        "insert into public.user_scope_grants(user_id,scope_type,actions) values($1,'all',array['R','U'])",
        [user],
      );
      await owner.query(
        "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,$2,a,'allow',true from unnest(array['R','U']) a",
        [user, id.core],
      );
    }
    const started = performance.now();
    const answers = await concurrent(
      "employee_update",
      Array.from({ length: 20 }, (_, i) => ({
        id: e2,
        expected_version: 1,
        values: { name: `Synthetic Concurrent ${i}` },
      })),
      principals,
    );
    assert.equal(answers.filter((a) => a.ok).length, 1);
    assert.equal(answers.filter((a) => a.code === "40001").length, 19);
    results.push({
      name: "concurrency observation",
      users: 20,
      commits: 1,
      expectedConflicts: 19,
      elapsedMs: Math.round(performance.now() - started),
    });
  });

  await test("required destination data is atomic and permission-checked", async () => {
    const required = await m(id.sa, "field", {
      group_id: id.contact,
      key: "destination_required",
      label: "Destination Required",
      type: "short_text",
      required: true,
      scope_mode: "selected",
      targets: [{ scope_type: "branch", scope_id: id.b2 }],
    });
    const before = await revision(e1);
    await assert.rejects(
      m(id.sa, "movement", {
        employee_id: e1,
        expected_version: before,
        type: "transfer",
        target_level: "branch",
        branch_id: id.b2,
        effective_on: date(12),
        reason: "Missing destination data",
      }),
      /requires additional data/,
    );
    assert.equal(await revision(e1), before);
    await m(id.sa, "movement", {
      employee_id: e1,
      expected_version: before,
      type: "transfer",
      target_level: "branch",
      branch_id: id.b2,
      effective_on: date(12),
      reason: "Atomic destination data",
      values: { destination_required: "Synthetic supplied" },
    });
    assert.equal(
      (
        await owner.query(
          "select custom_values->>'destination_required' v from public.employees where id=$1",
          [e1],
        )
      ).rows[0].v,
      "Synthetic supplied",
    );
  });
  await test("inactive and mismatched client destinations are rejected", async () => {
    await owner.query("update public.clients set active=false where id=$1", [
      id.c2,
    ]);
    await assert.rejects(
      m(id.sa, "movement", {
        employee_id: e3,
        expected_version: await revision(e3),
        type: "deployment",
        category: "additional",
        target_level: "client",
        branch_id: id.b2,
        client_id: id.c2,
        effective_on: date(1),
        reason: "Inactive client",
      }),
      /inactive or invalid/,
    );
    await owner.query("update public.clients set active=true where id=$1", [
      id.c2,
    ]);
    await assert.rejects(
      m(id.sa, "movement", {
        employee_id: e3,
        expected_version: await revision(e3),
        type: "deployment",
        category: "additional",
        target_level: "client",
        branch_id: id.b1,
        client_id: id.c2,
        effective_on: date(1),
        reason: "Wrong parent",
      }),
      /inactive or invalid/,
    );
  });
  await test("permission preview explains each action without impersonation escaping", async () => {
    const p = await as(id.sa, (c) =>
      c
        .query("select public.permission_preview($1) r", [
          { user_id: id.admin, target_level: "branch", branch_id: id.b1 },
        ])
        .then((r) => r.rows[0].r),
    );
    assert.equal(
      p.find((f) => f.key === "secret_note").decisions.R.allowed,
      false,
    );
    assert.match(
      p.find((f) => f.key === "secret_note").decisions.R.reason,
      /explicit field/,
    );
    assert.equal((await q(id.sa, "context")).profile.id, id.sa);
  });
  await test("creation rejects inconsistent scopes; immediate transfer blocks stale origin", async () => {
    await assert.rejects(
      m(id.admin, "employee_create", {
        target_level: "unassigned",
        branch_id: id.b1,
        values: { name: "Invalid scope" },
      }),
      { code: "22023" },
    );
    const record = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: { name: "Synthetic immediate transfer" },
    });
    assert((await q(id.admin, "employee", { id: record.id })).employee);
    await m(id.sa, "movement", {
      employee_id: record.id,
      expected_version: 1,
      type: "transfer",
      target_level: "branch",
      branch_id: id.b2,
      effective_on: today,
      reason: "Synthetic transfer today",
      values: { destination_required: "Synthetic destination" },
    });
    await assert.rejects(q(id.admin, "employee", { id: record.id }), {
      code: "42501",
    });
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: record.id,
        expected_version: 1,
        values: { name: "Stale scope" },
      }),
      { code: "42501" },
    );
  });
  await test("record archive requires independent capability, D scope and current revision", async () => {
    const record = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: { name: "Synthetic archive" },
    });
    await assert.rejects(
      m(id.viewer, "employee_delete", { id: record.id, expected_version: 1 }),
      { code: "42501" },
    );
    await assert.rejects(
      m(id.admin, "employee_delete", { id: record.id, expected_version: 0 }),
      { code: "40001" },
    );
    await m(id.admin, "employee_delete", {
      id: record.id,
      expected_version: 1,
    });
    await assert.rejects(q(id.admin, "employee", { id: record.id }), {
      code: "42501",
    });
    assert(
      (
        await owner.query(
          "select deleted_at from public.employees where id=$1",
          [record.id],
        )
      ).rows[0].deleted_at,
    );
  });
  await test("workbook policy races reject stale approval and cross-branch client rows", async () => {
    const book = (await worker("workbooks")).find((b) => b.branch_id === id.b1);
    const p = {
      ...book,
      row_version: book.row_version,
      reason: "Synthetic approval revision",
    };
    await m(id.sa, "workbook", p);
    await assert.rejects(m(id.sa, "workbook", p), { code: "40001" });
    await assert.rejects(
      m(id.sa, "workbook", {
        ...p,
        row_version: book.row_version + 1,
        allowed_clients: [id.c2],
      }),
      /belong to this workbook/,
    );
  });
  await test("applicability preview reports retained values without returning PII", async () => {
    const f = (await q(id.sa, "schema")).fields.find(
      (f) => f.key === "destination_required",
    );
    const result = await as(id.sa, (c) =>
      c
        .query("select public.field_scope_preview($1) r", [
          { id: f.id, scope_mode: "selected", targets: [] },
        ])
        .then((r) => r.rows[0].r),
    );
    assert.equal(result.resolved_targets, 0);
    assert(result.affected_visible_values >= 1);
    assert.deepEqual(Object.keys(result).sort(), [
      "affected_visible_values",
      "resolved_targets",
      "revision",
    ]);
    await assert.rejects(
      as(id.viewer, (c) =>
        c.query("select public.field_scope_preview($1)", [
          { id: f.id, scope_mode: "all" },
        ]),
      ),
      { code: "42501" },
    );
  });
  await test("definition defaults, display settings and invalid bounds are enforced", async () => {
    const field = await m(id.sa, "field", {
      group_id: id.contact,
      key: "synthetic_priority",
      label: "Synthetic Priority",
      type: "integer",
      default_value: 7,
      validation: { min: 1, max: 10 },
      display_order: 17,
      list_eligible: false,
    });
    const saved = (await q(id.sa, "schema")).fields.find(
      (f) => f.id === field.id,
    );
    assert.equal(saved.display_order, 17);
    assert.equal(saved.list_eligible, false);
    const record = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: { name: "Synthetic default" },
    });
    assert.equal(
      (await q(id.sa, "employee", { id: record.id })).employee.values
        .synthetic_priority,
      7,
    );
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "invalid_default",
        label: "Invalid default",
        type: "integer",
        default_value: 9,
        validation: { max: 2 },
      }),
      { code: "22023" },
    );
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "invalid_bounds",
        label: "Invalid bounds",
        type: "integer",
        validation: { min: 9, max: 2 },
      }),
      { code: "22023" },
    );
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "invalid_choices",
        label: "Invalid choices",
        type: "select",
        options: ["Same", "Same"],
      }),
      { code: "22023" },
    );
  });
  await test("scope references reject nonexistent organizations", async () => {
    await assert.rejects(
      m(id.sa, "scope", {
        user_id: id.admin,
        scope_type: "branch",
        scope_id: randomUUID(),
        actions: ["R"],
        reason: "Synthetic invalid reference",
      }),
      { code: "23503" },
    );
  });
  await test("multicolumn bulk commits all authorized rows and preserves hidden values", async () => {
    const records = [];
    for (let i = 0; i < 2; i++)
      records.push(
        await m(id.sa, "employee_create", {
          target_level: "branch",
          branch_id: id.b1,
          values: {
            name: "Synthetic bulk " + i,
            secret_note: "Hidden preserved " + i,
          },
        }),
      );
    await m(id.admin, "bulk_update", {
      rows: records.map((r) => ({ id: r.id, row_version: 1 })),
      values: { name: "Synthetic bulk changed", email: "bulk@example.invalid" },
    });
    for (const [i, r] of records.entries()) {
      const row = (await q(id.sa, "employee", { id: r.id })).employee;
      assert.equal(row.values.name, "Synthetic bulk changed");
      assert.equal(row.values.email, "bulk@example.invalid");
      assert.equal(row.values.secret_note, "Hidden preserved " + i);
      assert(
        !(
          "email" in
          (await q(id.admin, "employee", { id: r.id })).employee.values
        ),
      );
    }
  });
  const records = (user, payload) =>
    as(user, (c) =>
      c
        .query("select public.record_page($1) r", [payload])
        .then((r) => r.rows[0].r),
    );
  let identityClient,
    otherIdentityClient,
    identityEmployee,
    identityNumber,
    reader;
  await test("client IDs allocate twenty concurrent five-digit numbers independently from System IDs", async () => {
    identityClient = randomUUID();
    otherIdentityClient = randomUUID();
    await owner.query(
      "insert into public.clients(id,branch_id,code,name) values($1,$2,'COM','Identity Company ABC'),($3,$2,'XYZ','Identity Company XYZ')",
      [identityClient, id.b1, otherIdentityClient],
    );
    const created = await concurrent(
      "employee_create",
      Array.from({ length: 20 }, (_, i) => ({
        target_level: "client",
        branch_id: id.b1,
        client_id: identityClient,
        values: { name: `Identity Test ${i}` },
      })),
    );
    assert.equal(created.filter((r) => r.ok).length, 20);
    const ids = (
      await owner.query(
        "select sequence_number,client_employee_number from public.employee_client_ids where client_id=$1 order by sequence_number",
        [identityClient],
      )
    ).rows;
    assert.deepEqual(
      ids.map((r) => r.sequence_number),
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    assert.equal(ids[0].client_employee_number, "COM-00001");
    assert.equal(ids[19].client_employee_number, "COM-00020");
    identityEmployee = created[0].result.id;
    identityNumber = (await q(id.sa, "employee", { id: identityEmployee }))
      .employee.values.client_employee_number;
    assert.match(identityNumber, /^COM-\d{5}$/);
    const systemId = (await q(id.sa, "employee", { id: identityEmployee }))
      .employee.values.employee_number;
    assert.match(systemId, /^EMP-/);
    const scheduled = await m(id.sa, "movement", {
      employee_id: identityEmployee,
      expected_version: await revision(identityEmployee),
      type: "reassignment",
      target_level: "client",
      branch_id: id.b1,
      client_id: otherIdentityClient,
      effective_on: date(1),
      reason: "Identity scheduled transfer",
    });
    assert.equal(
      (await q(id.sa, "employee", { id: identityEmployee })).employee.values
        .client_employee_number,
      identityNumber,
    );
    assert.equal(
      (
        await owner.query(
          "select app_private.effective_value(e,'client_employee_number',$2::date) value from public.employees e where id=$1",
          [identityEmployee, date(1)],
        )
      ).rows[0].value,
      "XYZ-00001",
    );
    await m(id.sa, "void_movement", {
      id: scheduled.id,
      expected_version: await revision(identityEmployee),
      reason: "Identity scheduled correction",
    });
    assert.equal(
      (
        await owner.query(
          "select app_private.effective_value(e,'client_employee_number',$2::date) value from public.employees e where id=$1",
          [identityEmployee, date(1)],
        )
      ).rows[0].value,
      identityNumber,
    );
    await m(id.sa, "movement", {
      employee_id: identityEmployee,
      expected_version: await revision(identityEmployee),
      type: "temporary",
      target_level: "client",
      branch_id: id.b1,
      client_id: otherIdentityClient,
      effective_on: today,
      ends_on: date(3),
      reason: "Identity secondary placement",
    });
    assert.equal(
      (
        await owner.query(
          "select client_employee_number from public.employee_client_ids where employee_id=$1 and client_id=$2",
          [identityEmployee, otherIdentityClient],
        )
      ).rows[0].client_employee_number,
      "XYZ-00001",
    );
    assert.equal(
      (await q(id.sa, "employee", { id: identityEmployee })).employee.values
        .client_employee_number,
      identityNumber,
    );
    await owner.query("select app_private.ensure_client_employee_id($1,$2)", [
      identityEmployee,
      identityClient,
    ]);
    assert.equal(
      (
        await owner.query(
          "select employee_id_counter from public.clients where id=$1",
          [identityClient],
        )
      ).rows[0].employee_id_counter,
      20,
    );
    assert.equal(
      (await q(id.sa, "employee", { id: identityEmployee })).employee.values
        .employee_number,
      systemId,
    );
  });
  await test("client code, identity mutation, exhaustion and rollback are enforced in PostgreSQL", async () => {
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: identityEmployee,
        expected_version: await revision(identityEmployee),
        values: { client_employee_number: "COM-99999" },
      }),
      { code: "22023" },
    );
    await assert.rejects(
      owner.query("update public.clients set code='NEW' where id=$1", [
        identityClient,
      ]),
      { code: "22023" },
    );
    const exhausted = randomUUID();
    await owner.query(
      "insert into public.clients(id,branch_id,code,name,employee_id_counter) values($1,$2,'FULL','Identity Exhaustion',99999)",
      [exhausted, id.b1],
    );
    const before = (
      await owner.query("select count(*)::int n from public.employees")
    ).rows[0].n;
    await assert.rejects(
      m(id.sa, "employee_create", {
        target_level: "client",
        branch_id: id.b1,
        client_id: exhausted,
        values: { name: "Must rollback" },
      }),
      { code: "22023" },
    );
    assert.equal(
      (await owner.query("select count(*)::int n from public.employees"))
        .rows[0].n,
      before,
    );
    await assert.rejects(
      as(id.admin, (c) => c.query("select * from public.employee_client_ids")),
      { code: "42501" },
    );
  });
  await test("record history paging is deterministic beyond 100 rows and dates/states combine", async () => {
    await owner.query(
      "insert into public.employee_movements(employee_id,type,effective_on,reason,payload,actor_id) select $1,'position',$2::date,'Record page test',jsonb_build_object('position','Position '||n),$3 from generate_series(1,125) n",
      [identityEmployee, today, id.sa],
    );
    const first = await records(id.sa, {
      kind: "movements",
      search: "Identity Test 0",
      types: ["position"],
      limit: 100,
      sort: "effective_on",
      direction: "desc",
    });
    const second = await records(id.sa, {
      kind: "movements",
      search: "Identity Test 0",
      types: ["position"],
      limit: 100,
      offset: 100,
      sort: "effective_on",
      direction: "desc",
    });
    assert.equal(first.total, 125);
    assert.equal(first.items.length, 100);
    assert.equal(second.items.length, 25);
    assert.equal(
      new Set([...first.items, ...second.items].map((r) => r.id)).size,
      125,
    );
    assert.deepEqual(
      (
        await records(id.sa, {
          kind: "movements",
          search: "Identity Test 0",
          types: ["position"],
          limit: 100,
          sort: "effective_on",
          direction: "desc",
        })
      ).items.map((r) => r.id),
      first.items.map((r) => r.id),
    );
    assert.equal(
      (
        await records(id.sa, {
          kind: "movements",
          search: "Identity Test 0",
          types: ["position"],
          from: date(1),
          limit: 25,
        })
      ).total,
      0,
    );
    await assert.rejects(
      records(id.sa, { kind: "movements", limit: 1000 }),
      /Invalid pagination/,
    );
  });
  await test("record searches/counts and client IDs honor field denial and live scope revocation", async () => {
    reader = randomUUID();
    await owner.query("insert into auth.users values($1)", [reader]);
    await owner.query(
      "insert into public.user_profiles(id,display_name,role) values($1,'Record Reader','viewer')",
      [reader],
    );
    await owner.query(
      "insert into public.user_scope_grants(user_id,scope_type,scope_id,include_descendants,actions) values($1,'branch',$2,true,array['R'])",
      [reader, id.b1],
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) values($1,$2,'R','allow',true)",
      [reader, id.core],
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'R','deny' from public.field_definitions where key in ('name','client_employee_number')",
      [reader],
    );
    assert.equal(
      (await records(reader, { kind: "movements", search: "Identity Test 0" }))
        .total,
      0,
    );
    assert.equal(
      (await q(reader, "employees", { search: identityNumber, sort: "id" }))
        .total,
      0,
    );
    assert.equal(
      (await q(reader, "employee", { id: identityEmployee })).employee.values
        .client_employee_number,
      undefined,
    );
    await assert.rejects(records(reader, { kind: "audit" }), { code: "42501" });
    await owner.query(
      "update public.user_profiles set role='admin' where id=$1",
      [reader],
    );
    await owner.query(
      "insert into public.capability_grants values($1,'audit_read')",
      [reader],
    );
    const events = await records(reader, { kind: "audit" });
    assert(
      events.items.every((r) => !("reason" in r) && !("changed_keys" in r)),
    );
    assert.equal(
      (
        await records(reader, {
          kind: "audit",
          search: "Identity secondary placement",
        })
      ).total,
      0,
    );
    await owner.query(
      "update public.user_scope_grants set active=false where user_id=$1",
      [reader],
    );
    assert.equal((await records(reader, { kind: "movements" })).total, 0);
    assert.equal((await records(reader, { kind: "audit" })).total, 0);
    assert.equal((await records(reader, { kind: "organization" })).total, 0);
  });
  await test("1000-row realistic query profile records observed latency and plan", async () => {
    await owner.query(
      "insert into public.employees(name) select 'Synthetic Load '||lpad(n::text,5,'0') from generate_series(1,1000) n",
    );
    const timings = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      const page = await q(id.sa, "employees", {
        search: "Synthetic Load",
        limit: 100,
        sort: "name",
      });
      assert.equal(page.total, 1000);
      assert.equal(page.items.length, 100);
      timings.push(Math.round(performance.now() - t));
    }
    const plan = await owner.query(
      "explain (analyze,format json) select id from public.employees where deleted_at is null order by updated_at,id limit 100",
    );
    results.push({
      name: "query profile observation",
      syntheticRows: 1000,
      latenciesMs: timings,
      plan: plan.rows[0]["QUERY PLAN"],
      outboxBacklog: Number(
        (
          await owner.query(
            "select count(*) n from public.sync_outbox where status<>'synced'",
          )
        ).rows[0].n,
      ),
      sheetsApiRequests: 0,
      googleIntegration: "Not configured; no live API calls",
    });
  });
  await mkdir(".test-db/reports/verification", { recursive: true });
  await writeFile(
    ".test-db/reports/verification/database.json",
    JSON.stringify(
      {
        runtime:
          "Native disposable PostgreSQL 18; simulated Supabase auth.uid, real ACL/RLS/transactions/locks/constraints",
        verifiedAt: new Date().toISOString(),
        migrationVersions,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `${results.filter((r) => r.ms !== undefined).length} database checks passed`,
  );
} finally {
  for (const c of opened) await c.end().catch(() => {});
  if (owner) await owner.end();
  // pg_ctl gives PostgreSQL a clean shutdown (taskkill can strand Windows io workers).
  if (process.platform === "win32" && db.process?.exitCode === null) {
    await run(
      resolve(
        "node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe",
      ),
      ["-D", databaseDir, "-m", "fast", "-w", "stop"],
      { windowsHide: true },
    ).catch(() => {});
  }
  if (db.process?.exitCode === null) await db.stop().catch(() => {});
}
