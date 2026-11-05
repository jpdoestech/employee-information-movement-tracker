import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testAppsScript({ owner, test, worker, m, id }) {
  await test("Apps Script connection is service-only, token-free and preserves owner and folder bindings", async () => {
    const saved = (
      await owner.query(
        "select to_jsonb(c) value from app_private.google_connection c",
      )
    ).rows[0]?.value;
    await owner.query(
      "delete from app_private.google_connection where id=true",
    );
    try {
      const identity = {
        owner_permission_id: "original",
        owner_email: "owner@example.test",
      };
      await assert.rejects(worker("bind_apps_script", {}), /Verified Google/);
      await worker("bind_apps_script", identity);
      await worker("folder", { id: "original-folder" });
      await worker("bind_apps_script", identity);
      let connection = await worker("connection");
      assert.equal(connection.auth_mode, "apps_script");
      assert.equal(connection.encrypted_refresh_token, null);
      assert.equal(connection.folder_id, "original-folder");
      await assert.rejects(worker("store_connection", {}), /Verified Google/);
      assert.equal((await worker("connection")).auth_mode, "apps_script");
      await assert.rejects(
        worker("bind_apps_script", {
          ...identity,
          owner_permission_id: "intruder",
        }),
        /original Google account/,
      );
      await worker("store_connection", {
        ...identity,
        encrypted_refresh_token: "synthetic-ciphertext",
      });
      assert.equal((await worker("connection")).auth_mode, "oauth");
      await owner.query(
        "update app_private.google_connection set owner_permission_id=null where id=true",
      );
      await assert.rejects(
        worker("bind_apps_script", identity),
        /original Google account/,
      );
      await worker("bind_apps_script", {
        ...identity,
        verified_folder_id: "original-folder",
      });
      connection = await worker("connection");
      assert.equal(connection.owner_permission_id, "original");
      assert.equal(connection.folder_id, "original-folder");
      assert.equal(connection.encrypted_refresh_token, null);
      for (const role of ["anon", "authenticated"]) {
        assert.equal(
          (
            await owner.query(
              "select has_function_privilege($1,'public.worker_command(text,jsonb)','execute') allowed",
              [role],
            )
          ).rows[0].allowed,
          false,
        );
        assert.equal(
          (
            await owner.query(
              "select has_function_privilege($1,'app_private.worker_command_before_apps_script(text,jsonb)','execute') allowed",
              [role],
            )
          ).rows[0].allowed,
          false,
        );
      }
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
  await test("existing spreadsheet mapping is authorized, atomic, immutable and replay-safe", async () => {
    const branch = randomUUID();
    const bookId = randomUUID();
    await owner.query(
      "insert into public.branches(id,code,name) values($1,$2,$2)",
      [branch, `MAP-${branch}`],
    );
    await owner.query(
      "insert into public.branch_spreadsheets(id,branch_id) values($1,$2)",
      [bookId, branch],
    );
    const state = async () =>
      (
        await owner.query(
          "select spreadsheet_id,row_version::int,approved,last_error from public.branch_spreadsheets where id=$1",
          [bookId],
        )
      ).rows[0];
    try {
      const p = {
        id: bookId,
        row_version: 1,
        target_spreadsheet_id: "user_owned_sheet-123",
        allowed_fields: ["employee_number"],
        allowed_clients: [],
        include_branch: true,
        sharing_emails: [],
        approved: true,
        reason: "Synthetic existing spreadsheet mapping",
      };
      await assert.rejects(m(id.admin, "workbook", p), { code: "42501" });
      await assert.rejects(
        m(id.sa, "workbook", { ...p, target_spreadsheet_id: "../bad" }),
        /valid spreadsheet ID/,
      );
      assert.equal((await state()).row_version, 1);
      assert.equal((await state()).approved, false);
      const request = randomUUID();
      const result = await m(id.sa, "workbook", p, request);
      assert.deepEqual(await m(id.sa, "workbook", p, request), result);
      assert.equal((await state()).spreadsheet_id, p.target_spreadsheet_id);
      assert.equal((await state()).row_version, 2);
      await assert.rejects(
        m(
          id.sa,
          "workbook",
          { ...p, target_spreadsheet_id: "different_sheet-123" },
          request,
        ),
        /different payload/,
      );
      await assert.rejects(
        m(id.sa, "workbook", {
          ...p,
          row_version: 2,
          target_spreadsheet_id: "different_sheet-123",
        }),
        /reviewed migration/,
      );
      assert.equal((await state()).spreadsheet_id, p.target_spreadsheet_id);
      assert.equal((await state()).row_version, 2);
      await assert.rejects(m(id.sa, "workbook", p), /changed/);
      await worker("book_status", {
        id: bookId,
        status: "Suspended",
        error_code: "unapproved_user",
      });
      assert.match((await state()).last_error, /person with Drive access/);
      await worker("book_status", {
        id: bookId,
        status: "Suspended",
        error_code: "ownership_mismatch",
      });
      assert.match((await state()).last_error, /must own/);
      await worker("book_status", {
        id: bookId,
        status: "Suspended",
        error_code: "private arbitrary diagnostics",
      });
      assert.doesNotMatch((await state()).last_error, /private arbitrary/);
      await worker("book_status", { id: bookId, status: "Synced" });
      assert.equal((await state()).last_error, null);
    } finally {
      await owner.query("delete from public.branch_spreadsheets where id=$1", [
        bookId,
      ]);
      await owner.query("delete from public.branches where id=$1", [branch]);
    }
  });
  await test("branch export headers adapt to approved Field Builder additions, renames, order and applicability", async () => {
    const branches = [randomUUID(), randomUUID()];
    const books = [randomUUID(), randomUUID()];
    const field = randomUUID();
    const key = `sync_${field.replaceAll("-", "")}`;
    try {
      for (let index = 0; index < branches.length; index++) {
        await owner.query(
          "insert into public.branches(id,code,name) values($1,$2,$2)",
          [branches[index], `DYN-${branches[index]}`],
        );
        await owner.query(
          "insert into public.branch_spreadsheets(id,branch_id,approved,allowed_fields,include_branch) values($1,$2,true,$3,true)",
          [books[index], branches[index], ["employee_number"]],
        );
      }
      await owner.query(
        "insert into public.field_definitions(id,group_id,key,label,type,scope_mode,display_order) values($1,$2,$3,$4,'short_text','selected',-999)",
        [field, id.core, key, `Synthetic ${field}`],
      );
      await owner.query(
        "insert into public.field_scope_targets(field_id,scope_type,scope_id) values($1,'branch',$2)",
        [field, branches[0]],
      );
      let snapshot = await worker("snapshot", { id: books[0] });
      assert.equal(
        snapshot.fields.some((f) => f.key === key),
        false,
        "new fields need explicit export approval",
      );
      await owner.query(
        "update public.branch_spreadsheets set allowed_fields=array['employee_number',$1] where id=any($2::uuid[])",
        [key, books],
      );
      snapshot = await worker("snapshot", { id: books[0] });
      assert.equal(
        snapshot.fields[0].key,
        key,
        "Field Builder order determines column order",
      );
      assert.equal(
        (await worker("snapshot", { id: books[1] })).fields.some(
          (f) => f.key === key,
        ),
        false,
        "another branch cannot export an inapplicable column",
      );
      await owner.query(
        "update public.field_definitions set label=$1 where id=$2",
        [`Renamed ${field}`, field],
      );
      snapshot = await worker("snapshot", { id: books[0] });
      assert.equal(snapshot.fields[0].key, key);
      assert.equal(snapshot.fields[0].label, `Renamed ${field}`);
      await owner.query(
        "update public.field_definitions set active=false where id=$1",
        [field],
      );
      assert.equal(
        (await worker("snapshot", { id: books[0] })).fields.some(
          (f) => f.key === key,
        ),
        false,
      );
    } finally {
      await owner.query(
        "delete from public.field_scope_targets where field_id=$1",
        [field],
      );
      await owner.query("delete from public.field_definitions where id=$1", [
        field,
      ]);
      await owner.query(
        "delete from public.branch_spreadsheets where id=any($1::uuid[])",
        [books],
      );
      await owner.query(
        "delete from public.branches where id=any($1::uuid[])",
        [branches],
      );
    }
  });
}
