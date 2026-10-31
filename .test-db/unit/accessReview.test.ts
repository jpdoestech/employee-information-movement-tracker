import { expect, it } from "vitest";
import {
  accessPresets,
  grantStatus,
  permissionExplanation,
  scopeLabel,
} from "../../src/accessReview";

it("presets separate Head Office, all scopes, branches and explicit clients without clear-value permission", () => {
  expect(accessPresets.find((p) => p.id === "head_office")?.kind).toBe(
    "head_office",
  );
  expect(accessPresets.find((p) => p.id === "company")?.kind).toBe("all");
  expect(accessPresets.find((p) => p.id === "branch")?.descendants).toBe(false);
  expect(
    accessPresets.find((p) => p.id === "branch_clients")?.descendants,
  ).toBe(true);
  expect(accessPresets.find((p) => p.id === "client")?.actions).toEqual(["R"]);
  expect(accessPresets.every((p) => !p.actions.includes("D"))).toBe(true);
});
it("grant status respects exclusive end dates and inactive scheduled grants", () => {
  expect(
    grantStatus(
      { starts_on: "2026-10-21", ends_on: "2026-10-22" },
      "2026-10-22",
    ),
  ).toBe("Expired");
  expect(grantStatus({ starts_on: "2026-10-23" }, "2026-10-22")).toBe(
    "Scheduled",
  );
  expect(grantStatus({ starts_on: "2026-10-21" }, "2026-10-22")).toBe("Active");
  expect(
    grantStatus({ active: false, starts_on: "2026-10-23" }, "2026-10-22"),
  ).toBe("Inactive");
});
it("scope summaries distinguish branch-only, clients and unavailable identifiers", () => {
  const branch = { scope_type: "branch", scope_id: "b" };
  expect(scopeLabel(branch, [{ id: "b", label: "North" }])).toBe(
    "North · branch only",
  );
  expect(
    scopeLabel({ ...branch, include_descendants: true }, [
      { id: "b", label: "North" },
    ]),
  ).toContain("including branch clients");
  expect(scopeLabel({ scope_type: "head_office" }, [])).toBe("Head Office");
  expect(scopeLabel({ scope_type: "client", scope_id: "missing" }, [])).toBe(
    "missing",
  );
});
it("denial explanations distinguish inactive accounts, viewers and scope without changing decisions", () => {
  const policy = {
    decisions: {
      U: { reason: "Organization action denied or inactive account" },
    },
  };
  expect(
    permissionExplanation(policy, "U", { active: false, role: "admin" }),
  ).toBe("Account is inactive.");
  expect(
    permissionExplanation(policy, "U", { active: true, role: "viewer" }),
  ).toContain("Viewer accounts");
  expect(
    permissionExplanation(policy, "U", { active: true, role: "admin" }),
  ).toContain("No active scope grant");
  expect(
    permissionExplanation(
      { decisions: { R: { reason: "Direct field deny" } } },
      "R",
    ),
  ).toBe("Direct field deny");
});
