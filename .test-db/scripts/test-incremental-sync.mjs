import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export async function testIncrementalSync({
  owner,
  test,
  worker,
  as,
  id,
  today,
}) {
  await test("incremental projection pages a 3000-employee branch and fences resumable progress", async () => {
    const branch = randomUUID(),
      other = randomUUID(),
      book = randomUUID(),
      token = randomUUID();
    let employeeIds = [];
    const started = performance.now();
    await owner.query(
      "insert into public.branches(id,code,name) values($1,$2,$2),($3,$4,$4)",
      [branch, `SYNC-${branch}`, other, `OTHER-${other}`],
    );
    await owner.query(
      "insert into public.branch_spreadsheets(id,branch_id,approved,include_branch,allowed_fields) values($1,$2,true,true,array['employee_number','name','branch']||array(select key from public.field_definitions where active and sensitivity='normal' and key not in ('employee_number','name','branch') order by display_order,key limit 47))",
      [book, branch],
    );
    employeeIds = (
      await owner.query(
        "insert into public.employees(name) select 'Synthetic Incremental '||lpad(n::text,5,'0') from generate_series(1,3000) n returning id",
      )
    ).rows.map((r) => r.id);
    await owner.query(
      "insert into public.employee_assignments(employee_id,target_level,branch_id,category,starts_on) select employee,'branch',$2,'primary',$3::date from unnest($1::uuid[]) employee",
      [employeeIds, branch, today],
    );
    const selected = employeeIds.slice(0, 2);
    const delta = await worker("sync_snapshot", {
      id: book,
      employee_ids: selected,
    });
    assert.deepEqual(delta.rows.map((row) => row.id).sort(), selected.sort());
    assert.equal(delta.assignments.length, 2);
    await assert.rejects(
      worker("sync_snapshot", {
        id: book,
        employee_ids: employeeIds.slice(0, 201),
      }),
      /at most 200/,
    );
    const ids = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = await worker("sync_page", { id: book, after: cursor });
      assert(page.rows.length <= 200);
      ids.push(...page.rows.map((row) => row.id));
      cursor = page.next_cursor;
      pages++;
      if (!page.has_more) break;
    } while (pages < 20);
    assert.equal(ids.length, 3000);
    assert.equal(new Set(ids).size, 3000);
    // A transfer out of this roster becomes a delta removal, including assignments.
    await owner.query(
      "update public.employee_assignments set branch_id=$2 where employee_id=$1",
      [selected[0], other],
    );
    const departed = await worker("sync_snapshot", {
      id: book,
      employee_ids: [selected[0]],
    });
    assert.equal(departed.rows.length, 0);
    assert.equal(departed.assignments.length, 0);
    await owner.query(
      "insert into public.sync_outbox(entity_id,action,revision,status,lease_token,lease_until,attempts) values($1,'employee',1,'processing',$2,now()+interval '15 minutes',1)",
      [selected[0], token],
    );
    const guard = {
      id: book,
      token,
      schema_signature: delta.schema_signature,
      row_version: 1,
      full_revision: 1,
    };
    const state = await worker("sync_begin", { ...guard, reset: true });
    assert.equal(state.active, true);
    await worker("sync_checkpoint", {
      ...guard,
      expected_cursor: null,
      cursor: ids[199],
      add_ids: ids.slice(0, 200),
      initialized: true,
    });
    await assert.rejects(
      worker("sync_checkpoint", {
        ...guard,
        expected_cursor: null,
        cursor: ids[399],
      }),
      /progress changed/,
    );
    const resumed = await worker("sync_state", { id: book });
    assert.equal(resumed.cursor, ids[199]);
    assert.equal(resumed.seen_ids.length, 200);
    await owner.query(
      "update public.branch_spreadsheets set approved=false where id=$1",
      [book],
    );
    await assert.rejects(
      worker("sync_checkpoint", { ...guard, expected_cursor: resumed.cursor }),
      /policy changed/,
    );
    await owner.query(
      "update public.branch_spreadsheets set approved=true where id=$1",
      [book],
    );
    await worker("sync_checkpoint", {
      ...guard,
      expected_cursor: resumed.cursor,
      finish: true,
    });
    await worker("sync_done", { ...guard, batch_key: "synthetic-batch" });
    const completedBook = (await worker("workbooks")).find(
      (row) => row.id === book,
    );
    assert.equal(completedBook.completed_batch, "synthetic-batch");
    assert.equal(completedBook.synced_policy_version, 1);
    await worker("defer", { token });
    const deferred = (
      await owner.query(
        "select status,attempts from public.sync_outbox where entity_id=$1 and lease_token is null order by id desc limit 1",
        [selected[0]],
      )
    ).rows[0];
    assert.equal(deferred.status, "pending");
    assert.equal(deferred.attempts, 0);
    await assert.rejects(
      worker("sync_checkpoint", { ...guard, expected_cursor: resumed.cursor }),
      /lease is expired/,
    );
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
      await assert.rejects(
        as(
          id.sa,
          (c) => c.query("select * from app_private.workbook_sync_state"),
          role,
        ),
        { code: "42501" },
      );
    }
    await owner.query(
      "insert into public.sync_outbox(id,entity_id,action,revision,branch_routes) overriding system value values(-1,$1,'employee',1,array[$2]::uuid[])",
      [selected[0], branch],
    );
    const claimed = await worker("claim");
    assert(claimed.events.length <= 200);
    assert(
      claimed.events.some(
        (event) => event.id === selected[0] && event.full === false,
      ),
    );
    await worker("complete", { token: claimed.token });
    console.log(
      `3000 employee IDs projected in ${pages} bounded pages; ${Math.round(performance.now() - started)} ms locally`,
    );
    // Disposable database teardown retains immutable audit records until the run ends.
  });
}
