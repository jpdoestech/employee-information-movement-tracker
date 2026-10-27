import { expect, it } from "vitest";
import { columnPreviewRows } from "../../src/columnPreview";
import { reconcileLayout, defaultFilter, type Field } from "../../src/domain";
const field = (key: string, actions = ["R"]) =>
  ({
    id: key,
    key,
    label: key,
    type: "system",
    active: true,
    list_eligible: true,
    actions,
  }) as Field;
it("uses only authorized metadata for synthetic calculated-column examples", () => {
  const rows = columnPreviewRows(
    [
      field("age"),
      field("length_of_service"),
      field("denied", []),
      { ...field("inactive"), active: false },
    ],
    "2026-03-15",
  );
  expect(rows[0].values).toEqual({
    age: 31,
    length_of_service: "1 year, 2 months",
  });
  expect(rows[1].values).toEqual({
    age: 32,
    length_of_service: "2 years, 2 months",
  });
});
it("keeps editor and table order identical after pinning, reordering or revocation", () => {
  const fields = ["name", "age", "length_of_service"].map((k) => field(k));
  const layout = {
    columns: ["age", "name", "length_of_service"],
    pinned: ["name"],
    filter: defaultFilter,
  };
  const ordered = reconcileLayout(layout, fields);
  expect(ordered.columns).toEqual(["name", "age", "length_of_service"]);
  expect(reconcileLayout(ordered, fields)).toEqual(ordered);
  expect(
    reconcileLayout(
      layout,
      fields.map((f) => (f.key === "name" ? { ...f, actions: [] } : f)),
    ).columns,
  ).toEqual(["age", "length_of_service"]);
});
