import assert from "node:assert/strict";

export async function testEmployeeCategory({
  owner,
  test,
  m,
  q,
  revision,
  id,
}) {
  await test("editable Admin and Agency categories preserve placement, account roles and field authorization", async () => {
    const admin = (
      await m(id.sa, "employee_create", {
        target_level: "head_office",
        values: { name: "Category office staff", employee_category: "Admin" },
      })
    ).id;
    const agency = (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: { name: "Category branch staff", employee_category: "Agency" },
      })
    ).id;
    const client = (
      await m(id.sa, "employee_create", {
        target_level: "client",
        branch_id: id.b1,
        client_id: id.c1,
        values: { name: "Category client staff", employee_category: "Agency" },
      })
    ).id;
    assert.equal(
      (await q(id.sa, "employee", { id: admin })).employee.values
        .employee_category,
      "Admin",
    );
    assert.equal(
      (await q(id.sa, "employee", { id: agency })).employee.values
        .employee_category,
      "Agency",
    );
    assert.equal(
      (await q(id.sa, "employee", { id: client })).employee.values
        .employee_category,
      "Agency",
    );
    const version = await revision(admin);
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: admin,
        expected_version: version,
        values: { employee_category: "Invalid" },
      }),
    );
    assert.equal(await revision(admin), version);
    await m(id.sa, "employee_update", {
      id: admin,
      expected_version: version,
      values: { employee_category: "Agency" },
    });
    const updated = (await q(id.sa, "employee", { id: admin })).employee;
    assert.equal(updated.values.branch, "Head Office");
    assert.equal(updated.values.employee_category, "Agency");
    assert.equal(
      (
        await owner.query("select role from public.user_profiles where id=$1", [
          id.sa,
        ])
      ).rows[0].role,
      "superadmin",
    );
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: admin,
        expected_version: version,
        values: { employee_category: "Admin" },
      }),
      { code: "40001" },
    );
    const field = (
      await owner.query(
        "select id from public.field_definitions where key='employee_category'",
      )
    ).rows[0];
    await m(id.sa, "policy", {
      user_id: id.admin,
      field_id: field.id,
      action: "R",
      effect: "deny",
      scope_type: "all",
      reason: "Synthetic category denial",
    });
    assert(
      !Object.hasOwn(
        (await q(id.admin, "employee", { id: agency })).employee.values,
        "employee_category",
      ),
    );
    const denied = await q(id.admin, "employees", {
      sort: "id",
      predicates: [{ key: "employee_category", op: "eq", value: "Agency" }],
    });
    assert.equal(denied.total, 0);
  });
}
