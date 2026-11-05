import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeeTable } from "../../src/components/EmployeeTable";
import { ColumnDesigner } from "../../src/components/ColumnDesigner";
import { defaultFilter, reconcileLayout, type Field } from "../../src/domain";

// Canvas font measurement is browser-only; authorization rendering does not
// depend on the measured widths (real dimensions are checked in Playwright).
vi.mock("../../src/tableSizing", () => ({
  contentWidths: (headers: string[]) => headers.map(() => 160),
  useFontMetrics: () => true,
}));

const field = (key: string, overrides: Partial<Field> = {}): Field => ({
  id: key,
  key,
  label: key,
  group_id: "government",
  group_name: "Government IDs",
  type: "short_text",
  active: true,
  required: false,
  sensitivity: "restricted",
  list_eligible: true,
  scope_mode: "all",
  row_version: 1,
  actions: ["R"],
  validation: { government_id_digits: 9 },
  ...overrides,
});
const layout = {
  columns: ["bir_tin", "bir_tin", "denied", "inactive", "profile_only"],
  pinned: ["denied", "bir_tin", "bir_tin"],
  filter: defaultFilter,
};
const fields = [
  field("bir_tin"),
  field("denied", { actions: ["U"] }),
  field("inactive", { active: false }),
  field("profile_only", { list_eligible: false }),
];
const rows = [
  {
    id: "e",
    row_version: 1,
    values: {
      bir_tin: "012345678",
      denied: "DO_NOT_RENDER",
      inactive: "INACTIVE_VALUE",
      profile_only: "PROFILE_ONLY_VALUE",
    },
  },
];
it("reconciles stale, duplicated and revoked column settings without granting ID access", () => {
  expect(reconcileLayout(layout, fields)).toMatchObject({
    columns: ["bir_tin"],
    pinned: ["bir_tin"],
  });
  expect(
    reconcileLayout(
      layout,
      fields.map((f) => ({ ...f, actions: ["U"] })),
    ),
  ).toMatchObject({ columns: [], pinned: [] });
});
it("register excludes unauthorized values and the column designer contains no employee data", () => {
  expect(
    renderToStaticMarkup(
      <EmployeeTable rows={rows} fields={fields} layout={layout} />,
    ),
  ).toContain("012-345-678");
  for (const html of [
    renderToStaticMarkup(
      <EmployeeTable rows={rows} fields={fields} layout={layout} />,
    ),
    renderToStaticMarkup(
      <ColumnDesigner
        fields={fields}
        layout={layout}
        rowNumbersAllowed={true}
        onClose={() => {}}
        onApply={async () => {}}
      />,
    ),
  ]) {
    for (const forbidden of [
      "DO_NOT_RENDER",
      "INACTIVE_VALUE",
      "PROFILE_ONLY_VALUE",
      "Move denied",
      "Move inactive",
      "Move profile_only",
    ])
      expect(html).not.toContain(forbidden);
  }
  const revoked = renderToStaticMarkup(
    <ColumnDesigner
      fields={fields.map((f) => ({ ...f, actions: ["U"] }))}
      layout={layout}
      rowNumbersAllowed={true}
      onClose={() => {}}
      onApply={async () => {}}
    />,
  );
  expect(revoked).not.toContain("Government ID columns");
  expect(revoked).not.toContain("012-345-678");
});
