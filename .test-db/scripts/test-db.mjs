import { testPasswordReceipts } from "./test-password-receipts.mjs";
import { testEmployeeImport } from "./test-employee-import.mjs";
import { testParentInheritance } from "./test-parent-inheritance.mjs";
import { testPermissionMatrix } from "./test-permission-matrix.mjs";
import { testEmergencyAddress } from "./test-emergency-address.mjs";
import { testEmploymentRules } from "./test-employment-rules.mjs";
import { testAuditFixes } from "./test-audit-fixes.mjs";
import { testFunctionFixes } from "./test-function-fixes.mjs";
import { testEmployeeCategory } from "./test-employee-category.mjs";
import { testInputNormalization } from "./test-input-normalization.mjs";
import { testAccessReview } from "./test-access-review.mjs";
import EmbeddedPostgres from "embedded-postgres";
import { employeeFixture, identityPolicyGrantSql } from "./employee-fixtures.mjs";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:net";
const users = Number(process.env.TEST_CONCURRENCY_USERS || 20);
assert(
  Number.isInteger(users) && users >= 20 && users <= 50,
  "TEST_CONCURRENCY_USERS must be 20-50",
);
// Let the OS choose an available port, avoiding Windows reserved ranges.
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const selected = server.address().port;
    server.close((error) => (error ? reject(error) : resolvePort(selected)));
  });
});
const run = promisify(execFile),
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
  migrationVersions = [],
  loadPrincipals = [];
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
      .query("select public.tracker_mutate($1,$2,$3) r", [
        op,
        employeeFixture(op, p),
        req,
      ])
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
async function concurrent(
  operation,
  payloads,
  principals = [],
  requestIds = [],
) {
  return Promise.all(
    payloads.map(async (p, i) => {
      const c = db.getPgClient();
      await c.connect();
      opened.push(c);
      const started = performance.now();
      try {
        return {
          ok: true,
          result: await as(
            principals[i] || id.sa,
            (c) =>
              c
                .query("select public.tracker_mutate($1,$2,$3) r", [
                  operation,
                  employeeFixture(operation, p),
                  requestIds[i] || randomUUID(),
                ])
                .then((r) => r.rows[0].r),
            "authenticated",
            c,
          ),
        };
      } catch (e) {
        return { ok: false, code: e.code };
      } finally {
        results.push({
          name: "load request",
          operation,
          latencyMs: Math.round(performance.now() - started),
        });
        await c.end();
        opened.splice(opened.indexOf(c), 1);
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
    if (file === "20261011000200_default_addresses.sql")
      await owner.query(`
      insert into public.field_groups(id,name) values('11111111-1111-1111-1111-111111111111','Legacy emergency information');
      insert into public.field_definitions(id,group_id,key,label,type) values('11111111-1111-1111-1111-111111111112','11111111-1111-1111-1111-111111111111','emergency_name','Legacy emergency name','short_text');
      insert into public.field_definitions(id,group_id,key,label,type,sensitivity) values('11111111-1111-1111-1111-111111111113','11111111-1111-1111-1111-111111111111','emergency_contact_private','Legacy restricted emergency contact','short_text','restricted');
      insert into public.field_access_policies(role,group_id,action,effect,inherit_new) values('admin','11111111-1111-1111-1111-111111111111','R','allow',true);
    `);
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
  // These fixtures deliberately hide contact data, even when Core is now its
  // permission parent. Preserve that boundary with an explicit child deny.
  for (const who of [id.viewer, id.client])
    await owner.query(
      "insert into public.field_access_policies(user_id,group_id,action,effect) values($1,$2,'R','deny')",
      [who,id.contact],
    );
  // Explicit C-only ID grants let ordinary security fixtures create complete
  // profiles without exposing restricted IDs or broadening organization scope.
  await owner.query(
    "insert into public.field_access_policies(role,field_id,action,effect) select 'admin',id,'C','allow' from public.field_definitions where validation ? 'government_id_digits'",
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
  if (process.env.TEST_PARENT_ONLY === "true") {
    await testParentInheritance({owner,test,m,q,as,id,revision});
  } else if (process.env.TEST_IMPORT_ONLY === "true") {
    await testEmployeeImport({owner,test,m,q,as,id});
  } else if (process.env.TEST_INPUT_ONLY === "true") {
    await testInputNormalization({owner,test,m,q,revision,id});
    await testEmployeeCategory({owner,test,m,q,revision,id});
  } else if (process.env.TEST_RBAC_ONLY === "true") {
    await testPermissionMatrix({ owner, test, m, q, as, id, revision });
  } else {
  await test("create profiles allocates permanent IDs and atomic outbox", async () => {
    const initialOutbox = Number((await owner.query("select count(*) n from public.sync_outbox")).rows[0].n);
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
      Number((await owner.query("select count(*) n from public.sync_outbox")).rows[0].n),
      initialOutbox + 2,
    );
  });
  await test("REST identity grants survive display-group renames and expose exactly the scoped employee", async () => {
    const accounts = [randomUUID(), randomUUID()];
    for (const user of accounts) {
      await owner.query("insert into auth.users values($1)", [user]);
      await owner.query(
        "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic REST grant regression','viewer')",
        [user],
      );
      await owner.query(
        "insert into public.user_scope_grants(user_id,scope_type,scope_id,actions) values($1,'branch',$2,array['R'])",
        [user, id.b1],
      );
    }
    const grants = await owner.query(identityPolicyGrantSql, [accounts]);
    assert.equal(grants.rowCount, 4);
    for (const user of accounts) {
      const page = await q(user, "employees", { search: "Synthetic" });
      assert.equal(page.total, 1);
      assert.equal(page.items[0].id, e1);
    }
    await owner.query("delete from public.field_access_policies where user_id=any($1::uuid[])", [accounts]);
    await owner.query("delete from public.user_scope_grants where user_id=any($1::uuid[])", [accounts]);
    await owner.query("delete from public.user_profiles where id=any($1::uuid[])", [accounts]);
    await owner.query("delete from auth.users where id=any($1::uuid[])", [accounts]);
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
      "Test, Synthetic Renamed",
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
    const clearDeny = (await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) values($1,$2,'D','deny') returning id",
      [id.admin,email],
    )).rows[0].id;
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e1,
        expected_version: await revision(e1),
        values: { email: null },
      }),
      { code: "42501" },
    );
    await owner.query("delete from public.field_access_policies where id=$1",[clearDeny]);
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
        separation_category: "VOLUNTARY",
        separation_reason: "Career Growth",
        effective_on: date(2),
        reason: "Conflict",
      }),
      { code: "23P01" },
    );
    await m(id.sa, "employee_update", {
      id: e3,
      expected_version: await revision(e3),
      values: {
        department: "Operations",
        date_hired: "2020-01-01",
        employment_type: "Regular",
      },
    });
    await m(id.sa, "movement", {
      employee_id: e3,
      expected_version: await revision(e3),
      type: "status",
      status: "Resigned",
      separation_category: "VOLUNTARY",
      separation_reason: "Career Growth",
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
          values: { first_name: "Preview only" },
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
  await test(`${users} concurrent same-revision edits: one commit, ${users - 1} conflicts`, async () => {
    const principals = [];
    for (let i = 0; i < users; i++) {
      const user = randomUUID();
      principals.push(user);
      loadPrincipals.push(user);
      await owner.query("insert into auth.users values($1)", [user]);
      await owner.query(
        "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic load principal','admin')",
        [user],
      );
      await owner.query(
        "insert into public.user_scope_grants(user_id,scope_type,actions) values($1,'all',array['C','R','U'])",
        [user],
      );
      await owner.query(
        "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,$2,a,'allow',true from unnest(array['C','R','U']) a",
        [user, id.core],
      );
      await owner.query(
        "insert into public.capability_grants(user_id,capability) select $1,c from unnest(array['employee_create','movement_create','organization_manage']) c",
        [user],
      );
    }
    const started = performance.now();
    const answers = await concurrent(
      "employee_update",
      Array.from({ length: users }, (_, i) => ({
        id: e2,
        expected_version: 1,
        values: { name: `Synthetic Concurrent ${i}` },
      })),
      principals,
    );
    assert.equal(answers.filter((a) => a.ok).length, 1);
    assert.equal(answers.filter((a) => a.code === "40001").length, users - 1);
    results.push({
      name: "concurrency observation",
      users,
      commits: 1,
      expectedConflicts: users - 1,
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
      "samples",
      "scoped_employee_count",
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
  await test("creation applicability preview is read-only, scope-bound and projects identity columns", async () => {
    const user = randomUUID();
    await owner.query("insert into auth.users values($1)", [user]);
    await owner.query(
      "insert into public.user_profiles(id,display_name,role) values($1,'Preview administrator','admin')",
      [user],
    );
    await owner.query(
      "insert into public.capability_grants(user_id,capability) values($1,'schema_manage')",
      [user],
    );
    await owner.query(
      "insert into public.user_scope_grants(user_id,scope_type,scope_id,actions,include_descendants) values($1,'branch',$2,array['R'],true)",
      [user, id.b1],
    );
    const nameField = (await q(id.sa, "schema")).fields.find(
      (f) => f.key === "name",
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) values($1,$2,'R','allow')",
      [user, nameField.id],
    );
    const before = (
      await owner.query("select revision from public.system_state")
    ).rows[0].revision;
    const draftPreview = (u, p) =>
      as(u, (c) =>
        c
          .query("select public.field_scope_preview($1) r", [p])
          .then((r) => r.rows[0].r),
      );
    const hiddenParts = await draftPreview(user, { scope_mode: "all" });
    assert.equal(hiddenParts.scoped_employee_count, 0);
    assert.deepEqual(hiddenParts.samples, []);
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'R','allow' from public.field_definitions where key=any(array['last_name','first_name','middle_name','suffix'])",
      [user],
    );
    const result = await draftPreview(user, { scope_mode: "all" });
    assert.equal(result.resolved_targets, 2); // Assigned branch and its one client only.
    assert(result.scoped_employee_count > 0);
    assert(result.samples.length > 0 && result.samples.length <= 5);
    result.samples.forEach((s) => assert.deepEqual(Object.keys(s), ["name"]));
    const excluded = await draftPreview(user, {
      scope_mode: "selected",
      targets: [
        { scope_type: "branch", scope_id: id.b2, include_descendants: true },
      ],
    });
    assert.equal(excluded.resolved_targets, 0);
    assert.equal(excluded.scoped_employee_count, 0);
    assert.deepEqual(excluded.samples, []);
    await owner.query(
      "delete from public.field_access_policies where user_id=$1",
      [user],
    );
    const hidden = await draftPreview(user, { scope_mode: "all" });
    assert.equal(hidden.scoped_employee_count, 0);
    assert.deepEqual(hidden.samples, []);
    await assert.rejects(draftPreview(user, { scope_mode: "invalid" }), {
      code: "22023",
    });
    await assert.rejects(
      draftPreview(user, { scope_mode: "all", id: randomUUID() }),
      /unavailable/,
    );
    await owner.query(
      "update public.user_profiles set active=false where id=$1",
      [user],
    );
    await assert.rejects(draftPreview(user, { scope_mode: "all" }), {
      code: "42501",
    });
    await assert.rejects(
      as(
        null,
        (c) =>
          c.query("select public.field_scope_preview($1)", [
            { scope_mode: "all" },
          ]),
        "anon",
      ),
      { code: "42501" },
    );
    assert.equal(
      (await owner.query("select revision from public.system_state")).rows[0]
        .revision,
      before,
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
      assert.equal(row.values.name, "Test, Synthetic bulk changed");
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
  await test("Address defaults reuse legacy emergency IDs and preserve inherited/direct permission precedence", async () => {
    const defaults = await q(id.sa, "context");
    assert(defaults.groups.some((g) => g.name === "Address"));
    assert(defaults.fields.some((f) => f.key === "current_barangay"));
    assert(!defaults.fields.some((f) => f.key === "region"));
    assert(
      !defaults.fields.some((f) => f.key === "emergency_contact_name"),
      "Reuse the existing emergency-name field rather than duplicate it",
    );
    const legacy = defaults.fields.find((f) => f.key === "emergency_name");
    assert.equal(legacy.id, "11111111-1111-1111-1111-111111111112");
    assert.equal(legacy.group_name, "Address");
    const decide = (key) =>
      as(
        id.admin,
        (c) =>
          c.query(
            "select app_private.field_decision($1,'R','branch',$2,null) r",
            [key, id.b1],
          ),
        "postgres",
      ).then((r) => r.rows[0].r);
    assert.equal((await decide("emergency_name")).allowed, true);
    assert.equal((await decide("emergency_contact_private")).allowed, false);
    assert.equal(
      (await decide("address")).allowed,
      true,
      "Normal Address fields inherit the active Personal Information parent grant",
    );
    assert.match((await decide("address")).reason,/Parent group Personal Information allow/);
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) values($1,$2,'R','deny')",
      [id.admin, legacy.id],
    );
    assert.equal((await decide("emergency_name")).allowed, false);
    await assert.rejects(
      as(id.viewer, (c) =>
        c.query("select * from app_private.address_barangays"),
      ),
      { code: "42501" },
    );
  });
  await test("official address hierarchy is enforced in PostgreSQL and normalized names/provinceless cities work", async () => {
    const good = {
      name: "Official Address Test",
      address: "12 Test Street",
      province: "Davao del Sur",
      city_municipality: "Davao City",
      barangay: "AGDAO",
      postal_code: "9999",
      current_city_municipality: "Caloocan City",
      current_province: null,
    };
    const e = (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: good,
      })
    ).id;
    assert.equal(
      (await q(id.sa, "employee", { id: e })).employee.values.postal_code,
      "9999",
    );
    for (const values of [
      { province: "Pangasinan" },
      { barangay: "Agd" },
      { province: "Imaginary" },
      { current_province: "Davao del Sur" },
    ])
      await assert.rejects(
        m(id.sa, "employee_update", {
          id: e,
          expected_version: await revision(e),
          values,
        }),
        { code: "22023" },
      );
    const provinceDeny = (await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'U','deny' from public.field_definitions where key='province' returning id",
      [id.admin],
    )).rows[0].id;
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: e,
        expected_version: await revision(e),
        values: { province: "Davao del Sur" },
      }),
      { code: "42501" },
    );
    await owner.query("delete from public.field_access_policies where id=$1",[provinceDeny]);
    assert.equal(
      (await q(id.sa, "employee", { id: e })).employee.values.province,
      "Davao del Sur",
    );
    assert.equal(
      (
        await owner.query(
          "select count(*) n from app_private.address_barangays",
        )
      ).rows[0].n,
      "42011",
    );
  });
  await test("invalid address creation and bulk edits roll back employee values, audit, versions and outbox", async () => {
    const totals = async () =>
      (
        await owner.query(
          "select (select count(*) from public.employees) employees,(select count(*) from public.audit_log) audit,(select count(*) from public.sync_outbox) outbox",
        )
      ).rows[0];
    const before = await totals();
    await assert.rejects(
      m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: {
          name: "Bad Address",
          province: "Pangasinan",
          city_municipality: "Davao City",
          barangay: "Agdao",
        },
      }),
      { code: "22023" },
    );
    assert.deepEqual(await totals(), before);
    const a = (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: {
          name: "Bulk Address One",
          province: "Davao del Sur",
          city_municipality: "City of Davao",
          barangay: "Agdao",
        },
      })
    ).id;
    const b = (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: {
          name: "Bulk Address Two",
          province: "Pangasinan",
          city_municipality: "Malasiqui",
          barangay: "Agdao",
        },
      })
    ).id;
    const av = await revision(a),
      bv = await revision(b),
      snapshot = await totals();
    await assert.rejects(
      m(id.sa, "bulk_update", {
        rows: [
          { id: a, row_version: av },
          { id: b, row_version: bv },
        ],
        values: { city_municipality: "City of Davao" },
      }),
      { code: "22023" },
    );
    assert.equal(await revision(a), av);
    assert.equal(await revision(b), bv);
    assert.deepEqual(await totals(), snapshot);
  });
  await test("concurrent address edits retain one versioned winner and never commit a mixed hierarchy", async () => {
    const e = (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: { name: "Concurrent Address Test" },
      })
    ).id;
    const responses = await concurrent(
      "employee_update",
      [
        {
          id: e,
          expected_version: await revision(e),
          values: {
            province: "Davao del Sur",
            city_municipality: "Davao City",
            barangay: "Agdao",
          },
        },
        {
          id: e,
          expected_version: await revision(e),
          values: {
            province: "Pangasinan",
            city_municipality: "Malasiqui",
            barangay: "Agdao",
          },
        },
      ],
      [id.sa, id.sa],
    );
    assert.equal(responses.filter((r) => r.ok).length, 1);
    const current = (await q(id.sa, "employee", { id: e })).employee.values;
    await owner.query("select app_private.validate_address($1,'')", [current]);
  });
  await test(`${users}-user mixed load protects retries, branch revisions, transfers and worker claims`, async () => {
    const branch = await m(id.sa, "organization", {
      kind: "branch",
      code: "LOAD",
      name: "Synthetic workload branch",
    });
    const firstMetric = results.length;
    const summary = [];
    const observe = (operation, answers, commits, conflicts = 0) => {
      const succeeded = answers.filter((a) => a.ok).length;
      const expected = answers.filter((a) => a.code === "40001").length;
      assert.equal(succeeded, commits);
      assert.equal(expected, conflicts);
      assert.equal(answers.length, succeeded + expected);
      summary.push({
        operation,
        requests: answers.length,
        successfulResponses: succeeded,
        expectedConflicts: expected,
        unexpectedErrors: 0,
      });
    };
    const retryId = randomUUID(),
      createPayload = {
        target_level: "head_office",
        values: { name: "Synthetic retry workload" },
      };
    const retries = await concurrent(
      "employee_create",
      Array(users).fill(createPayload),
      Array(users).fill(loadPrincipals[0]),
      Array(users).fill(retryId),
    );
    observe("duplicate create retries", retries, users);
    assert.equal(new Set(retries.map((r) => r.result.id)).size, 1);
    assert.equal(
      Number(
        (
          await owner.query(
            "select count(*) n from public.employees where name=$1",
            [createPayload.values.name],
          )
        ).rows[0].n,
      ),
      1,
    );
    const created = await concurrent(
      "employee_create",
      Array.from({ length: users }, (_, i) => ({
        target_level: "head_office",
        values: { name: `Synthetic workload ${i}` },
      })),
      loadPrincipals,
    );
    observe("independent employee creates", created, users);
    assert.equal(new Set(created.map((r) => r.result.id)).size, users);
    const branchWrites = await concurrent(
      "organization",
      Array.from({ length: users }, (_, i) => ({
        kind: "branch",
        id: branch.id,
        expected_version: 1,
        code: "LOAD",
        name: `Synthetic workload branch ${i}`,
        active: true,
      })),
      loadPrincipals,
    );
    observe("same-revision branch updates", branchWrites, 1, users - 1);
    const employeeId = created[0].result.id;
    const transfers = await concurrent(
      "movement",
      Array.from({ length: users }, () => ({
        employee_id: employeeId,
        expected_version: 1,
        type: "transfer",
        effective_on: date(1),
        target_level: "branch",
        branch_id: branch.id,
        reason: "Synthetic concurrent transfer",
      })),
      loadPrincipals,
    );
    observe("competing primary transfers", transfers, 1, users - 1);
    assert.equal(await revision(employeeId), 2);
    assert.equal(
      Number(
        (
          await owner.query(
            "select count(*) n from public.employee_movements where employee_id=$1 and voided_at is null",
            [employeeId],
          )
        ).rows[0].n,
      ),
      1,
    );
    assert.equal(
      (
        await owner.query(
          "select count(*) n from public.employee_assignments a join public.employee_assignments b on a.employee_id=b.employee_id and a.id<b.id where a.employee_id=$1 and a.category='primary' and b.category='primary' and not a.voided and not b.voided and daterange(a.starts_on,a.ends_on,'[)') && daterange(b.starts_on,b.ends_on,'[)')",
          [employeeId],
        )
      ).rows[0].n,
      "0",
    );
    const claims = await Promise.all(
      Array.from({ length: users }, async () => {
        const connection = db.getPgClient();
        await connection.connect();
        opened.push(connection);
        return as(
          null,
          (c) =>
            c
              .query("select public.worker_command('claim','{}') r")
              .then((r) => r.rows[0].r),
          "service_role",
          connection,
        );
      }),
    );
    const winner = claims.filter(Boolean);
    assert.equal(winner.length, 1);
    assert(winner[0].token);
    assert.equal(
      Number(
        (
          await owner.query(
            "select count(distinct lease_token) n from public.sync_outbox where status='processing' and lease_until>now()",
          )
        ).rows[0].n,
      ),
      1,
    );
    await worker("retry", { token: winner[0].token });
    const requests = results
      .slice(firstMetric)
      .filter((r) => r.name === "load request");
    const latency = requests.map((r) => r.latencyMs).sort((a, b) => a - b);
    const percentile = (p) => latency[Math.ceil(latency.length * p) - 1];
    results.push({
      name: "mixed workload observation",
      users,
      operations: summary,
      latencyMs: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        max: latency.at(-1),
      },
      expectedConflicts: 2 * (users - 1),
      unexpectedErrorRate: 0,
      workerInvocations: users,
      exclusiveWorkerClaims: 1,
      outboxBacklog: Number(
        (
          await owner.query(
            "select count(*) n from public.sync_outbox where status<>'synced'",
          )
        ).rows[0].n,
      ),
      sheetsApiRequests: 0,
      googleIntegration:
        "No live Google requests; lease and retry correctness only",
    });
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
    const plan = await as(id.sa, (connection) => connection.query(
      "explain (analyze,buffers,format json) select public.tracker_query('employees',$1::jsonb)",
      [{ search: "Synthetic Load", limit: 100, sort: "name" }],
    ));
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
  await test("structured names require separate identity values and preserve legacy records", async () => {
    await assert.rejects(
      as(id.sa, (c) =>
        c.query("select public.tracker_mutate('employee_create',$1,$2)", [
          { values: { name: "Unstructured input" } },
          randomUUID(),
        ]),
      ),
      { code: "22023" },
    );
    const created = await m(id.sa, "employee_create", {
      values: {
        last_name: "Cruz",
        first_name: "Ana",
        middle_name: "Maria",
        suffix: "Jr.",
      },
    });
    const record = (await q(id.sa, "employee", { id: created.id })).employee;
    assert.equal(record.values.name, "Cruz, Ana Maria Jr.");
    assert.equal(record.values.first_name, "Ana");
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: created.id,
        expected_version: record.row_version,
        values: { last_name: null },
      }),
      { code: "22023" },
    );
    const after = (await q(id.sa, "employee", { id: created.id })).employee;
    assert.equal(after.row_version, record.row_version);
    assert.equal(after.values.last_name, "Cruz");
    const legacy = (
      await owner.query(
        "insert into public.employees(name) values('Preserved legacy identity') returning id",
      )
    ).rows[0];
    assert.equal(
      (await q(id.sa, "employee", { id: legacy.id })).employee.values.name,
      "Preserved legacy identity",
    );
    assert.equal(
      (await q(id.sa, "employee", { id: legacy.id })).employee.values
        .first_name,
      null,
    );
  });
  await test("component denials suppress combined name search and permit authorized blind updates", async () => {
    const user = randomUUID();
    await owner.query("insert into auth.users(id) values($1);", [user]);
    await owner.query(
      "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic name operator','admin')",
      [user],
    );
    await owner.query(
      "insert into public.user_scope_grants(user_id,scope_type,actions) values($1,'unassigned',array['C','R','U','D'])",
      [user],
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,group_id,a,'allow',true from public.field_definitions cross join unnest(array['C','R','U','D']) a where key='name'",
      [user],
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'R','deny' from public.field_definitions where key='middle_name'",
      [user],
    );
    const created = await m(id.sa, "employee_create", {
      values: {
        last_name: "Sample",
        first_name: "Accessible",
        middle_name: "HiddenMarkerAlphabet",
      },
    });
    const values = (await q(user, "employee", { id: created.id })).employee
      .values;
    assert(!Object.hasOwn(values, "name"));
    assert(!Object.hasOwn(values, "middle_name"));
    assert.equal(values.first_name, "Accessible");
    assert.equal(
      (await q(user, "employees", { search: "HiddenMarkerAlphabet" })).total,
      0,
    );
    await m(user, "employee_update", {
      id: created.id,
      expected_version: 1,
      values: { middle_name: "UpdatedHiddenMarker" },
    });
    assert.equal(
      (await q(id.sa, "employee", { id: created.id })).employee.values.name,
      "Sample, Accessible UpdatedHiddenMarker",
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'U','deny' from public.field_definitions where key='first_name'",
      [user],
    );
    await assert.rejects(
      m(user, "employee_update", {
        id: created.id,
        expected_version: 2,
        values: { first_name: "Forbidden" },
      }),
      { code: "42501" },
    );
  });
  await test("form tabs are superadmin-only, atomic, versioned and idempotent without policy changes", async () => {
    const groups = (
      await owner.query(
        "select id,row_version,name,tab_name,tab_order from public.field_groups where id=any($1::uuid[]) order by id",
        [[id.core, id.contact]],
      )
    ).rows;
    const p = {
      groups: groups.map((g) => ({
        id: g.id,
        expected_version: g.row_version,
        tab_name: "Personal",
        tab_order: 3,
      })),
    };
    const beforePolicies = (
      await owner.query("select count(*) n from public.field_access_policies")
    ).rows[0].n;
    await assert.rejects(m(id.admin, "form_layout", p), { code: "42501" });
    await assert.rejects(
      m(id.sa, "form_layout", {
        groups: p.groups.map((g, i) => ({
          ...g,
          expected_version: i ? 0 : g.expected_version,
        })),
      }),
      { code: "40001" },
    );
    assert.deepEqual(
      (
        await owner.query(
          "select id,row_version,name,tab_name,tab_order from public.field_groups where id=any($1::uuid[]) order by id",
          [[id.core, id.contact]],
        )
      ).rows,
      groups,
    );
    const request = randomUUID();
    await m(id.sa, "form_layout", p, request);
    await m(id.sa, "form_layout", p, request);
    const saved = (
      await owner.query(
        "select tab_name,tab_order,row_version from public.field_groups where id=any($1::uuid[]) order by id",
        [[id.core, id.contact]],
      )
    ).rows;
    saved.forEach((g, i) => {
      assert.equal(g.tab_name, "Personal");
      assert.equal(g.tab_order, 3);
      assert.equal(Number(g.row_version), Number(groups[i].row_version) + 1);
    });
    assert.equal(
      (await owner.query("select count(*) n from public.field_access_policies"))
        .rows[0].n,
      beforePolicies,
    );
    await assert.rejects(m(id.sa, "form_layout", p), { code: "40001" });
  });
  await test("group renames follow standalone tab names and preserve shared layouts and policies", async () => {
    const gid = randomUUID();
    await owner.query(
      "insert into public.field_groups(id,name,tab_name) values($1,'Renamable entries','Renamable entries')",
      [gid],
    );
    const before = (
      await owner.query("select count(*) n from public.field_access_policies")
    ).rows[0].n;
    const payload = {
      id: gid,
      expected_version: 1,
      name: "Client details",
      active: true,
    };
    await assert.rejects(m(id.viewer, "group", payload), { code: "42501" });
    const request = randomUUID();
    await m(id.sa, "group", payload, request);
    await m(id.sa, "group", payload, request);
    const saved = (
      await owner.query(
        "select name,tab_name,row_version from public.field_groups where id=$1",
        [gid],
      )
    ).rows[0];
    assert.equal(saved.tab_name, "Client details");
    assert.equal(Number(saved.row_version), 2);
    await assert.rejects(m(id.sa, "group", payload), { code: "40001" });
    await m(id.sa, "form_layout", {
      groups: [
        { id: gid, expected_version: 2, tab_name: "Custom tab", tab_order: 45 },
      ],
    });
    await m(id.sa, "group", {
      ...payload,
      expected_version: 3,
      name: "Renamed section",
    });
    assert.equal(
      (
        await owner.query(
          "select tab_name from public.field_groups where id=$1",
          [gid],
        )
      ).rows[0].tab_name,
      "Custom tab",
    );
    const shared = (
      await owner.query(
        "select row_version from public.field_groups where id=$1",
        [id.contact],
      )
    ).rows[0];
    await m(id.sa, "group", {
      id: id.contact,
      expected_version: shared.row_version,
      name: "Contact details",
      active: true,
    });
    assert.equal(
      (
        await owner.query(
          "select tab_name from public.field_groups where id=$1",
          [id.contact],
        )
      ).rows[0].tab_name,
      "Personal",
    );
    assert.equal(
      (await owner.query("select count(*) n from public.field_access_policies"))
        .rows[0].n,
      before,
    );
  });
  await test("profile defaults and initial position use the secured idempotent create transaction", async () => {
    const schema = await q(id.sa, "schema");
    for (const key of [
      "birth_date",
      "gender",
      "civil_status",
      "department",
      "date_hired",
      "employment_type",
      "status_reason",
      "status_effective_date",
      "remarks",
    ])
      assert.equal(schema.fields.filter((f) => f.key === key).length, 1);
    const request = randomUUID();
    const payload = {
      target_level: "branch",
      branch_id: id.b1,
      initial_position: "Initial Analyst",
      values: {
        name: "Synthetic profile entries",
        department: "Operations",
        date_hired: "2026-10-01",
        gender: "Female",
        employment_type: "Regular",
        remarks: "Synthetic fixture",
      },
    };
    const created = await m(id.sa, "employee_create", payload, request);
    assert.equal(
      (await q(id.sa, "employee", { id: created.id })).employee.values.position,
      "Initial Analyst",
    );
    await m(id.sa, "movement", {
      employee_id: created.id,
      expected_version: await revision(created.id),
      type: "position",
      effective_on: today,
      position: "Revised Analyst",
      reason: "Synthetic position revision",
    });
    await m(id.sa, "employee_create", payload, request);
    assert.equal(
      (await q(id.sa, "employee", { id: created.id })).employee.values.position,
      "Revised Analyst",
    );
    await assert.rejects(
      m(id.sa, "employee_create", {
        initial_position: 123,
        values: { name: "Invalid initial position" },
      }),
      { code: "22023" },
    );
    const denied = await m(id.sa, "policy", {
      user_id: id.admin,
      field_id: schema.fields.find((f) => f.key === "position").id,
      action: "C",
      effect: "deny",
      scope_type: "all",
      reason: "Synthetic initial position denial",
    });
    await assert.rejects(
      m(id.admin, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        initial_position: "Forbidden position",
        values: { name: "Synthetic forbidden position" },
      }),
      { code: "42501" },
    );
    await owner.query("delete from public.field_access_policies where id=$1", [
      denied.id,
    ]);
  });
  await test("profile position edits are atomic, authorized, versioned and idempotent movements", async () => {
    const created = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      initial_position: "Analyst",
      values: { name: "Synthetic position edit", department: "Original" },
    });
    const initial = await revision(created.id);
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: created.id,
        expected_version: initial,
        values: { department: "Must roll back" },
        position_change: "",
      }),
      { code: "22023" },
    );
    assert.equal(
      (await q(id.sa, "employee", { id: created.id })).employee.values
        .department,
      "Original",
    );
    assert.equal(await revision(created.id), initial);
    const request = randomUUID();
    const payload = {
      id: created.id,
      expected_version: initial,
      values: { department: "Operations" },
      position_change: "Senior Analyst",
    };
    await m(id.sa, "employee_update", payload, request);
    await m(id.sa, "employee_update", payload, request);
    const detail = await q(id.sa, "employee", { id: created.id });
    assert.equal(detail.employee.values.department, "Operations");
    assert.equal(detail.employee.values.position, "Senior Analyst");
    assert.equal(
      detail.movements.filter((x) => x.type === "position").length,
      1,
    );
    const current = await revision(created.id);
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: created.id,
        expected_version: current,
        values: { department: "Conflict rollback" },
        position_change: "Other position",
      }),
      { code: "23P01" },
    );
    assert.equal(
      (await q(id.sa, "employee", { id: created.id })).employee.values
        .department,
      "Operations",
    );
    assert.equal(await revision(created.id), current);
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: created.id,
        expected_version: current,
        values: { position: "Bypass" },
      }),
      { code: "22023" },
    );
    const other = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: { name: "Synthetic position policy" },
    });
    const schema = await q(id.sa, "schema");
    const denied = await m(id.sa, "policy", {
      user_id: id.admin,
      field_id: schema.fields.find((f) => f.key === "position").id,
      action: "U",
      effect: "deny",
      scope_type: "all",
      reason: "Synthetic profile position denial",
    });
    await assert.rejects(
      m(id.admin, "employee_update", {
        id: other.id,
        expected_version: await revision(other.id),
        values: {},
        position_change: "Forbidden",
      }),
      { code: "42501" },
    );
    await owner.query("delete from public.field_access_policies where id=$1", [
      denied.id,
    ]);
    const before = await revision(other.id);
    const results = await Promise.allSettled(
      ["One", "Two"].map((position) =>
        m(id.sa, "employee_update", {
          id: other.id,
          expected_version: before,
          values: {},
          position_change: position,
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  });
  await test("employment typo corrections preserve movements, enforce CRUD and share versioned idempotency", async () => {
    const created = await m(id.sa, "employee_create", { target_level: "branch", branch_id: id.b1, initial_position: "Analist", values: { name: "Synthetic employment corrections", department: "Operatons" } });
    const initial = await revision(created.id);
    const p = { id: created.id, expected_version: initial, values: { department: "Operations" }, employment: { change_kind: "correction", position: "Analyst" } };
    const request = randomUUID();
    await m(id.sa, "employee_update", p, request);
    await m(id.sa, "employee_update", p, request);
    let detail = await q(id.sa, "employee", { id: created.id });
    assert.equal(detail.employee.values.position, "Analyst");
    assert.equal(detail.employee.values.department, "Operations");
    assert.equal(detail.movements.length, 0);
    await assert.rejects(m(id.sa, "employee_update", p), { code: "40001" });
    await assert.rejects(as(id.sa, c => c.query("select * from app_private.position_text_corrections")), { code: "42501" });
    const denied = await m(id.sa, "policy", { user_id: id.admin, field_id: (await q(id.sa, "schema")).fields.find(f => f.key === "position").id, action: "U", effect: "deny", scope_type: "all", reason: "Synthetic correction denial" });
    await assert.rejects(m(id.admin, "employee_update", { ...p, expected_version: await revision(created.id), values: {} }), { code: "42501" });
    await owner.query("delete from public.field_access_policies where id=$1", [denied.id]);
    await m(id.sa, "employee_update", { id: created.id, expected_version: await revision(created.id), values: { department: "Support" }, employment: { change_kind: "official", position: "Senior Analist" } });
    const history = (await q(id.sa, "employee", { id: created.id })).movements;
    assert.equal(history.length, 1);
    const recorded = (await owner.query("select payload,previous_state from public.employee_movements where id=$1", [history[0].id])).rows[0];
    assert.equal(recorded.payload.department, "Support");
    assert.equal(recorded.previous_state.department, "Operations");
    const endpoints = (await records(id.sa, { kind: "movements", search: "Senior Analist" })).items.find(r => r.id === history[0].id);
    assert.ok(endpoints.from_value.includes("Analyst"));
    assert.ok(endpoints.from_value.includes("Operations"));
    assert.ok(endpoints.to_value.includes("Senior Analist"));
    assert.ok(endpoints.to_value.includes("Support"));
    const endpointScope = (await owner.query("insert into public.user_scope_grants(user_id,scope_type,actions) values($1,'all',array['R']) returning id", [id.admin])).rows[0].id;
    const readDeny = await m(id.sa, "policy", { user_id: id.admin, field_id: (await q(id.sa, "schema")).fields.find(f => f.key === "department").id, action: "R", effect: "deny", scope_type: "all", reason: "Synthetic endpoint denial" });
    const restricted = (await records(id.admin, { kind: "movements", search: "Senior Analist" })).items.find(r => r.id === history[0].id);
    assert.ok(restricted);
    assert.equal(restricted.from_value, "Analyst");
    assert.equal(restricted.to_value, "Senior Analist");
    assert.ok(!(await records(id.admin, { kind: "movements", search: "Support" })).items.some(r => r.id === history[0].id));
    await owner.query("delete from public.field_access_policies where id=$1", [readDeny.id]);
    await owner.query("delete from public.user_scope_grants where id=$1", [endpointScope]);
    await m(id.sa, "employee_update", { id: created.id, expected_version: await revision(created.id), values: {}, employment: { change_kind: "correction", position: "Senior Analyst" } });
    detail = await q(id.sa, "employee", { id: created.id });
    assert.equal(detail.employee.values.position, "Senior Analyst");
    assert.equal(detail.movements.length, 1);
    assert.deepEqual((await owner.query("select payload,previous_state from public.employee_movements where id=$1", [history[0].id])).rows[0], recorded);
    const version = await revision(created.id);
    const contenders = await Promise.allSettled(["Senior Analyst I", "Senior Analyst II"].map(position => m(id.sa, "employee_update", { id: created.id, expected_version: version, values: {}, employment: { change_kind: "correction", position } })));
    assert.equal(contenders.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(contenders.filter(r => r.status === "rejected").length, 1);
    assert.ok(Number((await owner.query("select count(*) n from public.audit_log where entity_id=$1 and operation='typo_correction'", [created.id])).rows[0].n) >= 3);
    const transfer = await m(id.sa, "movement", { employee_id: created.id, expected_version: await revision(created.id), type: "transfer", target_level: "branch", branch_id: id.b2, effective_on: date(1), values: { destination_required: "Synthetic supplied" }, reason: "Synthetic endpoint transfer" });
    const transferRow = (await records(id.sa, { kind: "movements", search: "Synthetic employment corrections", types: ["transfer"] })).items.find(r => r.id === transfer.id);
    const branches = (await owner.query("select id,name from public.branches where id=any($1::uuid[])", [[id.b1, id.b2]])).rows;
    assert.equal(transferRow.from_value, branches.find(b => b.id === id.b1).name);
    assert.equal(transferRow.to_value, branches.find(b => b.id === id.b2).name);
  });
  await test("non-active employment requires complete values and status transitions cannot use typo mode", async () => {
    const created = await m(id.sa, "employee_create", { initial_position: "Analyst", values: { name: "Synthetic employment status" } });
    const initial = await revision(created.id);
    await assert.rejects(m(id.sa, "employee_update", { id: created.id, expected_version: initial, values: {}, employment: { change_kind: "official", status: "Inactive" } }), { code: "22023" });
    assert.equal(await revision(created.id), initial);
    const values = { department: "Operations", date_hired: "2020-01-01", employment_type: "Regular", status_effective_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }), separation_category: "VOLUNTARY", separation_reason: "Others (specify)" };
    await assert.rejects(m(id.sa, "employee_update", { id: created.id, expected_version: initial, values, employment: { change_kind: "official", status: "Separated" } }), { code: "22023" });
    await assert.rejects(m(id.sa, "employee_update", { id: created.id, expected_version: initial, values: { ...values, separation_details: "Relocating" }, employment: { change_kind: "correction", status: "Inactive" } }), { code: "22023" });
    await m(id.sa, "employee_update", { id: created.id, expected_version: initial, values: { ...values, separation_details: "Relocating" }, employment: { change_kind: "official", status: "Separated" } });
    const detail = await q(id.sa, "employee", { id: created.id });
    assert.equal(detail.employee.values.status, "Separated");
    assert.equal(detail.employee.values.separation_details, "Relocating");
    assert.equal(detail.movements.filter(m => m.type === "status").length, 1);
    const statusRow = (await records(id.sa, { kind: "movements", search: "Synthetic employment status" })).items.find(r => r.type === "status");
    assert.equal(statusRow.from_value, "Active");
    assert.equal(statusRow.to_value, "Separated");
    await assert.rejects(m(id.sa, "employee_update", { id: created.id, expected_version: await revision(created.id), values: { department: null }, employment: { change_kind: "correction" } }), { code: "22023" });
  });
  await test("optional government IDs allow missing and cleared values while retaining format validation", async () => {
    const before = (
      await owner.query(
        "select (select count(*) from public.employees) employees,(select count(*) from public.audit_log) audit,(select count(*) from public.sync_outbox) outbox",
      )
    ).rows[0];
    const withoutIds = await as(id.sa, (c) =>
      c.query("select public.tracker_mutate('employee_create',$1,$2) r", [
        { values: { first_name: "Missing", last_name: "IDs" } }, randomUUID(),
      ]));
    const missingDetail = await q(id.sa, "employee", { id: withoutIds.rows[0].r.id });
    for (const key of ["bir_tin", "sss_number", "philhealth_pin", "pagibig_mid"]) assert.equal(missingDetail.employee.values[key], null);
    const after = (
      await owner.query(
        "select (select count(*) from public.employees) employees,(select count(*) from public.audit_log) audit,(select count(*) from public.sync_outbox) outbox",
      )
    ).rows[0];
    assert.equal(Number(after.employees), Number(before.employees) + 1);
    assert.ok(Number(after.audit) > Number(before.audit));
    const created = await m(id.sa, "employee_create", {
      values: {
        name: "Synthetic government IDs",
        bir_tin: "012-345-678",
        sss_number: "01-2345678-9",
        philhealth_pin: "01-234567890-1",
        pagibig_mid: "0123-4567-8901",
      },
    });
    const detail = await q(id.sa, "employee", { id: created.id });
    assert.equal(detail.employee.values.bir_tin, "012345678");
    assert.equal(detail.employee.values.sss_number, "0123456789");
    assert.equal(detail.employee.values.philhealth_pin, "012345678901");
    assert.equal(detail.employee.values.pagibig_mid, "012345678901");
    for (const key of [
      "bir_tin",
      "sss_number",
      "philhealth_pin",
      "pagibig_mid",
    ])
      for (const value of ["123", "01234567890A", 123456789])
        await assert.rejects(
          m(id.sa, "employee_update", {
            id: created.id,
            expected_version: detail.employee.row_version,
            values: { [key]: value },
          }),
          { code: "22023" },
        );
    assert.equal(await revision(created.id), detail.employee.row_version);
    await m(id.sa, "employee_update", {
      id: created.id, expected_version: detail.employee.row_version,
      values: { bir_tin: null, sss_number: null, philhealth_pin: null, pagibig_mid: null },
    });
    const cleared = await q(id.sa, "employee", { id: created.id });
    for (const key of ["bir_tin", "sss_number", "philhealth_pin", "pagibig_mid"]) assert.equal(cleared.employee.values[key], null);
    const legacy = (
      await owner.query(
        "insert into public.employees(name,custom_values) values('Legacy missing IDs',jsonb_build_object('bir_tin',null)) returning id",
      )
    ).rows[0].id;
    await m(id.sa, "employee_update", {
      id: legacy,
      expected_version: 1,
      values: { remarks: "Preserve existing missing IDs" },
    });
    assert.equal(
      (await q(id.sa, "employee", { id: legacy })).employee.values.bir_tin,
      null,
    );
  });
  await test("government IDs remain restricted and cannot inherit group read access or leak through search", async () => {
    const schema = await q(id.sa, "schema");
    const ids = schema.fields.filter((f) => f.validation?.government_id_digits);
    assert.equal(ids.length, 4);
    for (const f of ids) {
      assert.equal(f.required, false);
      assert.equal(f.sensitivity, "restricted");
      assert.equal(f.list_eligible, true);
    }
    const created = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: { name: "Synthetic private IDs", bir_tin: "012345678", sss_number: "0123456789", philhealth_pin: "012345678901", pagibig_mid: "012345678901" },
    });
    await owner.query(
      "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) values($1,$2,'R','allow',true)",
      [id.admin, ids[0].group_id],
    );
    const detail = await q(id.admin, "employee", { id: created.id });
    for (const f of ids) assert(!Object.hasOwn(detail.employee.values, f.key));
    const result = await q(id.admin, "employees", {
      search: "012345678901",
      limit: 25,
      offset: 0,
    });
    assert.equal(result.total, 0);
    // Eligibility permits personal layouts, never grants access to the value.
    const tin = ids.find((f) => f.key === "bir_tin");
    const grant = await m(id.sa, "policy", { user_id: id.admin, field_id: tin.id, action: "R", effect: "allow", scope_type: "all", reason: "Synthetic explicit ID read" });
    const authorized = await q(id.admin, "employee", { id: created.id });
    assert.equal(authorized.employee.values.bir_tin, "012345678");
    for (const f of ids.filter((f) => f.key !== "bir_tin")) assert(!Object.hasOwn(authorized.employee.values, f.key));
    const columns = (await q(id.admin, "context")).fields;
    assert.ok(columns.find((f) => f.key === "bir_tin").actions.includes("R"));
    const deny = await m(id.sa, "policy", { id: grant.id, user_id: id.admin, field_id: tin.id, action: "R", effect: "deny", scope_type: "all", reason: "Synthetic ID read revocation" });
    assert(!Object.hasOwn((await q(id.admin, "employee", { id: created.id })).employee.values, "bir_tin"));
    assert.equal((await q(id.admin, "employees", { search: "012345678", limit: 25, offset: 0 })).total, 0);
    await owner.query("delete from public.field_access_policies where id=any($1::uuid[])", [[grant.id, deny.id]]);
  });
  await test("field configuration bounds, typed defaults and superadmin ownership", async () => {
    for (const validation of [
      { input_width: 9 },
      { input_width: 81 },
      { input_width: 12.5 },
      { max_length: 0 },
      { max_length: 10001 },
      { input_width: "wide" },
    ]) {
      await assert.rejects(
        m(id.sa, "field", {
          group_id: id.contact,
          key: "invalid_field_sizing",
          label: "Invalid field sizing",
          type: "short_text",
          validation,
        }),
        { code: "22023" },
      );
    }
    await assert.rejects(
      m(id.admin, "field", {
        group_id: id.contact,
        key: "unauthorized_field_config",
        label: "Unauthorized field config",
        type: "select",
        options: ["Yes", "No"],
      }),
      { code: "42501" },
    );
    const field = await m(id.sa, "field", {
      group_id: id.contact,
      key: "configured_check",
      label: "Configured check",
      type: "checkbox",
      default_value: false,
      validation: { input_width: 18 },
    });
    const stored = (await q(id.sa, "schema")).fields.find(
      (f) => f.id === field.id,
    );
    assert.equal(stored.default_value, false);
    assert.equal(stored.validation.input_width, 18);
    await assert.rejects(
      m(id.admin, "field", {
        ...stored,
        expected_version: stored.row_version,
        default_value: true,
      }),
      { code: "42501" },
    );
    const created = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: { name: "Synthetic configured default" },
    });
    assert.equal(
      (await q(id.sa, "employee", { id: created.id })).employee.values
        .configured_check,
      false,
    );
    await assert.rejects(
      m(id.sa, "field", {
        group_id: id.contact,
        key: "bad_check_default",
        label: "Bad check default",
        type: "checkbox",
        default_value: "false",
      }),
      { code: "22023" },
    );
  });
  await test("audit From/To retains actual changes and enforces field, scope, capability and rollback boundaries", async () => {
    const created = await m(id.sa, "employee_create", {target_level: "branch", branch_id: id.b1, initial_position: "Analyst", values: {last_name: "TEST", first_name: "JUAN"}});
    const v = await revision(created.id), request = randomUUID();
    const patch = {id: created.id, expected_version: v, values: {first_name: "JUANA", phone: "09123456789"}};
    await m(id.sa, "employee_update", patch, request); await m(id.sa, "employee_update", patch, request);
    const changed = (await records(id.sa, {kind: "audit", search: "JUANA"})).items.filter(a => a.entity_id === created.id && a.operation === "update");
    assert.equal(changed.length, 1); assert.ok(changed[0].from_value.includes("JUAN")); assert.ok(!changed[0].from_value.includes("JUANA")); assert.ok(changed[0].to_value.includes("JUANA"));
    const immutable = (await owner.query("select before_values,after_values from app_private.audit_value_changes where audit_id=$1 order by id", [changed[0].id])).rows;
    await assert.rejects(as(id.admin, c => c.query("select * from app_private.audit_value_changes")), {code: "42501"});
    await assert.rejects(records(id.viewer, {kind: "audit"}), {code: "42501"});
    await m(id.sa, "capability", {user_id: id.admin, capability: "audit_read", reason: "Synthetic audit capability"});
    assert.ok((await records(id.admin, {kind: "audit", search: "JUANA"})).items.some(a => a.id === changed[0].id));
    const firstName = (await q(id.sa, "schema")).fields.find(f => f.key === "first_name");
    const deny = await m(id.sa, "policy", {user_id: id.admin, field_id: firstName.id, action: "R", effect: "deny", scope_type: "all", reason: "Synthetic audit name denial"});
    assert.equal((await records(id.admin, {kind: "audit", search: "JUANA"})).total, 0);
    const privateRow = (await records(id.admin, {kind: "audit", search: "09123456789"})).items.find(a => a.id === changed[0].id);
    assert.ok(privateRow); assert.ok(!privateRow.from_value.includes("JUAN")); assert.ok(!privateRow.to_value.includes("JUANA"));
    const beforeCount = (await owner.query("select count(*)::int n from app_private.audit_value_changes")).rows[0].n;
    await assert.rejects(m(id.sa, "employee_update", {id: created.id, expected_version: await revision(created.id), values: {first_name: "INVALID_AUDIT_VALUE", phone: "bad"}}), {code: "22023"});
    assert.equal((await owner.query("select count(*)::int n from app_private.audit_value_changes")).rows[0].n, beforeCount);
    await m(id.sa, "employee_update", {id: created.id, expected_version: await revision(created.id), values: {}, employment: {change_kind: "correction", position: "Senior Analyst"}});
    const position = (await records(id.sa, {kind: "audit", search: "Senior Analyst"})).items.find(a => a.entity_id === created.id && a.operation === "typo_correction");
    assert.equal(position.from_value, "Position: Analyst"); assert.equal(position.to_value, "Position: Senior Analyst");
    assert.deepEqual((await owner.query("select before_values,after_values from app_private.audit_value_changes where audit_id=$1 order by id", [changed[0].id])).rows, immutable);
    await owner.query("delete from public.field_access_policies where id=$1", [deny.id]);
    const grants = (await owner.query("update public.user_scope_grants set active=false where user_id=$1 and active returning id", [id.admin])).rows.map(r => r.id);
    assert.equal((await records(id.admin, {kind: "audit", search: "JUANA"})).total, 0);
    await owner.query("update public.user_scope_grants set active=true where id=any($1::uuid[])", [grants]);
    const currentVersion = await revision(created.id);
    const races = await concurrent("employee_update", ["JUANA I", "JUANA II"].map(first_name => ({id: created.id, expected_version: currentVersion, values: {first_name}})));
    assert.equal(races.filter(r => r.ok).length, 1);
    const latest = (await records(id.sa, {kind: "audit", search: "JUANA"})).items.filter(a => a.entity_id === created.id && a.operation === "update");
    assert.equal(latest.length, 2);
    const winner = latest.find(a => a.id !== changed[0].id);
    assert.ok(winner.from_value.includes("First Name: JUANA"));
    const winningName = (await q(id.sa, "employee", {id: created.id})).employee.values.first_name;
    assert.equal((await owner.query("select after_values->>'first_name' value from app_private.audit_value_changes where audit_id=$1 and after_values ? 'first_name'", [winner.id])).rows[0].value, winningName);
  });
  await test("form hierarchy is two-level, versioned, concurrent-safe and does not alter field permissions", async () => {
    const parent = (await m(id.sa, "group", {name:"Hierarchy parent"})).id;
    const child = (await m(id.sa, "group", {name:"Hierarchy child",parent_group_id:parent})).id;
    assert.equal((await owner.query("select parent_group_id from public.field_groups where id=$1",[child])).rows[0].parent_group_id,parent);
    await assert.rejects(m(id.viewer,"group",{name:"Unauthorized hierarchy",parent_group_id:parent}),error=>error.code==='42501');
    await assert.rejects(m(id.sa,"group",{name:"Third level",parent_group_id:child}),/top-level parent/);
    await assert.rejects(m(id.sa,"group",{id:parent,name:"Hierarchy parent",parent_group_id:child,expected_version:1}),/top-level parent/);
    await assert.rejects(m(id.sa,"group",{id:child,name:"Hierarchy child",parent_group_id:child,expected_version:1}),/top-level parent/);
    await assert.rejects(m(id.sa,"group",{id:child,name:"Hierarchy child",parent_group_id:null,expected_version:99}),/Revision conflict/);
    const races = await concurrent("group",[{id:child,name:"Hierarchy child",parent_group_id:null,expected_version:1},{id:child,name:"Hierarchy child",parent_group_id:parent,expected_version:1}]);
    assert.equal(races.filter(r=>r.ok).length,1);
    const before = await owner.query("select group_id from public.field_definitions where key='birth_date'");
    const schema = await q(id.sa,"schema");
    const f = schema.fields.find(f=>f.key==='birth_date');
    const decisions = await as(id.sa,c=>c.query("select public.permission_preview($1) r",[{user_id:id.viewer,target_level:'branch',branch_id:id.b1}]).then(r=>r.rows[0].r));
    await m(id.sa,'field',{...f,form_group_id:child,expected_version:f.row_version,targets:[]});
    const after=await owner.query("select group_id,form_group_id from public.field_definitions where key='birth_date'");
    assert.equal(after.rows[0].group_id,before.rows[0].group_id);
    assert.equal(after.rows[0].form_group_id,child);
    const afterDecisions = await as(id.sa,c=>c.query("select public.permission_preview($1) r",[{user_id:id.viewer,target_level:'branch',branch_id:id.b1}]).then(r=>r.rows[0].r));
    assert.deepEqual(afterDecisions.find(v=>v.key==='birth_date').actions,decisions.find(v=>v.key==='birth_date').actions);
    const version=(await owner.query("select row_version from public.field_definitions where id=$1",[f.id])).rows[0].row_version;
    await assert.rejects(m(id.sa,'field',{...f,form_group_id:randomUUID(),expected_version:version,targets:[]}),/foreign key/);
  });

  await test("manual IDs are client-scoped, normalized, atomic, and idempotent", async () => {
    const c = randomUUID(), other = randomUUID();
    await owner.query("insert into public.clients(id,branch_id,code,name) values($1,$2,'MID','Manual identity test'),($3,$2,'MIO','Other manual identity test')", [c,id.b1,other]);
    const settings = (user, payload, request=randomUUID()) => as(user, connection => connection.query("select public.set_client_settings($1,$2) r", [payload,request]).then(r=>r.rows[0].r));
    const cfg = {client_id:c,expected_version:0,filter_keys:['status'],id_mode:'manual',reason:'Synthetic ID mode test'};
    await settings(id.sa,cfg);
    assert.equal((await as(id.sa, connection=>connection.query("select public.client_settings($1) r",[{client_id:c}]))).rows[0].r.id_mode,'manual');
    await settings(id.sa,{...cfg,client_id:other});
    const payload = {target_level:'client',branch_id:id.b1,client_id:c,values:{last_name:'Manual',first_name:'Identity'}};
    const before=(await owner.query("select count(*)::int n from public.employees")).rows[0].n;
    await assert.rejects(m(id.sa,'employee_create',payload),{code:'22023'});
    await assert.rejects(m(id.sa,'employee_create',{...payload,manual_client_id:'bad space'}),{code:'22023'});
    assert.equal((await owner.query("select count(*)::int n from public.employees")).rows[0].n,before);
    const request=randomUUID(), input={...payload,manual_client_id:'  ab-00001  '};
    const employee=await m(id.sa,'employee_create',input,request);
    assert.deepEqual(await m(id.sa,'employee_create',input,request),employee);
    assert.equal((await q(id.sa,'employee',{id:employee.id})).employee.values.client_employee_number,'AB-00001');
    await assert.rejects(m(id.sa,'employee_create',{...payload,manual_client_id:'Ab-00001'}),{code:'23505'});
    const same=await m(id.sa,'employee_create',{...payload,client_id:other,manual_client_id:'AB-00001'});
    assert.equal((await q(id.sa,'employee',{id:same.id})).employee.values.client_employee_number,'AB-00001');
    assert.equal((await owner.query("select employee_id_counter from public.clients where id=$1",[c])).rows[0].employee_id_counter,0);
    await assert.rejects(settings(id.sa,{...cfg,expected_version:0}),/changed/);
    await assert.rejects(settings(id.admin,{...cfg,expected_version:1}),{code:'42501'});
    const reserved=await m(id.sa,'employee_create',{...payload,manual_client_id:'MID-00001'});
    await settings(id.sa,{...cfg,expected_version:1,id_mode:'automatic'});
    const auto=await m(id.sa,'employee_create',payload);
    assert.equal((await q(id.sa,'employee',{id:auto.id})).employee.values.client_employee_number,'MID-00002');
    assert.equal((await q(id.sa,'employee',{id:reserved.id})).employee.values.client_employee_number,'MID-00001');
    await assert.rejects(m(id.sa,'employee_create',{...payload,manual_client_id:'MANUAL'}),{code:'22023'});
  });
  await test("twenty concurrent manual ID creators have exactly one winner", async () => {
    const c=randomUUID();
    await owner.query("insert into public.clients(id,branch_id,code,name) values($1,$2,'RAC','Manual race test')",[c,id.b1]);
    await as(id.sa,connection=>connection.query("select public.set_client_settings($1,$2)",[{client_id:c,expected_version:0,filter_keys:['status'],id_mode:'manual',reason:'Synthetic ID race test'},randomUUID()]));
    const raced=await concurrent('employee_create',Array.from({length:20},(_,i)=>({target_level:'client',branch_id:id.b1,client_id:c,manual_client_id:'000023',values:{last_name:'Race',first_name:String(i)}})));
    assert.equal(raced.filter(r=>r.ok).length,1);
    const entries=(await owner.query("select manual_id,sequence_number,client_employee_number from public.employee_client_ids where client_id=$1",[c])).rows;
    assert.deepEqual(entries,[{manual_id:'000023',sequence_number:null,client_employee_number:'000023'}]);
  });
  await test("manual movement previews roll back IDs and field denial blocks issuance", async () => {
    const c=randomUUID();
    await owner.query("insert into public.clients(id,branch_id,code,name) values($1,$2,'MOV','Manual movement identity test')",[c,id.b1]);
    await as(id.sa,connection=>connection.query("select public.set_client_settings($1,$2)",[{client_id:c,expected_version:0,filter_keys:['status'],id_mode:'manual',reason:'Synthetic movement ID test'},randomUUID()]));
    const employee=await m(id.sa,'employee_create',{target_level:'branch',branch_id:id.b1,values:{last_name:'Movement',first_name:'Identity'}});
    const payload={employee_id:employee.id,expected_version:await revision(employee.id),type:'reassignment',target_level:'client',branch_id:id.b1,client_id:c,effective_on:date(1),manual_client_id:'MOV-00023',reason:'Synthetic manual reassignment'};
    await as(id.sa,connection=>connection.query("select public.transaction_preview($1,$2)",['movement',payload]));
    assert.equal((await owner.query("select count(*)::int n from public.employee_client_ids where client_id=$1",[c])).rows[0].n,0);
    const deny=(await owner.query("insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'C','deny' from public.field_definitions where key='client_employee_number' returning id",[id.admin])).rows[0].id;
    await assert.rejects(m(id.admin,'movement',payload),error=>error.code==='42501' && error.message.includes('Creating an ID'));
    assert.equal((await owner.query("select count(*)::int n from public.employee_client_ids where client_id=$1",[c])).rows[0].n,0);
    await owner.query("delete from public.field_access_policies where id=$1",[deny]);
    const movement=await m(id.admin,'movement',payload);
    const stored=(await owner.query("select payload from public.employee_movements where id=$1",[movement.id])).rows[0].payload;
    assert.equal(Object.hasOwn(stored,'manual_client_id'),false);
    assert.equal((await owner.query("select client_employee_number from public.employee_client_ids where employee_id=$1 and client_id=$2",[employee.id,c])).rows[0].client_employee_number,'MOV-00023');
    await assert.rejects(as(id.admin,connection=>connection.query("select * from public.employee_client_ids")),{code:'42501'});
  });
  await test("omitted and null field sensitivity cannot declassify restricted values", async () => {
    const f = await m(id.sa, "field", {
      group_id: id.core,
      key: "audit_restricted_regression",
      label: "Audit restricted regression",
      type: "short_text",
      sensitivity: "restricted",
      scope_mode: "selected",
      options: [],
      validation: {},
      targets: [{ scope_type: "branch", scope_id: id.b1 }],
    });
    const employee = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      values: {
        last_name: "Restricted",
        first_name: "Regression",
        audit_restricted_regression: "Synthetic private value",
      },
    });
    const input = {
      id: f.id,
      expected_version: 1,
      group_id: id.core,
      key: "audit_restricted_regression",
      label: "Audit restricted regression",
      type: "short_text",
      options: [],
      validation: {},
    };
    for (const extra of [{}, { sensitivity: null }]) {
      const version = (
        await owner.query(
          "select row_version from public.field_definitions where id=$1",
          [f.id],
        )
      ).rows[0].row_version;
      await m(id.admin, "field", {
        ...input,
        expected_version: version,
        ...extra,
      });
      assert.equal((await owner.query("select scope_mode from public.field_definitions where id=$1",[f.id])).rows[0].scope_mode,"selected");
      assert.deepEqual((await owner.query("select scope_type,scope_id from public.field_scope_targets where field_id=$1",[f.id])).rows,[{scope_type:"branch",scope_id:id.b1}]);
      assert.equal(
        (
          await owner.query(
            "select sensitivity from public.field_definitions where id=$1",
            [f.id],
          )
        ).rows[0].sensitivity,
        "restricted",
      );
      assert.equal(
        Object.hasOwn(
          (await q(id.admin, "employee", { id: employee.id })).employee.values,
          "audit_restricted_regression",
        ),
        false,
      );
    }
    const version = (
      await owner.query(
        "select row_version from public.field_definitions where id=$1",
        [f.id],
      )
    ).rows[0].row_version;
    await assert.rejects(
      m(id.admin, "field", {
        ...input,
        expected_version: version,
        sensitivity: "normal",
      }),
      { code: "42501" },
    );
  });
  await test("inactive requirements cover direct status, ordinary and bulk writes without blocking unrelated legacy edits", async () => {
    const employee = await m(id.sa, "employee_create", {
      initial_position: "Analyst",
      values: { last_name: "Inactive", first_name: "Guard" },
    });
    const status = {
      employee_id: employee.id,
      expected_version: 1,
      type: "status",
      status: "Inactive",
      effective_on: today,
      reason: "Synthetic inactive guard",
    };
    await assert.rejects(m(id.sa, "movement", status), { code: "22023" });
    const complete = {
      department: "Operations",
      date_hired: "2020-01-01",
      employment_type: "Regular",
      status_effective_date: today,
      separation_category: "VOLUNTARY",
      separation_reason: "Retirement",
    };
    await m(id.sa, "employee_update", {
      id: employee.id,
      expected_version: 1,
      values: complete,
    });
    await m(id.sa, "movement", {
      ...status,
      expected_version: await revision(employee.id),
      status: "Separated",
      separation_category: "VOLUNTARY",
      separation_reason: "Retirement",
    });
    const version = await revision(employee.id);
    const counts = async () =>
      (
        await owner.query(
          "select (select count(*) from public.audit_log) audit,(select count(*) from public.sync_outbox) outbox",
        )
      ).rows[0];
    const before = await counts();
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: employee.id,
        expected_version: version,
        values: { department: null },
      }),
      { code: "22023" },
    );
    await assert.rejects(
      m(id.sa, "bulk_update", {
        rows: [{ id: employee.id, row_version: version }],
        values: { date_hired: null },
      }),
      { code: "22023" },
    );
    assert.deepEqual(await counts(), before);
    assert.equal(await revision(employee.id), version);
    // Old incomplete profiles remain editable outside employment fields.
    await owner.query(
      "update public.employees set custom_values=custom_values-'department' where id=$1",
      [employee.id],
    );
    await m(id.sa, "employee_update", {
      id: employee.id,
      expected_version: version,
      values: { email: "legacy-edit@example.invalid" },
    });
    assert.equal(
      (await q(id.sa, "employee", { id: employee.id })).employee.values.email,
      "legacy-edit@example.invalid",
    );
  });
  await test("same-day non-active creation is valid and void restores the initial placement", async () => {
    const employee = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      initial_position: "Analyst",
      values: {
        last_name: "Same day",
        first_name: "Inactive",
        department: "Operations",
        date_hired: "2020-01-01",
        employment_type: "Regular",
        status_effective_date: today,
        separation_category: "VOLUNTARY",
        separation_reason: "Retirement",
      },
      initial_employment: { change_kind: "official", status: "Inactive" },
    });
    const detail = await q(id.sa, "employee", { id: employee.id });
    assert.equal(detail.employee.values.status, "Inactive");
    const movement = (
      await owner.query(
        "select id from public.employee_movements where employee_id=$1 and type='status'",
        [employee.id],
      )
    ).rows[0].id;
    await m(id.sa, "void_movement", {
      id: movement,
      expected_version: await revision(employee.id),
      reason: "Synthetic same-day reversal",
    });
    const restored = await q(id.sa, "employee", { id: employee.id });
    assert.equal(restored.employee.values.status, "Active");
    assert.equal(restored.employee.values.branch, "Example North Branch");
  });
  await test("voiding department movements restores values and rejects overwriting later corrections", async () => {
    const employee = await m(id.sa, "employee_create", {
      target_level: "branch",
      branch_id: id.b1,
      initial_position: "Analyst",
      values: {
        last_name: "Department",
        first_name: "Reversal",
        department: "Operations",
      },
    });
    await m(id.sa, "employee_update", {
      id: employee.id,
      expected_version: 1,
      values: { department: "Sales" },
      employment: { change_kind: "official" },
    });
    const movement = (
      await owner.query(
        "select id from public.employee_movements where employee_id=$1",
        [employee.id],
      )
    ).rows[0].id;
    await m(id.sa, "employee_update", {
      id: employee.id,
      expected_version: await revision(employee.id),
      values: { department: "Sales corrected" },
      employment: { change_kind: "correction" },
    });
    await assert.rejects(
      m(id.sa, "void_movement", {
        id: movement,
        expected_version: await revision(employee.id),
        reason: "Cannot overwrite later correction",
      }),
      { code: "40001" },
    );
    await m(id.sa, "employee_update", {
      id: employee.id,
      expected_version: await revision(employee.id),
      values: { department: "Sales" },
      employment: { change_kind: "correction" },
    });
    await m(id.sa, "void_movement", {
      id: movement,
      expected_version: await revision(employee.id),
      reason: "Synthetic department reversal",
    });
    assert.equal(
      (await q(id.sa, "employee", { id: employee.id })).employee.values
        .department,
      "Operations",
    );
    const reversal = (
      await records(id.sa, { kind: "audit", search: "Operations" })
    ).items.find(
      (row) => row.entity_id === employee.id && row.operation === "void",
    );
    assert.ok(reversal);
    assert.ok(reversal.from_value.includes("Sales"));
    assert.ok(reversal.to_value.includes("Operations"));
  });
  await test("scheduler skips idle, backoff and live leases but preserves calendar reconciliation", async () => {
    const schedule = await readFile("supabase/ops/schedule-sync.sql", "utf8");
    const guard = schedule.slice(
      schedule.indexOf("  where not exists"),
      schedule.lastIndexOf("  $job$"),
    );
    assert.ok(guard.startsWith("  where not exists"));
    await owner.query("begin");
    try {
      await owner.query("delete from public.sync_outbox where true");
      await owner.query(
        "update public.system_state set last_sync_date=app_private.today() where id=true",
      );
      const due = async () =>
        (await owner.query(`select true ${guard}`)).rowCount > 0;
      assert.equal(await due(), false);
      await owner.query(
        "insert into public.sync_outbox(action,revision,next_retry) values('test',1,now()+interval '1 hour')",
      );
      assert.equal(await due(), false);
      await owner.query(
        "update public.sync_outbox set next_retry=now() where true",
      );
      assert.equal(await due(), true);
      await owner.query(
        "update public.sync_outbox set status='processing',lease_until=now()+interval '15 minutes' where true",
      );
      assert.equal(await due(), false);
      await owner.query(
        "update public.sync_outbox set lease_until=now()-interval '1 minute' where true",
      );
      assert.equal(await due(), true);
      await owner.query("delete from public.sync_outbox where true");
      await owner.query(
        "update public.system_state set last_sync_date=app_private.today()-1 where id=true",
      );
      assert.equal(await due(), true);
    } finally {
      await owner.query("rollback");
    }
  });
  await test("typed projection preserves pages and records same-database cost comparison", async () => {
    const optimized = (
      await owner.query(
        "select pg_get_functiondef('app_private.readable_employee_rows()'::regprocedure) definition",
      )
    ).rows[0].definition;
    const source = await readFile(
      "supabase/migrations/20261010001100_statement_scoped_read_projection.sql",
      "utf8",
    );
    const baseline = source
      .match(
        /create function app_private\.readable_employee_rows\(\)[\s\S]+?\$\$;/,
      )[0]
      .replace("create function", "create or replace function");
    const timings = {};
    let expected;
    try {
      for (const [label, definition] of [
        ["baseline", baseline],
        ["typed", optimized],
      ]) {
        await owner.query(definition);
        timings[label] = [];
        for (let sample = 0; sample < 3; sample++) {
          const started = performance.now();
          const page = await q(id.sa, "employees", {
            search: "Synthetic Load",
            sort: "name",
            limit: 100,
            offset: 100,
          });
          timings[label].push(Math.round(performance.now() - started));
          if (expected) assert.deepEqual(page, expected);
          else expected = page;
        }
      }
      results.push({
        name: "projection cost comparison",
        syntheticRows: 1000,
        latenciesMs: timings,
      });
    } finally {
      await owner.query(optimized);
    }
  });
  await test("single-pass export matches deterministic pages without widening public pagination", async () => {
    const filter = {
      search: "Synthetic Load",
      sort: "name",
      direction: "desc",
    };
    const expected = [];
    for (let offset = 0; offset < 1000; offset += 100)
      expected.push(
        ...(await q(id.sa, "employees", { ...filter, limit: 100, offset }))
          .items,
      );
    const started = performance.now();
    const exported = await as(
      id.sa,
      async (c) =>
        (await c.query("select public.export_employees($1) r", [filter]))
          .rows[0].r,
    );
    assert.equal(exported.items.length, 1000);
    assert.deepEqual(exported.items, expected);
    results.push({
      name: "single-pass 1000-row export",
      latencyMs: Math.round(performance.now() - started),
    });
    await assert.rejects(
      q(id.sa, "employees", { limit: 10001 }),
      /Invalid pagination/,
    );
    await assert.rejects(
      as(id.sa, (c) => c.query("select app_private.employee_page('{}',true)")),
      { code: "42501" },
    );
  });
  await testEmploymentRules({ owner, test, q, m, as, concurrent, revision, id, today, date });
  await testAuditFixes({ owner, test, q, m, worker, revision, id });
  await testFunctionFixes({ owner, test, m, worker, id });
  await testEmployeeCategory({ owner, test, m, q, revision, id });
  await testParentInheritance({owner,test,m,q,as,id,revision});
  await testEmployeeImport({owner,test,m,q,as,id});
  await testInputNormalization({owner,test,m,q,revision,id});
  await testAccessReview({ owner, test, m, as, id, today, date });
  await testEmergencyAddress({ owner, test, m, q, revision, id, today });
  await testPasswordReceipts({ owner, test, as, id });
  await testPermissionMatrix({ owner, test, m, q, as, id, revision });
  }
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
