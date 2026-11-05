import { expect, it } from "vitest";
import {
  deltaRequests,
  type SheetIndex,
} from "../../supabase/functions/_shared/sheetDelta";
import { snapshotTabs } from "../../supabase/functions/_shared/sync";
import { syncWorkbook } from "../../supabase/functions/_shared/syncWorkbook";

const employee = (id: string, name = id) => ({
  id,
  employee_number: id,
  branch_code: "SYN",
  row_version: 1,
  updated_at: "2026-10-28",
  sync_time: "synthetic-time",
  active_current: true,
  values: { name },
});
const snapshot = (rows: any[] = []) => ({
  fields: [{ key: "name", label: "Employee Name" }],
  rows,
  assignments: [] as any[],
  movements: [] as any[],
  revision: 1,
  schema_signature: "schema",
});
function indexes(data: any): SheetIndex[] {
  return snapshotTabs(data)
    .slice(0, 3)
    .map((tab, index) => ({
      title: tab.title,
      sheetId: index,
      rowCount: Math.max(100, tab.rows.length),
      rows: tab.rows.slice(1).map((row) => row.slice(0, 2).map(String)),
      values: new Map(tab.rows.slice(1).map((row, index) => [index + 1, row])),
    }));
}
it("changes one employee out of 3,000 without clearing or rewriting other rows", () => {
  const all = snapshot(
    Array.from({ length: 3000 }, (_, i) =>
      employee(`employee-${String(i).padStart(5, "0")}`),
    ),
  );
  all.fields.push(
    ...Array.from({ length: 49 }, (_, i) => ({
      key: `field_${i}`,
      label: `Column ${i}`,
    })),
  );
  for (const row of all.rows)
    for (let i = 0; i < 49; i++)
      row.values[`field_${i}`] = `Synthetic value ${i}`;
  const current = indexes(all);
  const id = all.rows[1742].id;
  const change = {
    ...snapshot([
      {
        ...all.rows[1742],
        values: { ...all.rows[1742].values, name: "Edited" },
      },
    ]),
    fields: all.fields,
  };
  const plan = deltaRequests(change, current, [id]);
  expect(plan.requests).toHaveLength(1);
  expect(plan.requests[0].updateCells.range.startRowIndex).toBe(1743);
  expect(plan.requests[0].updateCells.rows).toHaveLength(1);
  expect(plan.indexes[0].rows).toHaveLength(3000);
  expect(plan.requests.some((r) => r.repeatCell || r.deleteDimension)).toBe(
    false,
  );
  const retry = deltaRequests(
    { ...change, rows: [{ ...change.rows[0], sync_time: "new-time" }] },
    plan.indexes,
    [id],
  );
  expect(retry.requests).toEqual([]);
});
it("matches sorted rows by ID and removes departed employee, assignment and movement rows", () => {
  const old = snapshot([employee("a"), employee("b"), employee("c")]);
  old.assignments = [
    { id: "assignment", employee_id: "b", category: "primary" },
  ];
  old.movements = [{ id: "movement", employee_id: "b", type: "transfer" }];
  const current = indexes(old);
  current[0].rows.reverse();
  current[0].values.clear();
  const next = snapshot([employee("a", "Edited")]);
  const plan = deltaRequests(next, current, ["a", "b"]);
  expect(plan.indexes[0].rows.map((r) => r[0])).toEqual(["c", "a"]);
  expect(plan.indexes[1].rows).toEqual([]);
  expect(plan.indexes[2].rows).toEqual([]);
  expect(plan.requests.filter((r) => r.deleteDimension)).toHaveLength(3);
  expect(
    plan.requests.find((r) => r.updateCells)?.updateCells.range.startRowIndex,
  ).toBe(2);
});
it("an interrupted append is retried without duplicate employee rows", () => {
  const next = snapshot([employee("new")]);
  const first = deltaRequests(next, indexes(snapshot()), ["new"]);
  expect(first.indexes[0].rows).toHaveLength(1);
  expect(deltaRequests(next, first.indexes, ["new"]).requests).toEqual([]);
});

