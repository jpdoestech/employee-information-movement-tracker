import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";

export async function testOverviewAnalytics({
  owner,
  test,
  q,
  as,
  id: fixtureIds,
  today,
  date,
}) {
  const id = {
    ...fixtureIds,
    b1: randomUUID(),
    b2: randomUUID(),
    c1: randomUUID(),
    c2: randomUUID(),
  };
  for (const key of ["b1", "b2"])
    await owner.query(
      "insert into public.branches(id,code,name) values($1,$2,$3)",
      [id[key], `AN-${key}`, `Analytics ${key}`],
    );
  for (const [c, b] of [
    ["c1", "b1"],
    ["c2", "b2"],
  ])
    await owner.query(
      "insert into public.clients(id,branch_id,code,name) values($1,$2,$3,$4)",
      [id[c], id[b], `AN-${c}`, `Analytics ${c}`],
    );
  const user = randomUUID(),
    outsider = randomUUID(),
    employeeIds = [];
  await owner.query("insert into auth.users values($1)", [user]);
  await owner.query(
    "insert into public.user_profiles(id,display_name,role) values($1,'Analytics client viewer','viewer')",
    [user],
  );
  await owner.query(
    "insert into public.user_scope_grants(user_id,scope_type,scope_id,actions) values($1,'client',$2,array['R'])",
    [user, id.c1],
  );
  await owner.query(
    "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'R','allow' from public.field_definitions where key=any(array['status','date_hired','branch','client','birth_date','gender','employment_type','department','position','prf_number'])",
    [user],
  );
  for (let i = 0; i < 5; i++) {
    const eid = randomUUID();
    employeeIds.push(eid);
    await owner.query(
      "insert into public.employees(id,name,custom_values) values($1,$2,$3)",
      [
        eid,
        `Analytics person ${i}`,
        {
          date_hired: date(i === 2 ? -5 : -100),
          birth_date: `${Number(today.slice(0, 4)) - (i * 10 + 20)}-01-01`,
          gender: i % 2 ? "Female" : "Male",
          employment_type: i === 3 ? "Contractual" : "Regular",
        },
      ],
    );
    await owner.query(
      "insert into public.employee_assignments(employee_id,target_level,branch_id,client_id,category,starts_on) values($1,'client',$2,$3,'primary',$4)",
      [eid, id.b1, id.c1, date(i === 2 ? -5 : -100)],
    );
  }
  await owner.query(
    "insert into public.employees(id,name,custom_values) values($1,'Outside hidden person',$2)",
    [
      outsider,
      {
        date_hired: date(-100),
        gender: "Other",
        birth_date: "1960-01-01",
        employment_type: "Regular",
      },
    ],
  );
  await owner.query(
    "insert into public.employee_assignments(employee_id,target_level,branch_id,client_id,category,starts_on) values($1,'client',$2,$3,'primary',$4)",
    [outsider, id.b2, id.c2, date(-100)],
  );
  const eventScope = {
    target_level: "client",
    branch_id: id.b1,
    client_id: id.c1,
  };
  const movement = async (eid, status, days, voided = false) =>
    owner.query(
      "insert into public.employee_movements(employee_id,type,effective_on,reason,payload,previous_state,actor_id,voided_at) values($1,'status',$2,'Synthetic analytics event',$3,$4,$5,$6)",
      [
        eid,
        date(days),
        { ...eventScope, status },
        eventScope,
        id.sa,
        voided ? new Date() : null,
      ],
    );
  await movement(employeeIds[0], "Separated", -10);
  await movement(employeeIds[1], "Separated", -8);
  await movement(employeeIds[1], "Active", -4);
  await movement(employeeIds[3], "Separated", 3);
  await movement(employeeIds[4], "Separated", -6, true);
  const range = { from: date(-29), to: today };
  const save = (who, p, request = randomUUID()) =>
    as(who, (c) =>
      c
        .query("select public.set_staffing_requisition($1,$2) r", [p, request])
        .then((r) => r.rows[0].r),
    );
  const page = (who, params = {}) =>
    as(who, (c) =>
      c
        .query("select public.staffing_page($1) r", [params])
        .then((r) => r.rows[0].r),
    );
  let prf;
  await test("analytics counts exact authorized cohort, date boundaries, rehires, voids and future events", async () => {
    const r = await q(user, "dashboard", range);
    assert.equal(r.total, 5);
    assert.equal(r.headcount, 4);
    assert.equal(r.period.hires, 1);
    assert.equal(r.period.opening, 4);
    assert.equal(r.period.closing, 4);
    assert.equal(r.period.separations, 2);
    assert.equal(r.period.retention, 50);
    assert.equal(r.period.turnover, 50);
    assert.equal(r.clients.length, 1);
    assert.equal(r.clients[0].id, id.c1);
    assert.equal(
      r.age_gender.reduce((s, r) => s + r.count, 0),
      4,
    );
    assert.equal(r.fill_rate, null);
    await assert.rejects(
      q(user, "dashboard", { from: today, to: date(-1) }),
      /valid date range/,
    );
    await assert.rejects(
      q(user, "dashboard", { to: date(1) }),
      /valid date range/,
    );
    await assert.rejects(
      as(user, (c) => c.query("select app_private.dashboard_analytics('{}')")),
      { code: "42501" },
    );
  });
  await test("approved PRFs are versioned, confirmed RPC writes with actor-bound idempotency and no viewer writes", async () => {
    const payload = {
      id: randomUUID(),
      client_id: id.c1,
      reference: "ANALYTICS-PRF",
      employment_type: "Regular",
      required_headcount: 6,
      lines: [{ id: randomUUID(), department: "Operations", position: "Coordinator", required_headcount: 6 }],
      starts_on: date(-20),
      ends_on: null,
      active: true,
      expected_version: 0,
    };
    const request = randomUUID();
    prf = await save(id.sa, payload, request);
    await owner.query("update public.employees set prf_line_id=$1,initial_position='Coordinator',custom_values=custom_values||'{\"department\":\"Operations\"}'::jsonb where id=any($2::uuid[])", [payload.lines[0].id,employeeIds]);
    assert.deepEqual(await save(id.sa, payload, request), prf);
    assert.equal(
      Number(
        (
          await owner.query(
            "select count(*) n from public.audit_log where entity='staffing_requisition' and entity_id=$1",
            [prf.id],
          )
        ).rows[0].n,
      ),
      1,
    );
    await assert.rejects(
      save(id.sa, { ...payload, lines: [{ ...payload.lines[0], required_headcount: 7 }] }, request),
      /different payload/,
    );
    await assert.rejects(save(user, { ...payload, id: randomUUID() }), {
      code: "42501",
    });
    await assert.rejects(
      save(id.sa, { ...payload, expected_version: 0, required_headcount: 7 }),
      { code: "40001" },
    );
    await assert.rejects(
      save(id.sa, { ...payload, id: randomUUID(), lines: [{ ...payload.lines[0], required_headcount: 0 }] }),
      { code: "22023" },
    );
    await assert.rejects(
      save(id.sa, { ...payload, id: randomUUID(), ends_on: payload.starts_on }),
      { code: "23514" },
    );
    const r = await q(user, "dashboard", range);
    assert.equal(r.staffing.required, 6);
    assert.equal(r.staffing.filled, 3);
    assert.equal(r.fill_rate, 50);
    assert.equal((await page(user)).total, 1);
    assert.equal((await page(user, { search: "ANALYTICS" })).total, 1);
    await assert.rejects(page(user, { limit: 1000 }), /pagination/);
    await save(id.sa, {
      ...payload,
      id: randomUUID(),
      client_id: id.c2,
      reference: "SECRET-PRF",
      required_headcount: 100,
      lines: [{ ...payload.lines[0], id: randomUUID(), required_headcount: 100 }],
    });
    assert.equal((await page(user)).total, 1);
    assert(
      !JSON.stringify(await q(user, "dashboard", range)).includes("SECRET"),
    );
  });
  await test("field, module, record and historical restrictions cannot leak through aggregates or staffing targets", async () => {
    await owner.query(
      "update public.field_access_policies set effect='deny' where user_id=$1 and field_id in(select id from public.field_definitions where key='gender')",
      [user],
    );
    assert.deepEqual((await q(user, "dashboard", range)).age_gender, []);
    await owner.query(
      "update public.field_access_policies set effect='deny' where user_id=$1 and field_id in(select id from public.field_definitions where key='branch')",
      [user],
    );
    assert.deepEqual((await q(user, "dashboard", range)).branches, []);
    assert.equal(
      (await page(user, { branches: [id.b1] })).total,
      0,
      "Staffing filters must not match a hidden branch",
    );
    await owner.query(
      "update public.field_access_policies set effect='allow' where user_id=$1 and field_id in(select id from public.field_definitions where key='branch')",
      [user],
    );
    await owner.query(
      "update public.field_access_policies set effect='deny' where user_id=$1 and field_id in(select id from public.field_definitions where key='employment_type')",
      [user],
    );
    const hidden = await q(user, "dashboard", range);
    assert.deepEqual(hidden.employment_types, []);
    assert.equal(hidden.fill_rate, null);
    assert.equal((await page(user)).total, 0);
    await owner.query(
      "update public.field_access_policies set effect='allow' where user_id=$1",
      [user],
    );
    const historicalClient = randomUUID();
    await owner.query(
      "insert into public.clients(id,branch_id,code,name) values($1,$2,'AN-HISTORY','Analytics history client')",
      [historicalClient, id.b1],
    );
    await owner.query(
      "insert into public.user_scope_grants(user_id,scope_type,scope_id,actions) values($1,'client',$2,array['R'])",
      [user, historicalClient],
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect,scope_type,scope_id) select $1,id,'R','deny','client',$2 from public.field_definitions where key='status'",
      [user, historicalClient],
    );
    await owner.query(
      "update public.employee_movements set previous_state=$2 where employee_id=$1 and type='status'",
      [employeeIds[0], { ...eventScope, client_id: historicalClient }],
    );
    assert.equal(
      (await q(user, "dashboard", range)).period.eligible,
      4,
      "Source field denial must exclude a status event even when its scope is readable",
    );
    await owner.query(
      "update public.employee_movements set previous_state=$2 where employee_id=$1 and type='status'",
      [employeeIds[0], eventScope],
    );
    await owner.query(
      "insert into app_private.access_record_rules(user_id,mode,assigned) values($1,'assigned',$2)",
      [user, [employeeIds[2]]],
    );
    const restricted = await q(user, "dashboard", range);
    assert.equal(restricted.total, 1);
    assert.equal(restricted.fill_rate, null);
    assert.equal((await page(user)).total, 0);
    await owner.query(
      "delete from app_private.access_record_rules where user_id=$1",
      [user],
    );
    await owner.query(
      "insert into app_private.access_overrides values($1,'movements','view','deny')",
      [user],
    );
    assert.equal((await q(user, "dashboard", range)).period.hires, null);
    await owner.query(
      "insert into app_private.access_overrides values($1,'employees','view','deny')",
      [user],
    );
    await assert.rejects(q(user, "dashboard", range), { code: "42501" });
    await owner.query(
      "delete from app_private.access_overrides where user_id=$1",
      [user],
    );
    // Current access does not authorize another client's earlier status history.
    await owner.query(
      "update public.employee_assignments set starts_on=$2 where employee_id=$1",
      [employeeIds[4], date(-2)],
    );
    await owner.query(
      "insert into public.employee_assignments(employee_id,target_level,branch_id,client_id,category,starts_on,ends_on) values($1,'client',$2,$3,'primary',$4,$5)",
      [employeeIds[4], id.b2, id.c2, date(-100), date(-2)],
    );
    assert.equal((await q(user, "dashboard", range)).period.eligible, 4);
  });
  await test("dashboard query cost on 1000 synthetic profiles is below the previous full projection", async () => {
    await owner.query(
      "insert into public.employees(name,custom_values) select 'Analytics load '||g,jsonb_build_object('date_hired',$1::text,'employment_type','Regular','birth_date','1990-01-01','gender','Male') from generate_series(1,1000) g",
      [date(-100)],
    );
    await owner.query(
      "insert into public.employee_movements(employee_id,type,effective_on,reason,payload,actor_id) select e.id,'status',$1::date-g*10,'Synthetic history load',jsonb_build_object('status',case when g%2=0 then 'Active' else 'Inactive' end),$2 from public.employees e cross join generate_series(1,6) g where e.name like 'Analytics load %'",
      [today, id.sa],
    );
    // Bulk fixtures need current statistics before comparing steady-state query plans.
    await owner.query(
      "analyze public.employees; analyze public.employee_movements; analyze public.employee_assignments; analyze public.staffing_requisitions",
    );
    const baseline =
      "with rows as materialized(select projected_row dashboard_row from app_private.readable_employee_rows()) select jsonb_build_object('total',count(*),'statuses',(select jsonb_object_agg(status,n) from(select dashboard_row->'values'->>'status' status,count(*) n from rows where dashboard_row->'values' ? 'status' group by 1) s)) from rows";
    await q(id.sa, "dashboard", range);
    await as(id.sa, (c) => c.query(baseline), "postgres");
    const samples = { previous: [], current: [] };
    const queries = {
      previous: () => as(id.sa, (c) => c.query(baseline), "postgres"),
      current: () => q(id.sa, "dashboard", range),
    };
    for (let i = 0; i < 3; i++) {
      for (const label of i % 2
        ? ["current", "previous"]
        : ["previous", "current"]) {
        const started = performance.now();
        await queries[label]();
        samples[label].push(performance.now() - started);
      }
    }
    const previous = samples.previous.sort((a, b) => a - b)[1],
      current = samples.current.sort((a, b) => a - b)[1];
    console.log(
      `ANALYTICS BENCHMARK: 1000 profiles; old full projection median ${previous.toFixed(0)} ms; new analytics median ${current.toFixed(0)} ms`,
    );
    await mkdir(".test-db/reports/verification", { recursive: true });
    await writeFile(
      ".test-db/reports/verification/overview-performance.json",
      JSON.stringify(
        {
          profiles: 1000,
          statusEvents: 6000,
          samples: 3,
          previousMedianMs: previous,
          currentMedianMs: current,
          measuredAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    assert(
      current < previous,
      `Analytics ${current}ms vs baseline ${previous}ms`,
    );
  });
}
