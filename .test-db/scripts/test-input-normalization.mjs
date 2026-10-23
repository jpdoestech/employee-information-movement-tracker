import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testInputNormalization({
  owner,
  test,
  m,
  q,
  revision,
  id,
}) {
  await test("text normalization uppercases employee names and preserves other case, paragraphs, exact tokens and untouched values", async () => {
    const input = {
      name: "  De   la\tCruz\u00a0 III  ",
      notes: "  First   paragraph \r\n\r\n Next\tline  ",
      password: " pass  word ",
      duplicate_review: " token ",
      config: { search: " literal  spaces " },
      values: [false, 0, null],
    };
    const clean = (
      await owner.query("select app_private.normalize_inputs($1) result", [
        input,
      ])
    ).rows[0].result;
    assert.deepEqual(clean, {
      ...input,
      name: "De la Cruz III",
      notes: "First paragraph\n\nNext line",
    });
    const req = randomUUID();
    const payload = {
      target_level: "head_office",
      initial_position: "  QA   Lead  ",
      values: {
        last_name: "  De   la Cruz  ",
        first_name: "  Ana   Maria ",
        middle_name: " van   der ",
        suffix: " III ",
        department: " HR   Operations ",
        remarks: " First   paragraph \n\n Next   line ",
        employee_category: "Agency",
      },
    };
    const created = await m(id.sa, "employee_create", payload, req);
    assert.deepEqual(await m(id.sa, "employee_create", payload, req), created);
    let employee = (
      await q(id.sa, "employee", { id: created.id, include_history: false })
    ).employee;
    assert.equal(employee.values.name, "DE LA CRUZ, ANA MARIA VAN DER III");
    assert.equal(employee.values.last_name, "DE LA CRUZ");
    assert.equal(employee.values.first_name, "ANA MARIA");
    assert.equal(employee.values.middle_name, "VAN DER");
    assert.equal(employee.values.department, "HR Operations");
    assert.equal(employee.values.position, "QA Lead");
    assert.equal(employee.values.remarks, "First paragraph\n\nNext line");
    assert.equal(employee.values.employee_category, "Admin");
    await owner.query(
      'update public.employees set custom_values=custom_values||\'{"remarks":"Legacy   spacing"}\' where id=$1',
      [created.id],
    );
    await m(id.sa, "employee_update", {
      id: created.id,
      expected_version: employee.row_version,
      values: {
        first_name: " mAriA   sAnToS ",
        department: "  Finance   Team ",
        employee_category: "Agency",
      },
      employment: { change_kind: "official", position: " Sr.   QA   Lead " },
    });
    employee = (
      await q(id.sa, "employee", { id: created.id, include_history: false })
    ).employee;
    assert.equal(employee.values.department, "Finance Team");
    assert.equal(employee.values.first_name, "MARIA SANTOS");
    assert.equal(employee.values.name, "DE LA CRUZ, MARIA SANTOS VAN DER III");
    assert.equal(employee.values.position, "Sr. QA Lead");
    assert.equal(employee.values.remarks, "Legacy   spacing");
    assert.equal(employee.values.employee_category, "Agency");
    await m(id.sa, "bulk_update", {
      rows: [{ id: created.id, row_version: employee.row_version }],
      values: { first_name: " aNnA ", suffix: " jR. " },
    });
    employee = (
      await q(id.sa, "employee", { id: created.id, include_history: false })
    ).employee;
    assert.equal(employee.values.first_name, "ANNA");
    assert.equal(employee.values.suffix, "JR.");
    assert.equal(employee.values.name, "DE LA CRUZ, ANNA VAN DER JR.");
    const deny = randomUUID();
    await owner.query(
      "insert into public.field_access_policies(id,user_id,field_id,action,effect,scope_type) select $1,$2,id,'U','deny','all' from public.field_definitions where key='first_name'",
      [deny, id.admin],
    );
    try {
      await assert.rejects(
        m(id.admin, "employee_update", {
          id: created.id,
          expected_version: employee.row_version,
          values: { first_name: " nOt aLLoWeD " },
        }),
        { code: "42501" },
      );
      assert.equal(await revision(created.id), employee.row_version);
    } finally {
      await owner.query(
        "delete from public.field_access_policies where id=$1",
        [deny],
      );
    }
  });
  await test("new employee category follows initial placement and keeps category authorization", async () => {
    for (const target of [
      { target_level: "head_office" },
      { target_level: "branch", branch_id: id.b1 },
      { target_level: "client", branch_id: id.b1, client_id: id.c1 },
    ]) {
      const created = await m(id.sa, "employee_create", {
        ...target,
        values: {
          name: `Initial category ${target.target_level}`,
          employee_category:
            target.target_level === "head_office" ? "Agency" : "Admin",
        },
      });
      const employee = (
        await q(id.sa, "employee", { id: created.id, include_history: false })
      ).employee;
      assert.equal(
        employee.values.employee_category,
        target.target_level === "head_office" ? "Admin" : "Agency",
      );
    }
    const field = (
      await owner.query(
        "select id from public.field_definitions where key='employee_category'",
      )
    ).rows[0];
    const deny = randomUUID();
    await owner.query(
      "insert into public.field_access_policies(id,user_id,field_id,action,effect,scope_type) values($1,$2,$3,'C','deny','all')",
      [deny, id.admin, field.id],
    );
    try {
      const created = await m(id.admin, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: {
          name: "Generated category without field grant",
          employee_category: "Admin",
        },
      });
      assert.equal(
        (await q(id.sa, "employee", { id: created.id, include_history: false }))
          .employee.values.employee_category,
        "Agency",
      );
      await owner.query(
        "update public.field_access_policies set action='U' where id=$1",
        [deny],
      );
      await assert.rejects(
        m(id.admin, "employee_update", {
          id: created.id,
          expected_version: await revision(created.id),
          values: { employee_category: "Admin" },
        }),
        { code: "42501" },
      );
    } finally {
      await owner.query(
        "delete from public.field_access_policies where id=$1",
        [deny],
      );
    }
  });
}
