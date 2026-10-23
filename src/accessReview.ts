import type { Option } from "./domain";

export const accessPresets = [
  {
    id: "head_office",
    label: "Head Office editor",
    kind: "head_office",
    actions: ["C", "R", "U"],
    descendants: false,
  },
  {
    id: "company",
    label: "Company-wide HR editor",
    kind: "all",
    actions: ["C", "R", "U"],
    descendants: false,
  },
  {
    id: "branch",
    label: "Branch editor",
    kind: "branch",
    actions: ["C", "R", "U"],
    descendants: false,
  },
  {
    id: "branch_clients",
    label: "Branch and clients editor",
    kind: "branch",
    actions: ["C", "R", "U"],
    descendants: true,
  },
  {
    id: "client",
    label: "Client viewer",
    kind: "client",
    actions: ["R"],
    descendants: false,
  },
];

export function scopeLabel(
  policy: {
    scope_type: string;
    scope_id?: string | null;
    include_descendants?: boolean;
  },
  options: Option[],
) {
  const label = (
    {
      all: "All organization scopes",
      head_office: "Head Office",
      unassigned: "Unassigned employees",
    } as Record<string, string>
  )[policy.scope_type];
  const option = options.find((o) => o.id === policy.scope_id);
  return (
    (label ||
      (option
        ? [option.context, option.label].filter(Boolean).join(" / ")
        : policy.scope_id || "Unavailable scope")) +
    (policy.scope_type === "branch"
      ? policy.include_descendants
        ? " · including branch clients"
        : " · branch only"
      : "")
  );
}

export function grantStatus(
  grant: { active?: boolean; starts_on: string; ends_on?: string | null },
  today: string,
) {
  if (grant.active === false) return "Inactive";
  if (grant.starts_on > today) return "Scheduled";
  if (grant.ends_on && grant.ends_on <= today) return "Expired";
  return "Active";
}

export type AccessImpact = {
  revision: number | null;
  demo?: boolean;
  today?: string;
  user_count?: number;
  targets: { id: string; label: string }[];
  changes: {
    user_id?: string;
    user_label?: string;
    target_id: string;
    target: string;
    key: string;
    label: string;
    action: string;
    before: boolean;
    after: boolean;
    reason: string;
    restricted: boolean;
  }[];
};

export function permissionExplanation(
  policy: any,
  action: string,
  account?: { active: boolean; role: string },
) {
  const reason = policy.decisions?.[action]?.reason;
  if (reason === "Organization action denied or inactive account") {
    if (account?.active === false) return "Account is inactive.";
    if (account?.role === "viewer" && action !== "R")
      return "Viewer accounts cannot change employee data.";
    return "No active scope grant permits this action at this primary placement. Check grant dates and branch client inclusion.";
  }
  return reason || policy.explanation;
}
