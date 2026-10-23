import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testPasswordReceipts({ owner, test, as, id }) {
  await test("password change receipts are service-only and preserve roles, scopes and capabilities", async () => {
    const args = [
      id.sa,
      id.admin,
      randomUUID(),
      "Synthetic password recovery",
      "a".repeat(64),
      false,
    ];
    const call = (values = args, role = "service_role", who = null) =>
      as(
        who,
        (c) =>
          c
            .query(
              "select public.password_change_receipt($1,$2,$3,$4,$5,$6) r",
              values,
            )
            .then((r) => r.rows[0].r),
        role,
      );
    for (const who of [id.sa, id.admin, id.viewer])
      await assert.rejects(call(args, "authenticated", who), { code: "42501" });
    await assert.rejects(call(args, "anon"), { code: "42501" });
    await assert.rejects(call([id.admin, ...args.slice(1)]), { code: "42501" });
    const snapshot = async () =>
      (
        await owner.query(
          "select (select jsonb_agg(to_jsonb(u) order by u.id) from public.user_profiles u) profiles,(select jsonb_agg(to_jsonb(s) order by s.id) from public.user_scope_grants s) scopes,(select jsonb_agg(to_jsonb(c) order by c.user_id,c.capability) from public.capability_grants c) capabilities",
        )
      ).rows[0];
    const before = await snapshot();
    assert.equal((await call()).completed, false);
    assert.equal(
      (
        await owner.query(
          "select count(*)::int n from public.audit_log where operation='set_password'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal((await call([...args.slice(0, 5), true])).completed, true);
    assert.equal((await call()).completed, true);
    assert.equal((await call([...args.slice(0, 5), true])).completed, true);
    const audit = (
      await owner.query(
        "select actor_id,entity_id,changed_keys,reason from public.audit_log where operation='set_password'",
      )
    ).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor_id, id.sa);
    assert.equal(audit[0].entity_id, id.admin);
    assert.deepEqual(audit[0].changed_keys, ["password"]);
    assert.equal(audit[0].reason, args[3]);
    assert.deepEqual(await snapshot(), before);
    await assert.rejects(call([...args.slice(0, 4), "b".repeat(64), true]), {
      code: "40001",
    });
    await as(
      null,
      async (c) => {
        await c.query(
          "select public.password_change_receipt($1,$2,$3,$4,$5,false)",
          args.slice(0, 5),
        );
        assert.equal(
          (
            await c.query(
              "select nullif(current_setting('request.jwt.claim.sub',true),'') as id",
            )
          ).rows[0].id,
          null,
        );
      },
      "service_role",
    );
  });
}
