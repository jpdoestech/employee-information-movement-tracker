import { describe, it, expect } from "vitest";
import {
  csv,
  defaultFilter,
  literal,
  moveColumn,
  reconcileLayout,
  type Field,
} from "../../src/domain";
import {
  sharingApproved,
  safeCell,
  replacementRequests,
  snapshotTabs,
} from "../../supabase/functions/_shared/sync";
const field = (key: string, actions = ["R"]): Field => ({
  id: key,
  key,
  label: key,
  group_id: "g",
  group_name: "g",
  type: "short_text",
  active: true,
  required: false,
  sensitivity: "normal",
  list_eligible: true,
  scope_mode: "all",
  row_version: 1,
  actions,
});
describe("authorized table views and export", () => {
  it("removes revoked columns without exposing labels", () => {
    expect(
      reconcileLayout(
        {
          columns: ["name", "secret"],
          pinned: ["secret", "name"],
          filter: defaultFilter,
        },
        [field("name"), field("secret", [])],
      ).columns,
    ).toEqual(["name"]);
  });
  it("reorders without changing stored input", () => {
    const a = ["a", "b", "c"];
    expect(moveColumn(a, "b", -1)).toEqual(["b", "a", "c"]);
    expect(a).toEqual(["a", "b", "c"]);
  });
  it("never exports an update-only field", () => {
    const text = csv(
      [
        {
          id: "e",
          row_version: 1,
          values: { name: "Visible", secret: "hidden" },
        },
      ],
      [field("name"), field("secret", ["U"])],
      ["name", "secret"],
    );
    expect(text).toContain("Visible");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("hidden");
  });
  it.each(['=IMPORTXML("bad")', " +cmd", "\t-1", "@formula"])(
    "neutralizes formula prefixes %s",
    (v) => {
      expect(literal(v)).toBe(`'${v}`);
      expect(safeCell(v)).toBe(`'${v}`);
    },
  );
  it("quotes CSV newlines and quotes", () =>
    expect(
      csv(
        [{ id: "e", row_version: 1, values: { name: 'a,"b"\nc' } }],
        [field("name")],
        ["name"],
      ),
    ).toContain('"a,""b""\nc"'));
});
describe("secondary Google projections", () => {
  it("suspends public/domain/group or unapproved sharing", () => {
    expect(sharingApproved([{ role: "reader", type: "anyone" }], [])).toBe(
      false,
    );
    expect(
      sharingApproved(
        [
          {
            role: "writer",
            type: "user",
            emailAddress: "outside@example.invalid",
          },
        ],
        [],
      ),
    ).toBe(false);
    expect(
      sharingApproved(
        [
          { role: "owner", type: "user" },
          {
            role: "reader",
            type: "user",
            emailAddress: "review@example.invalid",
          },
        ],
        ["review@example.invalid"],
      ),
    ).toBe(true);
  });
  it("full replacement retries cannot append duplicates or leave stale rows", () => {
    const snap = {
      fields: [{ key: "name", label: "Renamed" }],
      rows: [
        {
          id: "uuid",
          employee_number: "EMP-1",
          row_version: 2,
          values: { name: "=bad" },
        },
      ],
      assignments: [],
      movements: [],
      revision: 9,
    };
    const tabs = snapshotTabs(snap),
      meta = tabs.map((t, i) => ({
        properties: { title: t.title, sheetId: i },
      }));
    const a = replacementRequests(tabs, meta),
      b = replacementRequests(tabs, meta);
    expect(a).toEqual(b);
    expect(a.some((r: any) => r.appendCells)).toBe(false);
    expect(a.filter((r: any) => r.repeatCell)).toHaveLength(4);
    expect(JSON.stringify(a)).toContain("'=bad");
    expect(JSON.stringify(a)).not.toContain("formulaValue");
    expect(tabs[0].rows[0]).toContain("Renamed [name]");
  });
  it("requires all canonical tabs before writing", () =>
    expect(() =>
      replacementRequests(
        snapshotTabs({
          fields: [],
          rows: [],
          assignments: [],
          movements: [],
          revision: 1,
        }),
        [],
      ),
    ).toThrow("missing"));
});
