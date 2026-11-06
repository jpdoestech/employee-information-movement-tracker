import { google } from "./google.ts";
import { replacementRequests, snapshotTabs, safeCell } from "./sync.ts";
import {
  deltaRequests,
  indexNeedsRepair,
  type SheetIndex,
} from "./sheetDelta.ts";

type Rpc = (operation: string, p?: any) => Promise<any>;

export async function syncWorkbook(
  book: any,
  job: any,
  sheet: string,
  token: string,
  meta: any,
  rpc: Rpc,
  fence: () => Promise<void>,
  deadline: number,
  request: typeof google = google,
  beforeWrite: () => Promise<void> = fence,
) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheet}`;
  const events = (job.events || []).filter((event: any) =>
    book.branch_id
      ? event.branches.includes(book.branch_id)
      : event.head_office,
  );
  const ids = [
    ...new Set<string>(
      events.filter((event: any) => !event.full).map((event: any) => event.id),
    ),
  ];
  const fullEvents = events.filter((event: any) => event.full);
  const fullRevision = Math.max(
    0,
    ...fullEvents.map((event: any) => Number(event.revision)),
  );
  const snapshot = await rpc("sync_snapshot", {
    id: book.id,
    employee_ids: ids,
  });
  const guard = {
    id: book.id,
    token: job.token,
    schema_signature: snapshot.schema_signature,
    row_version: book.row_version,
  };
  let state = await rpc("sync_state", { id: book.id });
  const tabs = snapshotTabs(snapshot);
  const ranges = tabs
    .slice(0, 3)
    .flatMap((tab) => [`${tab.title}!1:1`, `${tab.title}!A2:B`]);
  const remote = await request(
    `${base}/values:batchGet?${ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&")}`,
    token,
  );
  if (remote.valueRanges?.length !== 6)
    throw new Error("Managed workbook indexes are unavailable");
  let indexes: SheetIndex[] = tabs.slice(0, 3).map((tab, index) => {
    const properties = meta.sheets.find(
      (s: any) => s.properties.title === tab.title,
    ).properties;
    return {
      title: tab.title,
      sheetId: properties.sheetId,
      rowCount: properties.gridProperties?.rowCount || 100,
      rows: (remote.valueRanges[index * 2 + 1].values || []).map(
        (row: unknown[]) => row.map(safeCell),
      ),
      values: new Map(),
    };
  });
  const headerMismatch = tabs
    .slice(0, 3)
    .some(
      (tab, index) =>
        JSON.stringify(tab.rows[0].map(safeCell)) !==
        JSON.stringify(
          (remote.valueRanges[index * 2].values?.[0] || []).map(safeCell),
        ),
    );
  const schemaChanged =
    !state ||
    state.schema_signature !== snapshot.schema_signature ||
    Number(state.policy_version) !== Number(book.row_version);
  const newerFull = fullRevision > Number(state?.full_revision || 0);
  const reset =
    schemaChanged ||
    headerMismatch ||
    indexNeedsRepair(indexes) ||
    (newerFull &&
      fullEvents.some(
        (event: any) => event.action !== "calendar_reconciliation",
      ));
  if (
    schemaChanged ||
    headerMismatch ||
    indexNeedsRepair(indexes) ||
    newerFull
  ) {
    state = await rpc("sync_begin", {
      ...guard,
      full_revision: Math.max(fullRevision, Number(job.revision)),
      reset,
    });
  }
  if (
    !state?.active &&
    !ids.length &&
    Number(book.last_synced_revision) >= Number(job.revision)
  )
    return { pending: false, unchanged: true, guard };
  async function checkpoint(p: any) {
    state = await rpc("sync_checkpoint", {
      ...guard,
      full_revision: state.full_revision,
      expected_cursor: state.cursor,
      ...p,
    });
  }
  async function write(requests: any[]) {
    if (!requests.length) return;
    const body = JSON.stringify({ requests });
    // Bound parsing/serialization work and remain below Google's recommended 2 MB payload.
    if (new TextEncoder().encode(body).length > 1_800_000)
      throw new Error("Sync batch exceeds bounded payload size");
    await beforeWrite();
    await rpc("publish_guard", guard);
    await request(`${base}:batchUpdate`, token, { method: "POST", body });
  }
  if (state?.active && state.reset_pending) {
    const empty = { ...snapshot, rows: [], assignments: [], movements: [] };
    const initialTabs = snapshotTabs(empty);
    initialTabs[3].rows[1][3] =
      "Rebuild in progress; current rows are incomplete until synchronization finishes";
    await write(replacementRequests(initialTabs, meta.sheets));
    indexes = indexes.map((index) => ({
      ...index,
      rows: [],
      rowCount: 100,
      values: new Map(),
    }));
    await checkpoint({ initialized: true });
  }
  const metadata = snapshotTabs({
    ...snapshot,
    revision: Math.max(
      Number(book.last_synced_revision || 0),
      Number(job.revision),
    ),
  })[3];
  const metadataId = meta.sheets.find(
    (s: any) => s.properties.title === metadata.title,
  ).properties.sheetId;
  const metadataRequest = {
    updateCells: {
      start: { sheetId: metadataId, rowIndex: 0, columnIndex: 0 },
      rows: metadata.rows.map((row) => ({
        values: row.map((value: unknown) => ({
          userEnteredValue: { stringValue: safeCell(value) },
        })),
      })),
      fields: "userEnteredValue",
    },
  };
  let metadataWritten = false;
  async function apply(data: any, touched: string[]) {
    if (data.schema_signature !== guard.schema_signature)
      throw new Error("Snapshot schema changed during sync");
    const touchedSet = new Set(touched);
    const dataFilters = indexes.flatMap((index, n) =>
      index.rows.flatMap((row, offset) =>
        touchedSet.has(n === 0 ? row[0] : row[1])
          ? [
              {
                gridRange: {
                  sheetId: index.sheetId,
                  startRowIndex: offset + 1,
                  endRowIndex: offset + 2,
                  startColumnIndex: 0,
                  endColumnIndex: tabs[n].rows[0].length,
                },
              },
            ]
          : [],
      ),
    );
    if (dataFilters.length) {
      const current = await request(
        `${base}/values:batchGetByDataFilter`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            dataFilters,
            valueRenderOption: "UNFORMATTED_VALUE",
            majorDimension: "ROWS",
          }),
        },
      );
      for (const match of current.valueRanges || []) {
        for (const filter of match.dataFilters || []) {
          const range = filter.gridRange;
          if (range)
            indexes
              .find((index) => index.sheetId === range.sheetId)
              ?.values.set(
                range.startRowIndex,
                match.valueRange.values?.[0] || [],
              );
        }
      }
    }
    const plan = deltaRequests(data, indexes, touched);
    if (!state?.active) plan.requests.push(metadataRequest);
    await write(plan.requests);
    if (!state?.active) metadataWritten = true;
    indexes = plan.indexes;
    if (state?.active)
      await checkpoint({
        add_ids: data.rows.map((row: any) => row.id),
        remove_ids: touched.filter(
          (id) => !data.rows.some((row: any) => row.id === id),
        ),
      });
  }
  // Changes claimed while a rebuild is resuming must not be lost behind its cursor.
  if (ids.length) await apply(snapshot, ids);
  for (
    let page = 0;
    state?.active && page < 4 && Date.now() < deadline - 25000;
    page++
  ) {
    await fence();
    const data = await rpc("sync_page", { id: book.id, after: state.cursor });
    await apply(
      data,
      data.rows.map((row: any) => row.id),
    );
    await checkpoint({ cursor: data.next_cursor || state.cursor });
    if (!data.has_more) {
      const plan = deltaRequests(
        { ...snapshot, rows: [], assignments: [], movements: [] },
        indexes,
        [],
        new Set(state.seen_ids),
      );
      await write(plan.requests);
      indexes = plan.indexes;
      await checkpoint({ finish: true });
    }
  }
  if (state?.active) return { pending: true, guard };
  if (!metadataWritten) await write([metadataRequest]);
  return { pending: false, guard };
}
