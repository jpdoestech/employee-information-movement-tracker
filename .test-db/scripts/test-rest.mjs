// Run against a disposable Supabase project, never an employee production database.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
let env = { ...process.env };
if (process.argv.includes("--local-cli")) {
  const bundled = resolve(
    `node_modules/supabase/bin/supabase${process.platform === "win32" ? ".exe" : ""}`,
  );
  const { stdout } = await promisify(execFile)(
    existsSync(bundled) ? bundled : "supabase",
    ["status", "-o", "env"],
  );
  for (const match of stdout.matchAll(/^([A-Z_]+)="([^"]*)"/gm))
    env[match[1]] = match[2];
}
const url = env.TEST_SUPABASE_URL || env.API_URL,
  key =
    env.TEST_SUPABASE_PUBLISHABLE_KEY || env.PUBLISHABLE_KEY || env.ANON_KEY,
  service = env.TEST_SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY,
  database = env.TEST_DATABASE_URL || env.DB_URL;
if (!url || !key || !service || !database)
  throw new Error(
    "Disposable Supabase URL, public key, backend key and database URL are required. No real credentials are logged.",
  );
if (
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) &&
  env.TEST_ALLOW_DISPOSABLE_REMOTE !== "true"
)
  throw new Error(
    "Remote testing requires explicit TEST_ALLOW_DISPOSABLE_REMOTE=true for a disposable project",
  );
const owner = new pg.Client({ connectionString: database });
await owner.connect();
const admin = createClient(url, service, { auth: { persistSession: false } }),
  results = [];
