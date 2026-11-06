import { describe, expect, it } from "vitest";
import {
  combinedName,
  employeeTabs,
  fieldGroupPath,
  orderedFieldGroups,
} from "../../src/employeeForm";
import type { Context, Field } from "../../src/domain";
describe("employee names and form tabs", () => {
  it("uses the same parent path and group order without changing source IDs or permissions", () => {
    const groups = [
      {
        id: "compensation",
        name: "Compensation",
        parent_group_id: "employment",
        display_order: 50,
        active: true,
        row_version: 1,
      },
      {
        id: "personal",
        name: "Personal Information",
        tab_order: 0,
        active: true,
        row_version: 1,
      },
      {
        id: "employment",
        name: "Employment Details",
        tab_order: 10,
        active: true,
        row_version: 1,
      },
    ];
    const before = structuredClone(groups);
    expect(fieldGroupPath(groups, "compensation")).toBe(
      "Employment Details / Compensation",
    );
    expect(fieldGroupPath(groups, "employment")).toBe("Employment Details");
    expect(fieldGroupPath(groups, "missing")).toBe("Group");
    expect(orderedFieldGroups(groups).map((g) => g.id)).toEqual([
      "personal",
      "employment",
      "compensation",
    ]);
    expect(groups).toEqual(before);
  });
  it("keeps default sections before custom tabs even with earlier custom ordering", () => {
    const groups = [
      { id: "custom", name: "Extra", tab_order: 0 },
      { id: "address", name: "Address", tab_order: 20 },
      { id: "ids", name: "Government ID", tab_order: 10 },
      { id: "profile", name: "Profile", tab_order: 0 },
    ].map((g) => ({ ...g, active: true, row_version: 1 }));
    const fields = groups.map(
      (g) =>
        ({
          group_id: g.id,
          key: `custom_${g.id}`,
          active: true,
          actions: ["R"],
        }) as Field,
    );
    expect(employeeTabs(groups, fields).map((t) => t.name)).toEqual([
      "Profile",
      "Government ID",
      "Address",
      "Extra",
    ]);
    fields[3].key = "first_name";
    groups[3].name = "Personal details";
    expect(employeeTabs(groups, fields)[0].name).toBe("Personal details");
  });
  it("formats separate names without empty optional parts", () => {
    expect(
      combinedName({
        last_name: " Cruz ",
        first_name: " Ana ",
        middle_name: " Maria ",
        suffix: " Jr. ",
      }),
    ).toBe("Cruz, Ana Maria Jr.");
    expect(
      combinedName({ last_name: "Cruz", first_name: "Ana", middle_name: null }),
    ).toBe("Cruz, Ana");
  });
  it("merges groups without changing permission membership and orders tabs", () => {
    const groups: Context["groups"] = [
      {
        id: "a",
        name: "Identity",
        active: true,
        row_version: 1,
        tab_name: "Profile",
        tab_order: 0,
      },
      {
        id: "b",
        name: "Contact",
        active: true,
        row_version: 1,
        tab_name: "Profile",
        tab_order: 0,
      },
      { id: "c", name: "Address", active: true, row_version: 1, tab_order: 20 },
      { id: "d", name: "Restricted", active: true, row_version: 1 },
      { id: "e", name: "Inactive", active: false, row_version: 1 },
    ];
    const fields = ["a", "b", "c", "d", "e"].map(
      (group_id) =>
        ({
          group_id,
          active: true,
          actions: group_id === "d" ? [] : ["R"],
        }) as Field,
    );
    expect(employeeTabs(groups, fields)).toEqual([
      { name: "Profile", order: 0, groups: ["a", "b"] },
      { name: "Address", order: 20, groups: ["c"] },
    ]);
  });
});
