import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export async function testPermissionMatrix({
  owner,
  test,
  m,
  q,
  as,
  id,
  revision,
}) {
  const user = randomUUID();
  const outsideBranch = randomUUID();
  await owner.query(
    "insert into public.branches(id,code,name) values($1,'MAT-OUT','Synthetic matrix outside branch')",
    [outsideBranch],
  );
  await owner.query("insert into auth.users values($1)", [user]);
  await owner.query(
    "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic matrix administrator','admin')",
    [user],
  );
  await owner.query(
    "insert into public.user_scope_grants(user_id,scope_type,actions) values($1,'all',array['C','R','U','D'])",
    [user],
  );
  await owner.query(
    "insert into public.capability_grants select $1,c from unnest(array['employee_create','employee_delete','bulk_update','movement_create']) c",
    [user],
  );
  await owner.query(
    "insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) select $1,id,a,'allow',true from public.field_groups cross join unnest(array['R','U','D']) a where active",
    [user],
  );
  const create = async (name, branch, department) =>
    (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: branch,
        values: { name, department },
      })
    ).id;
  const self = await create("Matrix self", id.b1, "Matrix A"),
    report = await create("Matrix report", id.b1, "Matrix A"),
    other = await create("Matrix outside", outsideBranch, "Matrix B");
  const rpc = (who, name, p) =>
    as(who, (c) =>
      c.query(`select public.${name}($1) r`, [p]).then((r) => r.rows[0].r),
    );
  const saved = async (payload, req = randomUUID()) => {
    const p = {
      user_id: user,
      modules: [],
      fields: [],
      scope_type: "all",
      scope_id: null,
      reason: "Synthetic matrix check",
      ...payload,
    };
    const review = await as(id.sa, (c) =>
      c
        .query("select public.access_change_preview('access_matrix',$1) r", [p])
        .then((r) => r.rows[0].r),
    );
    return m(
      id.sa,
      "access_matrix",
      { ...p, review_revision: review.revision, review_date: review.today },
      req,
    );
  };
  const rule = (mode, more = {}) => ({
    mode,
    employee_id: self,
    departments: [],
    assigned: [],
    ...more,
  });
  await test("employee overview omits history work while legacy details and secured history stay compatible", async () => {
    await owner.query("insert into public.employee_movements(employee_id,type,effective_on,reason,payload,previous_state,actor_id) select $1,'status',current_date-g,'Synthetic loading performance',jsonb_build_object('status','Active'),'{}'::jsonb,$2 from generate_series(1,20) g", [self,id.sa]);
    const complete = await q(user, "employee", { id: self });
    const lightweight = await q(user, "employee", { id: self, include_history: false });
    const history = await q(user, "employee_history", { id: self });
    assert.deepEqual(lightweight, { employee: complete.employee, fields: complete.fields });
    assert.deepEqual(history, { assignments: complete.assignments, movements: complete.movements });
    assert.equal(history.movements.length,20);
    assert(history.movements.every(m => m.reason === null && Object.keys(m.payload).every(k => k === 'status')));
    const times = {};
    for (const include_history of [true,false]) {
      const samples=[];
      for (let n=0;n<3;n++) { const start=performance.now(); await q(user,'employee',{id:self,include_history}); samples.push(performance.now()-start); }
      times[String(include_history)] = samples.sort((a,b)=>a-b)[1];
    }
    assert(times.false < times.true, `Lightweight ${times.false}ms; complete ${times.true}ms`);
    console.log(`Employee overview median ${Math.round(times.false)}ms versus complete detail ${Math.round(times.true)}ms with 20 movements`);
    await owner.query('update public.user_profiles set active=false where id=$1',[user]);
    try {
      await assert.rejects(q(user,'employee',{id:self,include_history:false}),{code:'42501'});
      await assert.rejects(q(user,'employee_history',{id:self}),{code:'42501'});
    } finally { await owner.query('update public.user_profiles set active=true where id=$1',[user]); }
  });
  await test("Admin remains below Superadmin and Head Office and branch grants stay separate", async () => {
    const headOffice = (
      await m(id.sa, "employee_create", {
        target_level: "head_office",
        values: {
          name: "Matrix Head Office",
          department: "Matrix Head Office",
        },
      })
    ).id;
    try {
      await owner.query(
        "update public.user_scope_grants set scope_type='branch',scope_id=$2,include_descendants=false where user_id=$1",
        [user, id.b1],
      );
      assert.equal((await q(user, "employee", { id: self })).employee.id, self);
      for (const employee of [headOffice, other])
        await assert.rejects(q(user, "employee", { id: employee }), {
          code: "42501",
        });
      await assert.rejects(rpc(user, "access_configuration", {}), {
        code: "42501",
      });
      await assert.rejects(
        m(user, "profile", {
          id: user,
          role: "superadmin",
          reason: "Synthetic escalation attempt",
        }),
        { code: "42501" },
      );
      await owner.query(
        "update public.user_scope_grants set scope_type='head_office',scope_id=null where user_id=$1",
        [user],
      );
      assert.equal(
        (await q(user, "employee", { id: headOffice })).employee.id,
        headOffice,
      );
      for (const employee of [self, other])
        await assert.rejects(q(user, "employee", { id: employee }), {
          code: "42501",
        });
      assert.equal(
        (await q(id.sa, "employee", { id: other })).employee.id,
        other,
      );
      await owner.query(
        "update public.user_scope_grants set active=false where user_id=$1",
        [user],
      );
      assert.equal((await q(user, "employees")).total, 0);
    } finally {
      await owner.query(
        "update public.user_scope_grants set scope_type='all',scope_id=null,active=true where user_id=$1",
        [user],
      );
    }
  });
  await test("matrix self access rejects another employee across reads, dashboard, search, export and writes", async () => {
    await saved({ record_rule: rule("self") });
    const rows = await q(user, "employees");
    assert.deepEqual(
      rows.items.map((e) => e.id),
      [self],
    );
    assert.equal((await q(user, "dashboard")).total, 1);
    assert.equal(
      (await q(user, "employees", { search: "Matrix report" })).total,
      0,
    );
    assert.equal((await rpc(user, "export_employees", {})).items.length, 1);
    await assert.rejects(q(user, "employee", { id: report }), {
      code: "42501",
    });
    await assert.rejects(q(user,"employee",{id:report,include_history:false}),{code:"42501"});
    await assert.rejects(q(user,"employee_history",{id:report}),{code:"42501"});
    await assert.rejects(
      m(user, "employee_update", {
        id: report,
        expected_version: await revision(report),
        values: { phone: "09123456789" },
      }),
      { code: "42501" },
    );
    await assert.rejects(
      m(user, "bulk_update", {
        rows: [{ id: report, row_version: await revision(report) }],
        values: { phone: "09123456789" },
      }),
      { code: "42501" },
    );
  });
  await test("matrix direct-report scope retains permitted reports without granting unrelated records", async () => {
    await saved({ record_rule: rule("direct_reports"), reports: [report] });
    assert.deepEqual(
      (await q(user, "employees")).items.map((e) => e.id),
      [report],
    );
    await assert.rejects(q(user, "employee", { id: self }), { code: "42501" });
    await m(user, "employee_update", {
      id: report,
      expected_version: await revision(report),
      values: { phone: "09123456789" },
    });
  });
  await test("matrix department and assigned-record constraints fence every authorized projection", async () => {
    await saved({
      record_rule: rule("department", { departments: ["Matrix A"] }),
    });
    assert.deepEqual(
      new Set((await q(user, "employees")).items.map((e) => e.id)),
      new Set([self, report]),
    );
    await assert.rejects(q(user, "employee", { id: other }), { code: "42501" });
    await saved({ record_rule: rule("assigned", { assigned: [other] }) });
    assert.deepEqual(
      (await q(user, "employees")).items.map((e) => e.id),
      [other],
    );
    await saved({ record_rule: rule("assigned") });
    assert.equal((await q(user, "employees")).total, 0);
  });
  await test("matrix View is independent from Create, Update, Delete and Export", async () => {
    await saved({
      record_rule: rule("organization"),
      modules: [
        { module: "employees", action: "create", effect: "deny" },
        { module: "employees", action: "update", effect: "deny" },
        { module: "employees", action: "delete", effect: "deny" },
        { module: "employees", action: "export", effect: "deny" },
      ],
    });
    assert((await q(user, "employees")).total > 0);
    await assert.rejects(rpc(user, "export_employees", {}), { code: "42501" });
    await assert.rejects(
      m(user, "employee_update", {
        id: report,
        expected_version: await revision(report),
        values: { phone: "09123456789" },
      }),
      { code: "42501" },
    );
    await assert.rejects(
      m(user, "employee_delete", {
        id: report,
        expected_version: await revision(report),
      }),
      { code: "42501" },
    );
    await assert.rejects(
      m(user, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: { name: "Matrix forbidden" },
      }),
      { code: "42501" },
    );
  });
  await test("matrix data-driven HR role and direct DENY preserve legacy grants and explain sources", async () => {
    const before = (await q(id.admin, "context")).capabilities;
    await m(id.sa, "access_role", {
      code: "matrix_hr",
      name: "Matrix HR Staff",
      reason: "Synthetic role",
    });
    await saved({
      user_id: null,
      role_id: "matrix_hr",
      modules: [{ module: "employees", action: "export", effect: "allow" }],
    });
    await saved({ memberships: ["matrix_hr"] });
    const effective = await rpc(id.sa, "effective_access", {
      user_id: user,
      employee_id: report,
    });
    const exported = effective.modules.find(
      (p) => p.module === "employees" && p.action === "export",
    );
    assert.equal(exported.decision.allowed, false);
    assert(
      exported.decision.sources.some(
        (s) => s.source === "role" && s.role === "matrix_hr",
      ),
    );
    assert(
      exported.decision.sources.some(
        (s) => s.source === "direct" && s.effect === "deny",
      ),
    );
    assert.deepEqual((await q(id.admin, "context")).capabilities, before);
    await saved({
      modules: [{ module: "employees", action: "export", effect: "inherit" }],
    });
    assert((await rpc(user, "export_employees", {})).items.length > 0);
  });
  await test("matrix group DENY wins over direct field allows and role grants", async () => {
    const f = (
      await owner.query(
        "select id,group_id from public.field_definitions where key='phone'",
      )
    ).rows[0];
    await saved({
      fields: [
        { group_id: f.group_id, action: "R", effect: "deny" },
        { field_id: f.id, action: "R", effect: "allow" },
      ],
    });
    assert(
      !Object.hasOwn(
        (await q(user, "employee", { id: report })).employee.values,
        "phone",
      ),
    );
    await saved({
      fields: [
        { group_id: f.group_id, action: "R", effect: "allow" },
        { field_id: f.id, action: "R", effect: "inherit" },
      ],
    });
  });
  await test("matrix reviews module restorations and scope revocations beyond the selected placement", async () => {
    const sensitive = { id: randomUUID(), key: "matrix_review_restricted" }, group = randomUUID();
    await owner.query("insert into public.field_groups(id,name) values($1,'Matrix review restricted fixture')", [group]);
    await owner.query("insert into public.field_definitions(id,group_id,key,label,type,sensitivity,scope_mode) values($1,$2,$3,'Matrix review restricted fixture','short_text','restricted','all')", [sensitive.id,group,sensitive.key]);
    await m(id.sa, "policy", { user_id: user, field_id: sensitive.id, action: "R", effect: "allow", reason: "Synthetic explicit restricted allow" });
    await saved({ modules: [{ module: "employees", action: "view", effect: "deny" }] });
    const preview = p => as(id.sa, c => c.query("select public.access_change_preview('access_matrix',$1) r", [{ user_id: user, reason: "Synthetic complete impact review", ...p }]).then(r => r.rows[0].r));
    const restored = await preview({ scope_type: "branch", scope_id: id.b1, modules: [{ module: "employees", action: "view", effect: "inherit" }] });
    assert(restored.changes.some(c => c.key === sensitive.key && c.action === "R" && c.after && c.restricted && c.target_id === outsideBranch));
    await saved({ modules: [{ module: "employees", action: "view", effect: "inherit" }] });
    const grant = (await owner.query("select id from public.user_scope_grants where user_id=$1 and scope_type='all'", [user])).rows[0];
    const revoked = await preview({ scope_type: "branch", scope_id: id.b1, revoke_scopes: [grant.id] });
    assert(revoked.changes.some(c => c.target_id === outsideBranch && c.action === "R" && c.before && !c.after));
  });
  await test("matrix trusted Administrator retains complete applicable access", async () => {
    await saved({
      user_id: id.sa,
      modules: [{ module: "employees", action: "view", effect: "deny" }],
      record_rule: rule("assigned"),
    });
    assert((await q(id.sa, "employees")).total > 0);
    const value = await rpc(id.sa, "effective_access", {
      user_id: id.sa,
      employee_id: other,
    });
    assert.equal(value.record_allowed, true);
    assert(value.modules.every((p) => p.decision.allowed));
  });
  await test("matrix changes preview without writes, reject stale saves, replay once and roll back invalid batches", async () => {
    const snapshot = async () =>
      (
        await owner.query(
          "select revision,(select count(*) from public.audit_log) audit,(select count(*) from public.write_requests) requests from public.system_state",
        )
      ).rows[0];
    const p = {
      user_id: user,
      reason: "Synthetic review",
      modules: [{ module: "employees", action: "view", effect: "deny" }],
    };
    const before = await snapshot();
    const reviewed = await as(id.sa, (c) =>
      c
        .query("select public.access_change_preview('access_matrix',$1) r", [p])
        .then((r) => r.rows[0].r),
    );
    assert.deepEqual(await snapshot(), before);
    await assert.rejects(
      m(id.sa, "access_matrix", {
        ...p,
        review_revision: reviewed.revision - 1,
        review_date: reviewed.today,
      }),
      { code: "40001" },
    );
    const req = randomUUID(),
      submitted = {
        ...p,
        review_revision: reviewed.revision,
        review_date: reviewed.today,
      };
    await m(id.sa, "access_matrix", submitted, req);
    const after = await snapshot();
    await m(id.sa, "access_matrix", submitted, req);
    assert.deepEqual(await snapshot(), after);
    const snapshotBeforeBad = await snapshot();
    await assert.rejects(
      saved({
        modules: [
          { module: "employees", action: "view", effect: "allow" },
          { module: "employees", action: "approve", effect: "allow" },
        ],
      }),
    );
    assert.deepEqual(await snapshot(), snapshotBeforeBad);
    await saved({
      modules: [{ module: "employees", action: "view", effect: "inherit" }],
    });
  });
  await test("matrix private tables, RPCs and helper functions reject browser privilege bypass", async () => {
    for (const name of [
      "access_roles",
      "access_overrides",
      "access_record_rules",
      "employee_reporting",
    ])
      await assert.rejects(
        as(user, (c) => c.query(`select * from app_private.${name}`)),
        { code: "42501" },
      );
    await assert.rejects(
      rpc(user, "access_configuration", { user_id: id.sa }),
      { code: "42501" },
    );
    await assert.rejects(rpc(user, "effective_access", { user_id: id.sa }), {
      code: "42501",
    });
    await assert.rejects(
      m(user, "access_matrix", { user_id: user, reason: "Attack" }),
      { code: "42501" },
    );
    await assert.rejects(
      m(user, "access_role", {
        code: "attack",
        name: "Attack",
        reason: "Attack",
      }),
      { code: "42501" },
    );
  });
  await test("matrix ordinary-user context catalog matches the shared evaluator with bounded latency", async () => {
    const start = performance.now(),
      context = await q(user, "context"),
      elapsed = performance.now() - start;
    assert(elapsed < 5000, `Ordinary context took ${Math.round(elapsed)}ms`);
    const all = (
      await owner.query(
        "select id,key from public.field_definitions where active",
      )
    ).rows;
    const allowed = await as(
      user,
      (c) =>
        c.query(
          "select f.key,a from public.field_definitions f cross join unnest(array['C','R','U','D']) a where f.active and exists(select 1 from app_private.targets() t where app_private.field_access(f.key,a,t.target,t.branch_id,t.client_id))",
        ),
      "postgres",
    );
    for (const f of all) {
      const expected = allowed.rows
        .filter((x) => x.key === f.key)
        .map((x) => x.a)
        .sort();
      assert.deepEqual(
        context.fields.find((x) => x.key === f.key)?.actions.sort() || [],
        expected,
      );
    }
    console.log(
      `Ordinary-user context: ${Math.round(elapsed)}ms; ${all.length} fields; statement-scoped permissions verified`,
    );
  });
}
