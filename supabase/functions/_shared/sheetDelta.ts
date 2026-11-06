import { safeCell, snapshotTabs } from "./sync.ts";

export type SheetIndex = {
  title: string;
  sheetId: number;
  rowCount: number;
  rows: string[][];
  values: Map<number, unknown[]>;
};

// Row positions are resolved from immutable IDs on every run, including after sorting.
export function deltaRequests(
  snapshot: any,
  indexes: SheetIndex[],
  employeeIds: string[],
  keepEmployeeIds?: Set<string>,
) {
  const touched = new Set(employeeIds);
  const requests: any[] = [];
  const next: SheetIndex[] = [];
  for (const [tabIndex, tab] of snapshotTabs(snapshot).slice(0, 3).entries()) {
    const before = indexes[tabIndex];
    const desired = new Map<string, string[]>(
      tab.rows.slice(1).map((row) => [String(row[0]), row.map(safeCell)]),
    );
    const removed: number[] = [];
    const rows: string[][] = [];
    const originalPositions = new Map<string, number>();
    before.rows.forEach((row, offset) => {
      const id = row[0];
      const employee = tabIndex === 0 ? id : row[1];
      if (
        id &&
        (keepEmployeeIds
          ? !keepEmployeeIds.has(employee)
          : touched.has(employee) && !desired.has(id))
      ) {
        removed.push(offset + 1);
      } else {
        rows.push([...row]);
        if (id) originalPositions.set(id, offset + 1);
      }
    });
    // Descending contiguous deletions keep all later positions valid in this batch.
    for (let i = removed.length - 1; i >= 0;) {
      const end = removed[i] + 1;
      let start = removed[i--];
      while (i >= 0 && removed[i] === start - 1) start = removed[i--];
      requests.push({
        deleteDimension: {
          range: {
            sheetId: before.sheetId,
            dimension: "ROWS",
            startIndex: start,
            endIndex: end,
          },
        },
      });
    }
    const positions = new Map(rows.map((row, offset) => [row[0], offset + 1]));
    const updates: { position: number; values: string[] }[] = [];
    const values = new Map<number, unknown[]>();
    for (const [id, row] of desired) {
      let position = positions.get(id);
      const oldPosition = originalPositions.get(id);
      const old =
        oldPosition === undefined ? undefined : before.values.get(oldPosition);
      if (position === undefined) {
        position = rows.length + 1;
        rows.push(row.slice(0, 2));
        positions.set(id, position);
      }
      values.set(position, row);
      const same =
        old &&
        row.every(
          (value, column) =>
            (tabIndex === 0 && column === 5) || value === safeCell(old[column]),
        );
      if (!same) updates.push({ position, values: row });
    }
    const remainingGrid = before.rowCount - removed.length;
    const rowCount = Math.max(remainingGrid, rows.length + 1, 2);
    if (rowCount > remainingGrid)
      requests.push({
        appendDimension: {
          sheetId: before.sheetId,
          dimension: "ROWS",
          length: rowCount - remainingGrid,
        },
      });
    updates.sort((a, b) => a.position - b.position);
    for (let i = 0; i < updates.length;) {
      const start = updates[i].position;
      const group = [updates[i++].values];
      while (i < updates.length && updates[i].position === start + group.length)
        group.push(updates[i++].values);
      requests.push({
        updateCells: {
          range: {
            sheetId: before.sheetId,
            startRowIndex: start,
            endRowIndex: start + group.length,
            startColumnIndex: 0,
            endColumnIndex: tab.rows[0].length,
          },
          rows: group.map((row) => ({
            values: row.map((value) => ({
              userEnteredValue: { stringValue: value },
            })),
          })),
          fields: "userEnteredValue",
        },
      });
    }
    next.push({ ...before, rowCount, rows, values });
  }
  return { requests, indexes: next };
}

export function indexNeedsRepair(indexes: SheetIndex[]) {
  return indexes.some((index) => {
    const seen = new Set<string>();
    return index.rows.some((row) => {
      if (!row[0]) return false;
      if (seen.has(row[0])) return true;
      seen.add(row[0]);
      return false;
    });
  });
}
