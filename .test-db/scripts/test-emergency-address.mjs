import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testEmergencyAddress({
  owner,
  test,
  m,
  q,
  revision,
  id,
  today,
}) {
  await test("emergency address is independent, hierarchy-validated and atomically versioned", async () => {
    const fields = (
      await owner.query(
        "select key,group_id,form_group_id from public.field_definitions where key in ('emergency_contact_name','emergency_name','emergency_address','emergency_province','emergency_city_municipality','emergency_barangay','emergency_postal_code')",
      )
    ).rows;
    assert.equal(fields.length, 6);
    assert.equal(new Set(fields.map((f) => f.group_id)).size, 1);
    assert.equal(new Set(fields.map((f) => f.form_group_id)).size, 1);
    const employee = (
      await m(id.sa, "employee_create", {
        target_level: "head_office",
        values: {
          name: "Synthetic emergency address",
          address: "Home street",
          current_address: "Current street",
          emergency_address: "Emergency street",
          emergency_province: "Davao del Sur",
          emergency_city_municipality: "City of Davao",
          emergency_barangay: "Agdao",
          emergency_postal_code: "8000",
        },
      })
    ).id;
    const before = await q(id.sa, "employee", { id: employee });
    assert.equal(before.employee.values.address, "Home street");
    assert.equal(before.employee.values.current_address, "Current street");
    assert.equal(before.employee.values.emergency_address, "Emergency street");
    const version = await revision(employee);
    await assert.rejects(
      m(id.sa, "employee_update", {
        id: employee,
        expected_version: version,
        values: {
          emergency_barangay: "Not an official barangay",
          emergency_address: "Must roll back",
        },
      }),
      { code: "22023" },
    );
    assert.equal(await revision(employee), version);
    assert.equal(
      (await q(id.sa, "employee", { id: employee })).employee.values
        .emergency_address,
      "Emergency street",
    );
    const reader = randomUUID();
    await owner.query("insert into auth.users values($1)", [reader]);
    await owner.query(
      "insert into public.user_profiles(id,display_name,role) values($1,'Synthetic address reader','viewer')",
      [reader],
    );
    await m(id.sa, "scope", {
      user_id: reader,
      scope_type: "head_office",
      actions: ["R"],
      starts_on: today,
      reason: "Synthetic address read",
    });
    await m(id.sa, "policy", {
      user_id: reader,
      group_id: fields[0].group_id,
      action: "R",
      effect: "allow",
      inherit_new: true,
      scope_type: "all",
      reason: "Synthetic group read",
    });
    assert.equal(
      (await q(reader, "employee", { id: employee })).employee.values
        .emergency_address,
      "Emergency street",
    );
    const field = (
      await owner.query(
        "select id from public.field_definitions where key='emergency_address'",
      )
    ).rows[0].id;
    await m(id.sa, "policy", {
      user_id: reader,
      field_id: field,
      action: "R",
      effect: "deny",
      scope_type: "all",
      reason: "Synthetic private emergency address",
    });
    const denied = (await q(reader, "employee", { id: employee })).employee
      .values;
    assert(!Object.hasOwn(denied, "emergency_address"));
    assert.equal(denied.emergency_province, "Davao del Sur");
  });
}
