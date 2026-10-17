import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testEmploymentRules({
  owner,
  test,
  q,
  m,
  as,
  concurrent,
  revision,
  id,
  today,
  date,
}) {
  const branch = randomUUID(),
    clientA = randomUUID(),
    clientB = randomUUID();
  await owner.query(
    "insert into public.branches(id,code,name) values($1,'UQ','Synthetic uniqueness branch')",
    [branch],
  );
  await owner.query(
    "insert into public.clients(id,branch_id,code,name) values($1,$3,'UQA','Synthetic client A'),($2,$3,'UQB','Synthetic client B')",
    [clientA, clientB, branch],
  );
  const create = (values = {}, client) =>
    m(id.sa, "employee_create", {
      target_level: client ? "client" : "head_office",
      branch_id: client ? branch : undefined,
      client_id: client,
      values: { name: `Rule fixture ${randomUUID()}`, ...values },
    });
  const field = (key, extra = {}) =>
    m(id.sa, "field", {
      group_id: id.core,
      key,
      label: key.replaceAll("_", " "),
      type: "short_text",
      required: false,
      active: true,
      sensitivity: "normal",
      scope_mode: "all",
      options: [],
      validation: {},
      ...extra,
    });
  const configure = async (fieldId, extra, actor = id.sa) => {
    const f = (
      await owner.query("select * from public.field_definitions where id=$1", [
        fieldId,
      ])
    ).rows[0];
    return m(actor, "field", {
      ...f,
      expected_version: f.row_version,
      ...extra,
    });
  };
  const snapshot = async () =>
    (
      await owner.query(
        "select (select count(*) from public.employees) employees,(select count(*) from public.audit_log) audit,(select count(*) from public.sync_outbox) outbox",
      )
    ).rows[0];

  await test("manpower creation resolves authorized inactive replacements and rejects missing, active, self and hidden references atomically", async () => {
    const normal = await create();
    assert.equal(
      (await q(id.sa, "employee", { id: normal.id })).employee.values
        .manpower_classification,
      "New/Additional",
    );
    const replaced = (
      await owner.query(
        "insert into public.employees(name,initial_status) values('Synthetic retired reference','Inactive') returning id",
      )
    ).rows[0].id;
    const candidates = await q(id.sa, "employees", {
      search: "Synthetic retired reference",
      statuses: ["Inactive", "Separated"],
    });
    assert.equal(candidates.items[0].id, replaced);
    const saved = await create({
      manpower_classification: "Replacement",
      replaced_employee_id: replaced,
    });
    assert.equal(
      (await q(id.sa, "employee", { id: saved.id })).employee.values
        .replaced_employee_id,
      replaced,
    );
    const before = await snapshot();
    for (const values of [
      { manpower_classification: null },
      { manpower_classification: "Replacement" },
      {
        manpower_classification: "Replacement",
        replaced_employee_id: normal.id,
      },
      {
        manpower_classification: "New/Additional",
        replaced_employee_id: replaced,
      },
    ])
      await assert.rejects(create(values), { code: "22023" });
    await assert.rejects(
      create({
        manpower_classification: "Replacement",
        replaced_employee_id: randomUUID(),
      }),
      { code: "42501" },
    );
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: saved.id,
        expected_version: 1,
        values: { replaced_employee_id: saved.id },
      }),
      { code: "42501" },
    );
    await assert.rejects(
      m(id.admin, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: {
          name: "Hidden replacement",
          manpower_classification: "Replacement",
          replaced_employee_id: replaced,
        },
      }),
      { code: "42501" },
    );
    assert.deepEqual(await snapshot(), before);
    await m(id.sa, "movement", {
      employee_id: replaced,
      expected_version: 1,
      type: "status",
      status: "Active",
      effective_on: today,
      reason: "Synthetic reactivation",
    });
    await assert.rejects(
      create({
        manpower_classification: "Replacement",
        replaced_employee_id: replaced,
      }),
      { code: "22023" },
    );
    // A valid historical replacement survives unrelated edits after reactivation.
    await m(id.sa, "employee_update", {
      id: saved.id,
      expected_version: 1,
      values: { remarks: "Keep the historical relationship" },
    });
  });

  await test("replacement lookup retains eligible employees when System ID Read is denied", async () => {
    const employee = (
      await owner.query(
        "insert into public.employees(name,initial_status) values('Synthetic masked identifier replacement','Inactive') returning id",
      )
    ).rows[0].id;
    await owner.query(
      "insert into public.employee_assignments(employee_id,target_level,branch_id,category,starts_on) values($1,'branch',$2,'primary',$3)",
      [employee, id.b1, date(-10)],
    );
    const policy = (
      await owner.query(
        "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'R','deny' from public.field_definitions where key='employee_number' returning id",
        [id.admin],
      )
    ).rows[0].id;
    const result = await q(id.admin, "employees", {
      search: "Synthetic masked identifier replacement",
      sort: "id",
      statuses: ["Inactive", "Separated"],
      limit: 25,
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, employee);
    assert.equal(
      Object.hasOwn(result.items[0].values, "employee_number"),
      false,
    );
    assert.equal(result.items[0].values.status, "Inactive");
    await owner.query("delete from public.field_access_policies where id=$1", [
      policy,
    ]);
  });

  await test("global unique rules reject existing duplicates, normalize text, protect flags and reserve archived values", async () => {
    const f = await field("uq_global_rule");
    const a = await create({ uq_global_rule: "Reference Alpha" });
    const b = await create({ uq_global_rule: " reference   ALPHA " });
    await assert.rejects(configure(f.id, { is_unique: true }), {
      code: "23505",
    });
    assert.equal(
      (
        await owner.query(
          "select is_unique from public.field_definitions where id=$1",
          [f.id],
        )
      ).rows[0].is_unique,
      false,
    );
    await m(id.sa, "employee_update", {
      id: b.id,
      expected_version: 1,
      values: { uq_global_rule: "Beta" },
    });
    await configure(f.id, { is_unique: true });
    for (const extra of [{ is_unique: false }, { unique_scope: "client" }])
      await assert.rejects(configure(f.id, extra, id.admin), { code: "42501" });
    const before = await snapshot();
    await assert.rejects(
      create({ uq_global_rule: "REFERENCE ALPHA" }, clientB),
      { code: "23505" },
    );
    assert.deepEqual(await snapshot(), before);
    await create({ uq_global_rule: "" });
    await create({ uq_global_rule: null });
    await m(id.sa, "employee_delete", {
      id: a.id,
      expected_version: await revision(a.id),
    });
    await assert.rejects(create({ uq_global_rule: "reference alpha" }), {
      code: "23505",
    });
    await assert.rejects(
      as(id.sa, (c) =>
        c.query("select * from app_private.unique_field_values"),
      ),
      { code: "42501" },
    );
    await configure(f.id, { is_unique: false });
    await create({ uq_global_rule: "REFERENCE ALPHA" });
  });

  await test("optional government IDs enforce normalized uniqueness by default with configurable scope", async () => {
    const government = (
      await owner.query(
        "select * from public.field_definitions where key='sss_number'",
      )
    ).rows[0];
    assert.equal(government.required, false);
    assert.equal(government.is_unique, true);
    assert.equal(government.unique_scope, "global");
    await configure(government.id, { required: true, is_unique: false });
    const enforced = (
      await owner.query(
        "select required,is_unique from public.field_definitions where id=$1",
        [government.id],
      )
    ).rows[0];
    assert.deepEqual(enforced, { required: false, is_unique: true });
    const a = await create({ sss_number: "09-1234567-8" }, clientA);
    await assert.rejects(create({ sss_number: "0912345678" }, clientB), {
      code: "23505",
    });
    await configure(government.id, { unique_scope: "client" });
    const b = await create({ sss_number: "0912345678" }, clientB);
    await assert.rejects(create({ sss_number: "0912345678" }, clientA), {
      code: "23505",
    });
    await assert.rejects(configure(government.id, { unique_scope: "global" }), {
      code: "23505",
    });
    await m(id.sa, "employee_update", {
      id: b.id,
      expected_version: await revision(b.id),
      values: { sss_number: null },
    });
    await configure(government.id, { unique_scope: "global" });
    await m(id.sa, "employee_update", {
      id: a.id,
      expected_version: await revision(a.id),
      values: { sss_number: "" },
    });
    assert.equal(
      (await q(id.sa, "employee", { id: a.id })).employee.values.sss_number,
      null,
    );
    await create({ sss_number: null });
    const blank = await create({ sss_number: "" });
    assert.equal(
      (await q(id.sa, "employee", { id: blank.id })).employee.values.sss_number,
      null,
    );
    await create({ sss_number: "0912345678" });
  });

  await test("unique values are race-safe, idempotent, permit long text and roll back whole bulk writes", async () => {
    const f = await field("uq_race_rule", {
      is_unique: true,
      validation: { max_length: 10000 },
    });
    const requests = Array.from({ length: 20 }, () => randomUUID());
    const payloads = requests.map((_, i) => ({
      target_level: "head_office",
      values: { name: `Unique race ${i}`, uq_race_rule: "one winner" },
    }));
    const answers = await concurrent("employee_create", payloads, [], requests);
    assert.equal(answers.filter((a) => a.ok).length, 1);
    assert.equal(answers.filter((a) => a.code === "23505").length, 19);
    const winner = answers.findIndex((a) => a.ok);
    assert.deepEqual(
      await m(id.sa, "employee_create", payloads[winner], requests[winner]),
      answers[winner].result,
    );
    const a = await create({ uq_race_rule: "a".repeat(6000) });
    await assert.rejects(create({ uq_race_rule: "a".repeat(6000) }), {
      code: "23505",
    });
    const b = await create({ uq_race_rule: "b".repeat(6000) });
    const before = await snapshot();
    await assert.rejects(
      m(id.sa, "bulk_update", {
        rows: [
          { id: a.id, row_version: 1 },
          { id: b.id, row_version: 1 },
        ],
        values: { uq_race_rule: "bulk duplicate" },
      }),
      { code: "23505" },
    );
    assert.equal(await revision(a.id), 1);
    assert.equal(await revision(b.id), 1);
    assert.deepEqual(await snapshot(), before);
    await configure(f.id, { is_unique: false });
  });

  await test("per-client rules allow cross-client duplicates but guard transfers, future reservations and scope changes", async () => {
    const f = await field("uq_client_rule", {
      is_unique: true,
      unique_scope: "client",
    });
    const a = await create({ uq_client_rule: "LOCAL-01" }, clientA);
    const b = await create({ uq_client_rule: "local-01" }, clientB);
    await assert.rejects(create({ uq_client_rule: " LOCAL-01 " }, clientA), {
      code: "23505",
    });
    await assert.rejects(configure(f.id, { unique_scope: "global" }), {
      code: "23505",
    });
    assert.equal(
      (
        await owner.query(
          "select unique_scope from public.field_definitions where id=$1",
          [f.id],
        )
      ).rows[0].unique_scope,
      "client",
    );
    const noClient = await create({ uq_client_rule: "LOCAL-01" });
    const before = await snapshot();
    await assert.rejects(
      m(id.sa, "movement", {
        employee_id: noClient.id,
        expected_version: 1,
        type: "deployment",
        target_level: "client",
        branch_id: branch,
        client_id: clientA,
        effective_on: date(2),
        reason: "Duplicate future deployment",
      }),
      { code: "23505" },
    );
    assert.equal(await revision(noClient.id), 1);
    assert.deepEqual(await snapshot(), before);
    const scheduled = await create({ uq_client_rule: "FUTURE-02" });
    const movement = await m(id.sa, "movement", {
      employee_id: scheduled.id,
      expected_version: 1,
      type: "deployment",
      target_level: "client",
      branch_id: branch,
      client_id: clientA,
      effective_on: date(3),
      reason: "Reserve future client value",
    });
    await assert.rejects(create({ uq_client_rule: "FUTURE-02" }, clientA), {
      code: "23505",
    });
    await m(id.sa, "void_movement", {
      id: movement.id,
      expected_version: await revision(scheduled.id),
      reason: "Cancel the future reservation",
    });
    await create({ uq_client_rule: "FUTURE-02" }, clientA);
    assert.notEqual(a.id, b.id);
  });
  const review = async (payload, actor = id.sa) =>
    (
      await as(actor, (c) =>
        c.query("select public.employee_duplicates($1) r", [payload]),
      )
    ).rows[0].r;
  const identity = {
    last_name: "DuplicateReview",
    first_name: "Alexandria",
    birth_date: "1988-09-29",
    department: "Quality",
  };
  const duplicatePayload = {
    target_level: "client",
    branch_id: branch,
    client_id: clientB,
    values: { ...identity, first_name: "Alexandrie" },
  };
  let original;
  await test("duplicate employee review is global, birthday-exact, projected and required atomically before create and identity edits", async () => {
    original = await create(identity, clientA);
    const found = await review(duplicatePayload);
    assert.equal(found.threshold, 90);
    assert.equal(found.total, 1);
    assert.equal(found.items[0].values.name, "DuplicateReview, Alexandria");
    assert.equal(found.items[0].values.branch, "Synthetic uniqueness branch");
    assert.equal(found.items[0].values.client, "Synthetic client A");
    assert.equal(found.items[0].values.department, "Quality");
    assert.ok(
      found.items[0].similarity >= 90 && found.items[0].similarity < 100,
    );
    assert.equal(
      (
        await review({
          ...duplicatePayload,
          values: { ...identity, birth_date: "1988-09-28" },
        })
      ).total,
      0,
    );
    const grant = (
      await owner.query(
        "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'C','allow' from public.field_definitions where key='birth_date' returning id",
        [id.admin],
      )
    ).rows[0].id;
    assert.equal(
      (
        await review(
          { target_level: "branch", branch_id: id.b1, values: identity },
          id.admin,
        )
      ).total,
      0,
    );
    await owner.query("delete from public.field_access_policies where id=$1", [
      grant,
    ]);
    await assert.rejects(review(duplicatePayload, id.viewer), {
      code: "42501",
    });
    await assert.rejects(
      as(id.sa, (c) =>
        c.query(
          "select app_private.employee_duplicate_matches(null,'test','1988-09-29')",
        ),
      ),
      { code: "42501" },
    );
    const before = await snapshot();
    await assert.rejects(
      m(id.sa, "employee_create", structuredClone(duplicatePayload)),
      { code: "22023" },
    );
    assert.deepEqual(await snapshot(), before);
    const request = randomUUID();
    const approved = { ...duplicatePayload, duplicate_review: found.token };
    const saved = await m(id.sa, "employee_create", approved, request);
    assert.deepEqual(
      await m(id.sa, "employee_create", approved, request),
      saved,
    );
    const edit = await create({ ...identity, birth_date: "1988-09-27" });
    const editPayload = {
      id: edit.id,
      expected_version: 1,
      values: { birth_date: identity.birth_date },
    };
    const editReview = await review(editPayload);
    await assert.rejects(m(id.sa, "employee_update", editPayload), {
      code: "22023",
    });
    assert.equal(await revision(edit.id), 1);
    await m(id.sa, "employee_update", {
      ...editPayload,
      duplicate_review: editReview.token,
    });
    assert.equal(await revision(edit.id), 2);
    const stale = await review(duplicatePayload);
    await m(id.sa, "employee_update", {
      id: original.id,
      expected_version: await revision(original.id),
      values: { remarks: "Change after review" },
    });
    await assert.rejects(
      m(id.sa, "employee_create", {
        ...duplicatePayload,
        duplicate_review: stale.token,
      }),
      { code: "22023" },
    );
  });
  await test("global duplicate fuzziness is superadmin-only, bounded, versioned and preserves old settings callers", async () => {
    const settings = async (actor = id.sa) =>
      (await as(actor, (c) => c.query("select public.register_settings() r")))
        .rows[0].r;
    const set = async (payload, actor = id.sa, request = randomUUID()) =>
      (
        await as(actor, (c) =>
          c.query("select public.set_register_settings($1,$2) r", [
            payload,
            request,
          ]),
        )
      ).rows[0].r;
    const before = await settings();
    const p = {
      row_numbers_allowed: before.row_numbers_allowed,
      expected_version: before.row_version,
      reason: "Check duplicate threshold",
      duplicate_name_threshold: 100,
    };
    await assert.rejects(set(p, id.admin), { code: "42501" });
    for (const value of [-1, 101, 90.5, null, "90"])
      await assert.rejects(set({ ...p, duplicate_name_threshold: value }), {
        code: "22023",
      });
    assert.deepEqual(await settings(), before);
    const request = randomUUID();
    const changed = await set(p, id.sa, request);
    assert.deepEqual(await set(p, id.sa, request), changed);
    assert.equal(changed.duplicate_name_threshold, 100);
    assert.equal(
      (
        await review({
          ...duplicatePayload,
          values: { ...identity, first_name: "Alexandrio" },
        })
      ).total,
      0,
    );
    await assert.rejects(set({ ...p, duplicate_name_threshold: 80 }), {
      code: "40001",
    });
    const legacy = await set({
      row_numbers_allowed: changed.row_numbers_allowed,
      expected_version: changed.row_version,
      reason: "Old caller retains threshold",
    });
    assert.equal(legacy.duplicate_name_threshold, 100);
    await set({
      row_numbers_allowed: legacy.row_numbers_allowed,
      expected_version: legacy.row_version,
      reason: "Restore default",
      duplicate_name_threshold: 90,
    });
  });
  await test("twenty concurrent unreviewed duplicate employees commit one winner and no orphan writes", async () => {
    const payloads = Array.from({ length: 20 }, () => ({
      target_level: "head_office",
      values: {
        last_name: "ConcurrentDuplicate",
        first_name: "UniqueName",
        birth_date: "1987-02-03",
      },
    }));
    const answers = await concurrent("employee_create", payloads);
    assert.equal(answers.filter((a) => a.ok).length, 1);
    assert.equal(answers.filter((a) => a.code === "22023").length, 19);
  });
  await test("bulk identity duplicate review previews roll back and confirmation binds the complete atomic batch", async () => {
    const a = await create({
      last_name: "BulkDuplicate",
      first_name: "Sample",
      birth_date: "1979-04-01",
    });
    const b = await create({
      last_name: "BulkDuplicate",
      first_name: "Sample",
      birth_date: "1979-04-02",
    });
    const payload = {
      rows: [
        { id: a.id, row_version: 1 },
        { id: b.id, row_version: 1 },
      ],
      values: { birth_date: "1979-04-03" },
    };
    const before = await snapshot();
    const found = await review({ operation: "bulk_update", ...payload });
    assert.equal(found.total, 2);
    assert.equal(found.items.length, 2);
    assert.equal(found.items[0].candidate_name, "BulkDuplicate, Sample");
    assert.deepEqual(await snapshot(), before);
    assert.equal(await revision(a.id), 1);
    assert.equal(await revision(b.id), 1);
    await assert.rejects(m(id.sa, "bulk_update", payload), { code: "22023" });
    assert.deepEqual(await snapshot(), before);
    const request = randomUUID();
    const approved = { ...payload, duplicate_review: found.token };
    const saved = await m(id.sa, "bulk_update", approved, request);
    assert.deepEqual(await m(id.sa, "bulk_update", approved, request), saved);
    assert.equal(await revision(a.id), 2);
    assert.equal(await revision(b.id), 2);
  });
}
