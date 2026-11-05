import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testFunctionFixes({ owner, test, m, worker, id }) {
  await test("permission batches are superadmin-only, atomic, payload-bound and replay-safe", async () => {
    const reason = "Synthetic atomic permission batch";
    const payload = {
      user_id: id.admin,
      group_id: id.contact,
      actions: ["R", "U"],
      effect: "allow",
      scope_type: "all",
      inherit_new: true,
      reason,
    };
    const request = randomUUID();
    const count = async () =>
      (
        await owner.query(
          "select count(*)::int n from public.audit_log where reason=$1",
          [reason],
        )
      ).rows[0].n;
    const before = await count();
    await assert.rejects(m(id.admin, "policy_batch", payload), {
      code: "42501",
    });
    await assert.rejects(m(id.viewer, "policy_batch", payload), {
      code: "42501",
    });
    for (const actions of [[], ["R", "R"], ["R", "invalid"], [null]])
      await assert.rejects(m(id.sa, "policy_batch", { ...payload, actions }));
    await owner.query(
      "alter table public.field_access_policies add constraint synthetic_batch_failure check(action<>'U') not valid",
    );
    try {
      await assert.rejects(m(id.sa, "policy_batch", payload));
      assert.equal(await count(), before);
    } finally {
      await owner.query(
        "alter table public.field_access_policies drop constraint synthetic_batch_failure",
      );
    }
    assert.equal((await m(id.sa, "policy_batch", payload, request)).updated, 2);
    assert.equal(await count(), before + 2);
    await m(id.sa, "policy_batch", payload, request);
    assert.equal(await count(), before + 2);
    await assert.rejects(
      m(id.sa, "policy_batch", { ...payload, effect: "deny" }, request),
      /different payload/,
    );
  });
  await test("publish guard rejects changed schema revisions and workbook approvals", async () => {
    const book = (await worker("workbooks")).find(
      (book) => book.branch_id === id.b1,
    );
    const snapshot = await worker("snapshot", { id: book.id });
    const payload = {
      id: book.id,
      schema_signature: snapshot.schema_signature,
      row_version: book.row_version,
    };
    await worker("publish_guard", payload);
    await owner.query("begin");
    try {
      await owner.query(
        "update public.field_definitions set sensitivity='restricted' where key='employee_number'",
      );
      await assert.rejects(
        owner.query("select public.worker_command('publish_guard',$1)", [
          payload,
        ]),
        /Snapshot or export policy changed/,
      );
    } finally {
      await owner.query("rollback");
    }
    // Ordinary edits do not invalidate an otherwise safe asynchronous snapshot.
    await owner.query(
      "update public.system_state set revision=revision+1 where id=true",
    );
    await worker("publish_guard", payload);
    await assert.rejects(
      worker("publish_guard", {
        ...payload,
        row_version: book.row_version - 1,
      }),
      /Snapshot or export policy changed/,
    );
  });
  await test("Google reconnect preserves mappings and rejects another or unverified legacy owner", async () => {
    const saved = (
      await owner.query(
        "select to_jsonb(c) value from app_private.google_connection c",
      )
    ).rows[0]?.value;
    await owner.query(
      "delete from app_private.google_connection where id=true",
    );
    try {
      const original = {
        encrypted_refresh_token: "synthetic-ciphertext",
        owner_email: "original@example.test",
        owner_permission_id: "synthetic-owner",
      };
      await worker("store_connection", original);
      await worker("folder", { id: "synthetic-folder" });
      await worker("store_connection", {
        ...original,
        encrypted_refresh_token: "synthetic-refreshed",
      });
      await assert.rejects(
        worker("store_connection", {
          ...original,
          owner_permission_id: "different-owner",
        }),
        /original Google account/,
      );
      await assert.rejects(
        worker("store_connection", { encrypted_refresh_token: "old-client" }),
        /Verified Google/,
      );
      assert.equal((await worker("connection")).folder_id, "synthetic-folder");
      await owner.query(
        "update app_private.google_connection set owner_permission_id=null where id=true",
      );
      await assert.rejects(
        worker("store_connection", original),
        /original Google account/,
      );
      await worker("store_connection", {
        ...original,
        verified_folder_id: "synthetic-folder",
      });
      assert.equal(
        (await worker("connection")).owner_permission_id,
        original.owner_permission_id,
      );
    } finally {
      await owner.query(
        "delete from app_private.google_connection where id=true",
      );
      if (saved)
        await owner.query(
          "insert into app_private.google_connection select (jsonb_populate_record(null::app_private.google_connection,$1)).*",
          [saved],
        );
    }
  });
}
