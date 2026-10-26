import { expect, it } from "vitest";
import { defaultFilter, type Field, type RegisterView } from "../../src/domain";
import {
  applyRegisterView,
  managedDefaultColumns,
  managedRegisterView,
} from "../../src/registerViews";
const config = {
  columns: ["name", "salary"],
  pinned: ["name"],
  showRowNumbers: true,
};
const rule = (
  id: string,
  user_id: string | null,
  scope_type: RegisterView["scope_type"],
  scope_id: string | null,
): RegisterView => ({ id, name: id, user_id, scope_type, scope_id, config });
const rules = [
  rule("global", null, "all", null),
  rule("account", "u", "all", null),
  rule("branch", null, "branch", "b"),
  rule("client", null, "client", "c"),
  rule("account-client", "u", "client", "c"),
];
const options = [
  { id: "b", kind: "branch", label: "B" },
  { id: "c", kind: "client", branch_id: "b", label: "C" },
];
it("selects location specificity before account specificity, without another user's rules", () => {
  expect(managedRegisterView(rules, "u", defaultFilter, options)?.id).toBe(
    "account",
  );
  expect(managedRegisterView(rules, "other", defaultFilter, options)?.id).toBe(
    "global",
  );
  expect(
    managedRegisterView(
      rules,
      "u",
      { ...defaultFilter, branches: ["b"] },
      options,
    )?.id,
  ).toBe("branch");
  expect(
    managedRegisterView(
      rules,
      "u",
      { ...defaultFilter, clients: ["c"] },
      options,
    )?.id,
  ).toBe("account-client");
  expect(
    managedRegisterView(
      rules,
      "other",
      { ...defaultFilter, quick: { kind: "client", id: "c" } },
      options,
    )?.id,
  ).toBe("client");
  expect(
    managedRegisterView(
      rules.filter((r) => !r.id.includes("client")),
      "u",
      { ...defaultFilter, clients: ["c"] },
      options,
    )?.id,
  ).toBe("branch");
});
it("uses broad defaults for mixed locations and supports head office", () => {
  expect(
    managedRegisterView(
      rules,
      "u",
      { ...defaultFilter, clients: ["c", "other"] },
      options,
    )?.id,
  ).toBe("account");
  expect(
    managedRegisterView(
      rules,
      "u",
      { ...defaultFilter, branches: ["b", "other"] },
      options,
    )?.id,
  ).toBe("account");
  expect(
    managedRegisterView(
      [...rules, rule("ho", null, "head_office", null)],
      "u",
      { ...defaultFilter, quick: { kind: "head_office", id: "head_office" } },
      options,
    )?.id,
  ).toBe("ho");
});
it("preserves filters/personal views and removes unreadable or inactive columns", () => {
  const layout = {
    columns: ["name"],
    pinned: [],
    filter: { ...defaultFilter, search: "find me" },
    showRowNumbers: false,
  };
  const fields = [
    { key: "name", active: true, list_eligible: true, actions: ["R"] },
    { key: "salary", active: true, list_eligible: true, actions: [] },
  ] as Field[];
  const effective = applyRegisterView(layout, rules[0], fields);
  expect(effective.columns).toEqual(["name"]);
  expect(effective.showRowNumbers).toBe(true);
  expect(effective.filter).toBe(layout.filter);
  expect(layout.showRowNumbers).toBe(false);
  expect(applyRegisterView(layout, undefined, fields)).toEqual(layout);
  expect(managedDefaultColumns).toEqual([
    "employee_number",
    "name",
    "employee_category",
    "client_employee_number",
    "status",
    "position",
    "branch",
    "client",
    "date_hired",
    "gender",
  ]);
});
