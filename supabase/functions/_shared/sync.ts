export function safeCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /^\s*[=+\-@]/.test(s) ? `'${s}` : s;
}
export function sharingApproved(permissions: any[], approvedEmails: string[]) {
  const emails = new Set(approvedEmails.map((e) => e.toLowerCase()));
  return permissions.every(
    (p) =>
      p.role === "owner" ||
      (p.type === "user" &&
        p.emailAddress &&
        emails.has(p.emailAddress.toLowerCase())),
  );
}
export function snapshotTabs(snapshot: any) {
  const columns = snapshot.fields.map((f: any) => f.key);
  return [
    {
      title: "Employees_Current",
      rows: [
        [
          "employee_uuid",
          "employee_number",
          "branch_code",
          "source_version",
          "source_modified",
          "sync_time",
          "active_current",
          ...columns.map(
            (key: string) =>
              `${snapshot.fields.find((f: any) => f.key === key).label} [${key}]`,
          ),
        ],
        ...snapshot.rows.map((r: any) => [
          r.id,
          r.employee_number,
          r.branch_code,
          r.row_version,
          r.updated_at,
          r.sync_time,
          r.active_current,
          ...columns.map((key: string) => r.values[key]),
        ]),
      ],
    },
    {
      title: "Assignments_Current",
      rows: [
        [
          "assignment_uuid",
          "employee_uuid",
          "category",
          "starts_on",
          "ends_on",
          "client_uuid",
          "source_version",
        ],
        ...snapshot.assignments.map((a: any) => [
          a.id,
          a.employee_id,
          a.category,
          a.starts_on,
          a.ends_on,
          a.client_id,
          a.source_version,
        ]),
      ],
    },
    {
      title: "Movement_History",
      rows: [
        ["movement_uuid", "employee_uuid", "type", "effective_on", "voided"],
        ...snapshot.movements.map((m: any) => [
          m.id,
          m.employee_id,
          m.type,
          m.effective_on,
          m.voided,
        ]),
      ],
    },
    {
      title: "Sync_Metadata",
      rows: [
        ["canonical_source", "revision", "sync_time", "membership_policy"],
        [
          "Supabase",
          snapshot.revision,
          new Date().toISOString(),
          "Effective primary only; rows removed when no longer in approved roster",
        ],
      ],
    },
  ];
}
export function replacementRequests(
  tabs: ReturnType<typeof snapshotTabs>,
  sheets: any[],
) {
  return tabs.flatMap((tab) => {
    const s = sheets.find((s) => s.properties.title === tab.title);
    if (!s) throw new Error("Workbook tabs are missing; reconnect or rebuild");
    const rows = tab.rows.map((row) => ({
      values: row.map((v: unknown) => ({
        userEnteredValue: { stringValue: safeCell(v) },
      })),
    }));
    return [
      {
        updateSheetProperties: {
          properties: {
            sheetId: s.properties.sheetId,
            gridProperties: {
              rowCount: Math.max(rows.length, 100),
              columnCount: Math.max(tab.rows[0].length, 26),
              frozenRowCount: 1,
              hidden: undefined,
            },
          },
          fields:
            "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount",
        },
      },
      {
        repeatCell: {
          range: { sheetId: s.properties.sheetId },
          cell: {},
          fields: "userEnteredValue",
        },
      },
      {
        updateCells: {
          start: { sheetId: s.properties.sheetId, rowIndex: 0, columnIndex: 0 },
          rows,
          fields: "userEnteredValue",
        },
      },
    ];
  });
}
