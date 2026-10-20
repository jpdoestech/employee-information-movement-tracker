import assert from "node:assert/strict";

export async function testAuditFixes({
  owner,
  test,
  q,
  m,
  worker,
  revision,
  id,
}) {
  await test("organization options search, paging and Head Office retain scope boundaries", async () => {
    for (let i = 0; i < 105; i++)
      await owner.query(
        "insert into public.clients(branch_id,code,name) values($1,$2,$3)",
        [id.b2, `AUD${i}`, `ZZ Audit Client ${String(i).padStart(3, "0")}`],
      );
    const first = await q(id.sa, "options");
    assert.equal(first.length, 100);
    assert.equal(first.find((o) => o.id === "head_office").active, true);
    const all = [...first];
    let page;
    do {
      page = await q(id.sa, "options", { offset: all.length });
      all.push(...page);
    } while (page.length === 100);
    assert.equal(new Set(all.map((o) => o.id)).size, all.length);
    assert(all.some((o) => o.label === "ZZ Audit Client 104"));
    const searched = await q(id.sa, "options", {
      search: "ZZ Audit Client 104",
    });
    assert.equal(searched.length, 1);
    assert.equal(searched[0].label, "ZZ Audit Client 104");
    assert.deepEqual(
      await q(id.viewer, "options", { search: "ZZ Audit Client" }),
      [],
    );
    const branchFiltered = await q(id.sa, "options", { branches: [id.b1] });
    assert(
      branchFiltered.every((o) => o.kind !== "client" || o.branch_id === id.b1),
    );
    await assert.rejects(
      q(id.sa, "options", { offset: -1 }),
      /Invalid option offset/,
    );
  });

  await test("inactive permission groups remove workbook headers and values while retaining stored data", async () => {
    const employee = (
      await m(id.sa, "employee_create", {
        target_level: "branch",
        branch_id: id.b1,
        values: { name: "Audit Group Export" },
      })
    ).id;
    const group = (await m(id.sa, "group", { name: "Audit Export Group" })).id;
    await m(id.sa, "field", {
      group_id: group,
      key: "audit_group_export",
      label: "Audit Group Export",
      type: "short_text",
    });
    await m(id.sa, "employee_update", {
      id: employee,
      expected_version: await revision(employee),
      values: { audit_group_export: "retained value" },
    });
    const book = (await worker("workbooks")).find((b) => b.branch_id === id.b1);
    await m(id.sa, "workbook", {
      id: book.id,
      row_version: book.row_version,
      approved: true,
      allowed_fields: ["employee_number", "audit_group_export"],
      allowed_clients: [],
      include_branch: true,
      sharing_emails: [],
      reason: "Synthetic audit regression",
    });
    assert(
      (await worker("snapshot", { id: book.id })).fields.some(
        (f) => f.key === "audit_group_export",
      ),
    );
    await m(id.sa, "group", {
      id: group,
      expected_version: 1,
      name: "Audit Export Group",
      active: false,
    });
    const snapshot = await worker("snapshot", { id: book.id });
    assert(!snapshot.fields.some((f) => f.key === "audit_group_export"));
    assert(
      !Object.hasOwn(
        snapshot.rows.find((e) => e.id === employee).values,
        "audit_group_export",
      ),
    );
    assert(
      !Object.hasOwn(
        (await q(id.sa, "employee", { id: employee })).employee.values,
        "audit_group_export",
      ),
    );
    assert.equal(
      (
        await owner.query(
          "select custom_values->>'audit_group_export' value from public.employees where id=$1",
          [employee],
        )
      ).rows[0].value,
      "retained value",
    );
  });
}
