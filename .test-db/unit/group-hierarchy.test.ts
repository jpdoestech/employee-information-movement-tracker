import { it, expect } from "vitest";
import { employeeTabs } from "../../src/employeeForm";
import type { Context, Field } from "../../src/domain";
it("places authorized fields under their configured parent without changing access membership", () => {
  const groups: Context["groups"] = [
    {
      id: "personal",
      name: "Personal Information",
      active: true,
      row_version: 1,
    },
    {
      id: "emergency",
      name: "Emergency Information",
      parent_group_id: "personal",
      active: true,
      row_version: 1,
    },
    {
      id: "employment",
      name: "Employment Details",
      active: true,
      row_version: 1,
    },
    {
      id: "compensation",
      name: "Compensation",
      parent_group_id: "employment",
      active: true,
      row_version: 1,
    },
  ];
  const fields = [
    {
      key: "first_name",
      group_id: "original",
      form_group_id: "personal",
      active: true,
      actions: ["R"],
    },
    {
      key: "emergency_contact_name",
      group_id: "address",
      form_group_id: "emergency",
      active: true,
      actions: ["R"],
    },
    { key: "rate", group_id: "compensation", active: true, actions: [] },
  ] as Field[];
  expect(employeeTabs(groups, fields)).toEqual([
    {
      name: "Personal Information",
      order: 0,
      groups: ["emergency", "personal"],
    },
  ]);
  expect(fields[1].group_id).toBe("address");
  groups[0].name = "Renamed parent";
  expect(employeeTabs(groups, fields)[0].name).toBe("Renamed parent");
  groups[0].active = false;
  expect(employeeTabs(groups, fields)).toEqual([]);
});