// Execute actual orchestration against a small in-memory Google transport.
function runtime(count: number) {
  const employees = Array.from({ length: count }, (_, i) =>
    employee(`employee-${String(i + 1).padStart(5, "0")}`),
  );
  const blank = snapshot();
  const tabs = snapshotTabs(blank);
  const sheets = tabs.map((tab, sheetId) => ({
    properties: {
      title: tab.title,
      sheetId,
      gridProperties: { rowCount: 100, columnCount: 26 },
    },
  }));
  const cells = tabs.map((tab) => [tab.rows[0].map(String)]);
  const book = { id: "book", branch_id: "branch", row_version: 1 };
  const job: any = {
    token: "lease",
    revision: 1,
    events: [
      { full: true, revision: 1, action: "reconcile", branches: ["branch"] },
    ],
  };
  let state: any = null;
  let loseResponseAfter = 0;
  let rejectGuard = false;
  const projections: number[] = [];
  const writes: any[] = [];
  const rpc = async (op: string, p: any = {}) => {
    if (op === "sync_snapshot") {
      const rows = employees.filter((e) => p.employee_ids.includes(e.id));
      projections.push(rows.length);
      return snapshot(rows);
    }
    if (op === "sync_page") {
      const rows = employees
        .filter((e) => !p.after || e.id > p.after)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 200);
      projections.push(rows.length);
      return {
        ...snapshot(rows),
        next_cursor: rows.at(-1)?.id,
        has_more: rows.length === 200,
      };
    }
    if (op === "sync_state") return state;
    if (op === "sync_begin")
      return (state = {
        schema_signature: "schema",
        policy_version: 1,
        full_revision: p.full_revision,
        reset_pending: p.reset,
        active: true,
        cursor: null,
        seen_ids: [],
      });
    if (op === "sync_checkpoint") {
      expect(p.expected_cursor).toBe(state.cursor);
      state = {
        ...state,
        active: !p.finish,
        reset_pending: p.initialized ? false : state.reset_pending,
        cursor: p.cursor ?? state.cursor,
        seen_ids: [
          ...new Set([...state.seen_ids, ...(p.add_ids || [])]),
        ].filter((id) => !(p.remove_ids || []).includes(id)),
      };
      return state;
    }
    if (op === "publish_guard" && rejectGuard) throw Error("Changed policy");
    return {};
  };
  const request = async (url: string, _token: string, init: any = {}) => {
    if (url.includes("/values:batchGet?"))
      return {
        valueRanges: tabs
          .slice(0, 3)
          .flatMap((_, i) => [
            { values: [cells[i][0]] },
            { values: cells[i].slice(1).map((row) => row.slice(0, 2)) },
          ]),
      };
    if (url.includes("/values:batchGetByDataFilter"))
      return {
        valueRanges: JSON.parse(init.body).dataFilters.map((filter: any) => ({
          dataFilters: [filter],
          valueRange: {
            values: [
              cells[filter.gridRange.sheetId][filter.gridRange.startRowIndex] ||
                [],
            ],
          },
        })),
      };
    if (url.endsWith(":batchUpdate")) {
      const requests = JSON.parse(init.body).requests;
      writes.push(...requests);
      for (const r of requests) {
        if (r.updateSheetProperties)
          Object.assign(
            sheets[r.updateSheetProperties.properties.sheetId].properties
              .gridProperties,
            r.updateSheetProperties.properties.gridProperties,
          );
        if (r.repeatCell) cells[r.repeatCell.range.sheetId] = [];
        if (r.deleteDimension) {
          const d = r.deleteDimension.range;
          cells[d.sheetId].splice(d.startIndex, d.endIndex - d.startIndex);
          sheets[d.sheetId].properties.gridProperties.rowCount -=
            d.endIndex - d.startIndex;
        }
        if (r.appendDimension)
          sheets[
            r.appendDimension.sheetId
          ].properties.gridProperties.rowCount += r.appendDimension.length;
        if (r.updateCells) {
          const u = r.updateCells;
          const grid = u.range || u.start;
          u.rows.forEach((row: any, offset: number) => {
            const at = (grid.startRowIndex ?? grid.rowIndex) + offset;
            expect(at).toBeLessThan(
              sheets[grid.sheetId].properties.gridProperties.rowCount,
            );
            cells[grid.sheetId][at] = row.values.map(
              (v: any) => v.userEnteredValue?.stringValue || "",
            );
          });
        }
      }
      if (loseResponseAfter > 0 && --loseResponseAfter === 0) {
        throw Error("Response lost after commit");
      }
      return {};
    }
    throw Error(`Unexpected synthetic Google request ${url}`);
  };
  return {
    employees,
    cells,
    writes,
    projections,
    book,
    job,
    loseResponse: (after = 1) => {
      loseResponseAfter = after;
    },
    rejectGuard: () => {
      rejectGuard = true;
    },
    run: () =>
      syncWorkbook(
        book,
        job,
        "sheet",
        "ephemeral",
        { sheets },
        rpc,
        async () => {},
        Date.now() + 110000,
        request,
      ),
  };
}
it("rebuilds 3,000 records in bounded resumable pages and preserves edits behind its cursor", async () => {
  const r = runtime(3000);
  expect((await r.run()).pending).toBe(true);
  r.employees[0].values.name = "Edited while rebuilding";
  r.employees.push(employee("employee-00000", "New before cursor"));
  r.job.events.push(
    { id: r.employees[0].id, full: false, revision: 2, branches: ["branch"] },
    { id: "employee-00000", full: false, revision: 2, branches: ["branch"] },
  );
  r.job.revision = 2;
  let attempts = 1;
  while ((await r.run()).pending) {
    expect(++attempts).toBeLessThan(10);
  }
  expect(r.cells[0].slice(1).filter((row) => row[0])).toHaveLength(3001);
  expect(r.cells[0].find((row) => row[0] === r.employees[0].id)?.at(-1)).toBe(
    "Edited while rebuilding",
  );
  expect(r.cells[0].some((row) => row[0] === "employee-00000")).toBe(true);
  expect(Math.max(...r.projections)).toBeLessThanOrEqual(200);
});
it("resumes after a Google write succeeds but its response is lost", async () => {
  const r = runtime(3);
  r.loseResponse(2);
  await expect(r.run()).rejects.toThrow("Response lost");
  expect((await r.run()).pending).toBe(false);
  expect(r.cells[0].slice(1).filter((row) => row[0])).toHaveLength(3);
});
it("checks current publication approval before every Google write", async () => {
  const r = runtime(3);
  r.rejectGuard();
  await expect(r.run()).rejects.toThrow("Changed policy");
  expect(r.writes).toEqual([]);
});
it("applies a delayed older event from the latest canonical values even after a higher revision", async () => {
  const r = runtime(2);
  await r.run();
  r.book.last_synced_revision = 99;
  r.employees[0].values.name = "Latest canonical edit";
  r.job.events = [
    { id: r.employees[0].id, full: false, revision: 1, branches: ["branch"] },
  ];
  const before = r.writes.length;
  await r.run();
  expect(r.cells[0].find((row) => row[0] === r.employees[0].id)?.at(-1)).toBe(
    "Latest canonical edit",
  );
  expect(r.writes.slice(before).some((write) => write.repeatCell)).toBe(false);
});
