import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testPrfAssignments({
  owner,
  test,
  as,
  q,
  m,
  id,
  today,
  revision,
}) {
  const rpc = (user, name, payload, request = randomUUID()) =>
    as(
      user,
      async (client) =>
        (
          await client.query(
            `select public.${name}($1${name === "set_staffing_requisition" ? ",$2" : ""}) r`,
            name === "set_staffing_requisition"
              ? [payload, request]
              : [payload],
          )
        ).rows[0].r,
    );
  const payload = {
    id: randomUUID(),
    client_id: id.c1,
    reference: "PRF-MULTI-27",
    employment_type: "Regular",
    starts_on: today,
    ends_on: null,
    active: true,
    expected_version: 0,
    lines: [
      {
        id: randomUUID(),
        department: "Operations",
        position: "Coordinator",
        required_headcount: 2,
      },
      {
        id: randomUUID(),
        department: "Finance",
        position: "Bookkeeper",
        required_headcount: 1,
      },
    ],
  };
  const employees = [];
  const baseline = await q(id.sa, "dashboard");
  let saved;
  await test("PRFs save multiple job requirements atomically with canonical totals and idempotent receipts", async () => {
    const request = randomUUID();
    saved = await rpc(id.sa, "set_staffing_requisition", payload, request);
    assert.equal(saved.required_headcount, 3);
    assert.deepEqual(
      await rpc(id.sa, "set_staffing_requisition", payload, request),
      saved,
    );
    await assert.rejects(
      rpc(
        id.sa,
        "set_staffing_requisition",
        { ...payload, lines: [{ ...payload.lines[0], required_headcount: 3 }] },
        request,
      ),
      /different payload/,
    );
    await assert.rejects(
      rpc(id.viewer, "set_staffing_requisition", {
        ...payload,
        id: randomUUID(),
      }),
      { code: "42501" },
    );
    const before = (
      await owner.query(
        "select revision from public.system_state where id=true",
      )
    ).rows[0].revision;
    await assert.rejects(
      rpc(id.sa, "set_staffing_requisition", {
        ...payload,
        id: randomUUID(),
        reference: "PRF-DUPLICATE-ID",
        lines: [
          payload.lines[0],
          { ...payload.lines[1], id: payload.lines[0].id },
        ],
      }),
      /distinct ID|unavailable/,
    );
    assert.equal(
      (
        await owner.query(
          "select revision from public.system_state where id=true",
        )
      ).rows[0].revision,
      before,
    );
    await assert.rejects(
      rpc(id.sa, "set_staffing_requisition", {
        ...payload,
        id: randomUUID(),
        lines: [
          { ...payload.lines[0], id: randomUUID(), required_headcount: 1.5 },
        ],
      }),
      /whole headcount/,
    );
  });
  await test("multiple employees link to one PRF and distinct job lines; matching unassigned staff do not fill it", async () => {
    for (const [index, first] of [
      "LANTERN",
      "CYPRESS",
      "MARBLE",
      "UNLINKED",
    ].entries()) {
      const line = payload.lines[index === 2 ? 1 : 0];
      const created = await m(id.sa, "employee_create", {
        target_level: "client",
        branch_id: id.b1,
        client_id: id.c1,
        initial_position: line.position,
        values: {
          last_name: "PRFTEST",
          first_name: first,
          department: line.department,
          employment_type: "Regular",
          date_hired: today,
          ...(index < 3 ? { prf_number: line.id } : {}),
        },
      });
      employees.push(created.id);
      const detail = await q(id.sa, "employee", {
        id: created.id,
        include_history: false,
      });
      assert.equal(
        detail.employee.values.prf_number,
        index < 3 ? payload.reference : null,
      );
      assert.equal(JSON.stringify(detail.employee).includes(line.id), false);
    }
    const page = await rpc(id.sa, "staffing_page", {
      clients: [id.c1],
      search: payload.reference,
    });
    assert.equal(page.total, 1);
    assert.equal(page.items[0].filled_headcount, 3);
    assert.deepEqual(
      page.items[0].lines
        .map((line) => [line.position, line.filled_headcount])
        .sort(),
      [
        ["Bookkeeper", 1],
        ["Coordinator", 2],
      ],
    );
    const report = await q(id.sa, "dashboard");
    assert.equal(report.staffing.required, baseline.staffing.required + 3);
    assert.equal(report.staffing.filled, baseline.staffing.filled + 3);
    assert.equal(
      report.fill_rate,
      Math.round(
        ((baseline.staffing.filled + 3) / (baseline.staffing.required + 3)) *
          1000,
      ) / 10,
    );
    const options = await rpc(id.sa, "staffing_options", {
      employee_id: employees[0],
    });
    assert.equal(options.selected.id, payload.lines[0].id);
    assert.equal(options.items.length, 2);
  });
  await test("imports and bulk updates share PRF validation and preserve atomic previews", async () => {
    const imported = {
      target_level: "client",
      branch_id: id.b1,
      client_id: id.c1,
      rows: [
        {
          values: {
            first_name: "QUARTZ",
            last_name: "PRFIMPORT",
            department: "Operations",
            position: "Coordinator",
            employment_type: "Regular",
            date_hired: today,
            prf_number: payload.reference,
          },
        },
      ],
    };
    const before = Number(
      (await owner.query("select count(*) n from public.employees")).rows[0].n,
    );
    await as(id.sa, (client) =>
      client.query("select public.transaction_preview('employee_import',$1)", [
        imported,
      ]),
    );
    assert.equal(
      Number(
        (await owner.query("select count(*) n from public.employees")).rows[0]
          .n,
      ),
      before,
    );
    await m(id.sa, "employee_import", imported);
    assert.equal(
      (
        await owner.query(
          "select prf_line_id from public.employees where custom_values->>'first_name'='QUARTZ'",
        )
      ).rows[0].prf_line_id,
      payload.lines[0].id,
    );
    await m(id.sa, "bulk_update", {
      rows: [{ id: employees[3], row_version: await revision(employees[3]) }],
      values: { prf_number: payload.lines[0].id },
    });
    assert.equal(
      (
        await owner.query(
          "select prf_line_id from public.employees where id=$1",
          [employees[3]],
        )
      ).rows[0].prf_line_id,
      payload.lines[0].id,
    );
    const page = await rpc(id.sa, "staffing_page", {
      search: payload.reference,
    });
    assert.equal(page.items[0].filled_headcount, 3);
  });
  await test("profile employment edits share the PRF guard and audit changes between requirements of the same PRF", async () => {
    for (const line of [payload.lines[1], payload.lines[0]]) {
      await m(id.sa, "employee_update", {
        id: employees[0],
        expected_version: await revision(employees[0]),
        values: { prf_number: line.id, department: line.department },
        employment: { change_kind: "correction", position: line.position },
      });
      assert.equal(
        (
          await owner.query(
            "select prf_line_id from public.employees where id=$1",
            [employees[0]],
          )
        ).rows[0].prf_line_id,
        line.id,
      );
      assert.equal(
        (await q(id.sa, "employee", { id: employees[0] })).employee.values
          .prf_number,
        payload.reference,
      );
    }
    const changes = await owner.query(
      "select before_values->>'prf_number' before_id,after_values->>'prf_number' after_id from app_private.audit_value_changes where employee_id=$1 and after_values ? 'prf_number' and audit_id is not null",
      [employees[0]],
    );
    assert(
      changes.rows.some(
        (change) =>
          change.before_id === payload.lines[0].id &&
          change.after_id === payload.lines[1].id,
      ),
    );
  });
  await test("PRF references enforce client scope, field permission, versions and stable assigned job details", async () => {
    const secret = {
      ...payload,
      id: randomUUID(),
      reference: "PRF-OTHER-CLIENT",
      client_id: id.c2,
      lines: [{ ...payload.lines[0], id: randomUUID() }],
    };
    await rpc(id.sa, "set_staffing_requisition", secret);
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: employees[0],
        expected_version: await revision(employees[0]),
        values: { prf_number: secret.lines[0].id },
      }),
      /available PRF/,
    );
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: employees[0],
        expected_version: 0,
        values: { prf_number: payload.lines[1].id },
      }),
      { code: "40001" },
    );
    await assert.rejects(
      rpc(id.sa, "set_staffing_requisition", {
        ...payload,
        expected_version: saved.row_version,
        reference: "RENAMED",
      }),
      /locked/,
    );
    await assert.rejects(
      rpc(id.sa, "set_staffing_requisition", {
        ...payload,
        expected_version: saved.row_version,
        lines: [{ ...payload.lines[0], position: "Changed" }, payload.lines[1]],
      }),
      /locked/,
    );
    await owner.query(
      "insert into public.field_access_policies(user_id,field_id,action,effect) select $1,id,'R','deny' from public.field_definitions where key='prf_number'",
      [id.client],
    );
    const detail = await q(id.client, "employee", {
      id: employees[0],
      include_history: false,
    });
    assert.equal(Object.hasOwn(detail.employee.values, "prf_number"), false);
    await assert.rejects(
      rpc(id.client, "staffing_options", { employee_id: employees[0] }),
      { code: "42501" },
    );
    await assert.rejects(
      as(id.sa, (client) =>
        client.query("select * from public.staffing_requisition_lines"),
      ),
      { code: "42501" },
    );
  });
  await test("retiring a PRF requirement retains employee links and clearing a link updates fill rate", async () => {
    await m(id.sa, "employee_update", {
      id: employees[0],
      expected_version: await revision(employees[0]),
      values: { prf_number: null },
    });
    assert.equal(
      (await q(id.sa, "employee", { id: employees[0] })).employee.values
        .prf_number,
      null,
    );
    saved = await rpc(id.sa, "set_staffing_requisition", {
      ...payload,
      expected_version: saved.row_version,
      lines: [payload.lines[0]],
    });
    assert.equal(
      (await q(id.sa, "employee", { id: employees[2] })).employee.values
        .prf_number,
      payload.reference,
    );
    assert.equal(
      (
        await owner.query(
          "select prf_line_id from public.employees where id=$1",
          [employees[2]],
        )
      ).rows[0].prf_line_id,
      payload.lines[1].id,
    );
    const options = await rpc(id.sa, "staffing_options", {
      employee_id: employees[2],
    });
    assert.equal(options.selected.id, payload.lines[1].id);
    assert.equal(options.selected.available, false);
    assert.equal(
      options.items.some((line) => line.id === payload.lines[1].id),
      false,
    );
  });
}