async function test(name, fn) {
  await fn();
  results.push(name);
  console.log(`PASS ${name}`);
}
const uid = [];
const publicClients = [];
try {
  if (process.argv.includes("--local-cli")) {
    await test("Supabase REST role retains its safeupdate guard", async () => {
      const configured = await owner.query(`
        select exists (
          select 1 from pg_catalog.pg_db_role_setting s
          join pg_catalog.pg_roles r on r.oid = s.setrole
          cross join lateral unnest(s.setconfig) config
          where r.rolname = 'authenticator'
          and config like 'session_preload_libraries=%safeupdate%'
        ) as enabled
      `);
      assert.equal(configured.rows[0].enabled, true);
    });
  }
  for (let i = 0; i < 3; i++) {
    const email = `eimt-${randomUUID()}@example.invalid`,
      password = randomUUID() + randomUUID();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    uid.push(data.user.id);
    await owner.query(
      "insert into public.user_profiles(id,display_name,role) values($1,$2,$3)",
      [
        data.user.id,
        `Synthetic REST user ${i}`,
        i === 0 ? "superadmin" : i === 1 ? "admin" : "viewer",
      ],
    );
    const client = createClient(url, key, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    publicClients.push(client);
  }
  const b1 = randomUUID(),
    b2 = randomUUID();
  await owner.query(
    "insert into public.branches(id,code,name) values($1,$2,$3),($4,$5,$6)",
    [
      b1,
      `T-${b1}`,
      "Synthetic REST Branch One",
      b2,
      `T-${b2}`,
      "Synthetic REST Branch Two",
    ],
  );
  await owner.query(
    `insert into public.user_scope_grants(user_id,scope_type,scope_id,actions) values($1,'branch',$2,array['R','U']),($3,'branch',$2,array['R'])`,
    [uid[1], b1, uid[2]],
  );
  await owner.query(
    `insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select u,g,a,'allow',true from unnest($1::uuid[]) u,unnest(array['R','U']) a,(select id g from public.field_groups where name='Core identity') groups`,
    [[uid[1], uid[2]]],
  );
  const request = (c, op, p) =>
    c.rpc("tracker_mutate", { operation: op, p, request_id: randomUUID() });
  const first = await request(publicClients[0], "employee_create", {
    target_level: "branch",
    branch_id: b1,
    values: { name: "Synthetic REST employee One" },
  });
  if (first.error) throw first.error;
  const second = await request(publicClients[0], "employee_create", {
    target_level: "branch",
    branch_id: b2,
    values: { name: "Synthetic REST employee Two" },
  });
  if (second.error) throw second.error;
  await test("real JWT direct REST base employee and metadata reads denied", async () => {
    for (const client of publicClients.slice(1))
      for (const table of [
        "employees",
        "field_definitions",
        "employee_movements",
        "audit_log",
        "user_profiles",
      ]) {
        const r = await client.from(table).select("*");
        assert(r.error, `Raw ${table} must fail`);
      }
  });
  await test("anonymous RPC and privilege escalation fail", async () => {
    const anon = createClient(url, key, { auth: { persistSession: false } });
    assert(
      (await anon.rpc("tracker_query", { operation: "context", q: {} })).error,
    );
    assert(
      (
        await publicClients[1]
          .from("user_profiles")
          .update({ role: "superadmin" })
          .eq("id", uid[1])
      ).error,
    );
    assert(
      (
        await publicClients[1].rpc("worker_command", {
          operation: "connection",
          p: {},
        })
      ).error,
    );
  });
  await test("server paging scopes rows under real Supabase Auth", async () => {
    const r = await publicClients[1].rpc("tracker_query", {
      operation: "employees",
      q: { search: "Synthetic REST employee" },
    });
    assert.ifError(r.error);
    assert.equal(r.data.total, 1);
    assert.equal(r.data.items[0].id, first.data.id);
    assert(
      (
        await publicClients[1].rpc("tracker_query", {
          operation: "employee",
          q: { id: second.data.id },
        })
      ).error,
    );
  });
  await test("viewer writes and malicious custom keys are rejected through REST RPC", async () => {
    assert(
      (
        await request(publicClients[2], "employee_update", {
          id: first.data.id,
          expected_version: 1,
          values: { name: "Attack" },
        })
      ).error,
    );
    assert(
      (
        await request(publicClients[1], "employee_update", {
          id: first.data.id,
          expected_version: 1,
          values: { unauthorized: "Attack" },
        })
      ).error,
    );
  });
  await test("client identity and scoped record lists use real authenticated REST", async () => {
    const clientId = randomUUID();
    await owner.query(
      "insert into public.clients(id,branch_id,code,name) values($1,$2,'COM','Synthetic Identity Client')",
      [clientId, b2],
    );
    const created = await request(publicClients[0], "employee_create", {
      target_level: "client",
      branch_id: b2,
      client_id: clientId,
      values: { name: "Synthetic client identity" },
    });
    assert.ifError(created.error);
    const detail = await publicClients[0].rpc("tracker_query", {
      operation: "employee",
      q: { id: created.data.id },
    });
    assert.ifError(detail.error);
    assert.match(detail.data.employee.values.employee_number, /^EMP-/);
    assert.equal(
      detail.data.employee.values.client_employee_number,
      "COM-00001",
    );
    assert(
      (await publicClients[0].from("employee_client_ids").select("*")).error,
    );
    const lists = await publicClients[1].rpc("record_page", {
      q: { kind: "organization", search: "Synthetic Identity Client" },
    });
    assert.ifError(lists.error);
    assert.equal(lists.data.total, 0);
    assert(
      (await publicClients[2].rpc("record_page", { q: { kind: "audit" } }))
        .error,
    );
  });
  await test("revocation takes effect with the same JWT without re-login", async () => {
    await owner.query(
      "update public.user_profiles set active=false where id=$1",
      [uid[1]],
    );
    assert(
      (
        await publicClients[1].rpc("tracker_query", {
          operation: "employees",
          q: {},
        })
      ).error,
    );
    assert(
      (
        await request(publicClients[1], "employee_update", {
          id: first.data.id,
          expected_version: 1,
          values: { name: "Revoked" },
        })
      ).error,
    );
  });
  await test("worker date reconciliation runs with safeupdate enabled", async () => {
    const result = await admin.rpc("worker_command", {
      operation: "claim",
      p: {},
    });
    assert.ifError(result.error);
    if (result.data) {
      const completed = await admin.rpc("worker_command", {
        operation: "retry",
        p: { token: result.data.token },
      });
      assert.ifError(completed.error);
    }
  });
  await mkdir(".test-db/reports/verification", { recursive: true });
  await writeFile(
    ".test-db/reports/verification/supabase-rest.json",
    JSON.stringify(
      {
        results,
        environment: "Disposable full Supabase with distinct real Auth JWTs",
      },
      null,
      2,
    ),
  );
} finally {
  await owner.end();
}
console.log(
  "Reset the disposable database to remove synthetic fixtures. No production records are touched.",
);
