import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testColumnPreview({ owner, test, as, q, id }) {
  const config = {
    columns: ["employee_number", "name", "age", "length_of_service"],
    pinned: ["name"],
    showRowNumbers: true,
    filter: { sort: "employee_number", direction: "asc", limit: 25, offset: 0 },
  };
  const save = (p, request = randomUUID(), user = id.sa) =>
    as(
      user,
      async (c) =>
        (
          await c.query("select public.save_personal_view($1,$2) r", [
            p,
            request,
          ])
        ).rows[0].r,
    );
  const names = () =>
    owner.query(
      "select name,config from public.user_table_views where user_id=$1 order by name",
      [id.sa],
    );
  await test("personal view and activation save atomically with payload-bound receipts", async () => {
    const p = { name: "Atomic preview", config },
      request = randomUUID();
    const result = await save(p, request);
    assert.deepEqual(await save(p, request), result);
    const rows = (await names()).rows;
    for (const name of ["Atomic preview", "__active__"])
      assert.deepEqual(rows.find((v) => v.name === name).config, config);
    await assert.rejects(
      save({ ...p, name: "Different" }, request),
      /different payload/,
    );
    const before = (await names()).rows;
    await owner.query(
      "create function app_private.fail_preview_activation() returns trigger language plpgsql as $$ begin raise exception 'Synthetic activation failure'; end $$; create trigger fail_preview_activation before insert or update on public.user_table_views for each row when (new.name='__active__') execute function app_private.fail_preview_activation()",
    );
    try {
      await assert.rejects(
        save({ name: "Must roll back", config }),
        /Synthetic activation failure/,
      );
    } finally {
      await owner.query(
        "drop trigger fail_preview_activation on public.user_table_views; drop function app_private.fail_preview_activation()",
      );
    }
    assert.deepEqual((await names()).rows, before);
  });
  await test("personal layout validation rejects reserved names, hidden fields and invalid pin layouts", async () => {
    const before = (await names()).rows;
    for (const p of [
      { name: "__active__", config },
      { name: "Bad", config: { ...config, columns: ["not_a_field"] } },
      { name: "Bad", config: { ...config, pinned: ["name", "name"] } },
      { name: "Bad", config: { ...config, columns: [] } },
    ])
      await assert.rejects(save(p));
    await assert.rejects(save({ name: "Denied", config }, randomUUID(), null), {
      code: "42501",
    });
    assert.deepEqual((await names()).rows, before);
  });
}
