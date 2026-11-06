import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testRegisterViews({ owner, test, as, q, id }) {
  const get = (user) =>
    as(user, (c) =>
      c.query("select public.register_settings() r").then((r) => r.rows[0].r),
    );
  const save = (user, p, request = randomUUID()) =>
    as(user, (c) =>
      c
        .query("select public.set_register_view($1,$2) r", [p, request])
        .then((r) => r.rows[0].r),
    );
  const base = {
    name: "Synthetic managed view",
    user_id: null,
    scope_type: "all",
    scope_id: null,
    config: {
      columns: ["employee_number", "name"],
      pinned: ["name"],
      showRowNumbers: true,
    },
    reason: "Synthetic display verification",
  };
  const original = await get(id.sa);
  const global = randomUUID(),
    account = randomUUID(),
    other = randomUUID();
  await test("managed register views are superadmin-only with no browser table bypass", async () => {
    for (const user of [null, id.viewer, id.admin])
      await assert.rejects(
        save(user, {
          ...base,
          id: global,
          expected_version: original.row_version,
        }),
        { code: "42501" },
      );
    await assert.rejects(
      as(id.sa, (c) =>
        c.query("select managed_views from public.register_display_settings"),
      ),
      { code: "42501" },
    );
    assert.deepEqual(await get(id.sa), original);
  });
  await test("managed view save is atomic, versioned, audited and replay-safe", async () => {
    const before = await q(id.sa, "employees");
    const payload = {
        ...base,
        id: global,
        expected_version: original.row_version,
      },
      request = randomUUID();
    const result = await save(id.sa, payload, request);
    assert.equal(result.row_version, original.row_version + 1);
    assert.equal(
      result.managed_views.find((v) => v.id === global).config.columns[0],
      "employee_number",
    );
    assert.deepEqual(await save(id.sa, payload, request), result);
    await assert.rejects(
      save(id.sa, { ...payload, name: "Changed" }, request),
      /different payload/,
    );
    await assert.rejects(save(id.sa, { ...payload, id: randomUUID() }), {
      code: "40001",
    });
    const after = await q(id.sa, "employees");
    assert.deepEqual(after.items, before.items);
    assert.equal(after.total, before.total);
    assert.equal(after.revision, before.revision + 1);
    assert.equal(
      (
        await owner.query(
          "select count(*) n from public.audit_log where entity='register_settings' and next_reference @> $1::jsonb",
          [JSON.stringify([{ id: global }])],
        )
      ).rows[0].n,
      "1",
    );
  });
  await test("managed views reject invalid fields, conflicting targets and locations without changes", async () => {
    const current = await get(id.sa);
    for (const patch of [
      {},
      { user_id: randomUUID() },
      { scope_type: "invalid" },
      { scope_type: "client", scope_id: randomUUID() },
      { config: { ...base.config, columns: ["No."] } },
      { config: { ...base.config, columns: ["name", "name"] } },
      { config: { ...base.config, pinned: ["position"] } },
      { config: { ...base.config, showRowNumbers: null } },
      { config: { ...base.config, columns: [] } },
    ])
      await assert.rejects(
        save(id.sa, {
          ...base,
          ...patch,
          id: randomUUID(),
          expected_version: current.row_version,
        }),
        { code: "22023" },
      );
    assert.deepEqual(await get(id.sa), current);
  });
  await test("accounts receive only global and their own managed rules", async () => {
    await save(id.sa, {
      ...base,
      id: account,
      user_id: id.admin,
      scope_type: "branch",
      scope_id: id.b1,
      expected_version: (await get(id.sa)).row_version,
    });
    await save(id.sa, {
      ...base,
      id: other,
      user_id: id.viewer,
      scope_type: "client",
      scope_id: id.c1,
      expected_version: (await get(id.sa)).row_version,
    });
    assert((await get(id.admin)).managed_views.some((v) => v.id === global));
    assert((await get(id.admin)).managed_views.some((v) => v.id === account));
    assert(!(await get(id.admin)).managed_views.some((v) => v.id === other));
    assert(!(await get(id.viewer)).managed_views.some((v) => v.id === account));
  });
  await test("existing register settings saves preserve managed views; removal preserves personal views", async () => {
    const current = await get(id.sa);
    const personal = (await q(id.sa, "context")).views;
    await as(id.sa, (c) =>
      c.query("select public.set_register_settings($1,$2)", [
        {
          row_numbers_allowed: current.row_numbers_allowed,
          expected_version: current.row_version,
          reason: "Synthetic existing display save",
        },
        randomUUID(),
      ]),
    );
    assert.deepEqual((await get(id.sa)).managed_views, current.managed_views);
    for (const rid of [global, account, other])
      await save(id.sa, {
        id: rid,
        remove: true,
        expected_version: (await get(id.sa)).row_version,
        reason: "Synthetic display cleanup",
      });
    assert.deepEqual(
      (await get(id.sa)).managed_views,
      original.managed_views || [],
    );
    assert.deepEqual((await q(id.sa, "context")).views, personal);
  });
}
