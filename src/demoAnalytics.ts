import type { Employee, Option } from "./domain";
import type { AnalyticsReport } from "./components/ManagementAnalytics";
import type { StaffingRequirement } from "./components/StaffingRequisitions";

// Synthetic demo only. Production aggregates and permissions are evaluated in PostgreSQL.
export function demoAnalytics(
  employees: Employee[],
  history: {
    employee_id: string;
    type: string;
    effective_on: string;
    state: string;
    status?: string;
    from_value?: string;
    to_value?: string;
  }[],
  staffing: StaffingRequirement[],
  org: Option[],
  today: string,
  q: { from?: string; to?: string },
): AnalyticsReport {
  const end = q.to || today,
    start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const from = q.from || start.toISOString().slice(0, 10);
  if (from > end || end > today || from < "1900-01-01")
    throw new Error("Choose a valid date range ending on or before today");
  const count = (rows: Employee[], key: string) => {
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const label = String(row.values[key] ?? "Not recorded");
      grouped.set(label, (grouped.get(label) || 0) + 1);
    }
    return Object.fromEntries(grouped);
  };
  const events = history
    .filter((m) => m.type === "status" && m.state !== "Voided")
    .sort((a, b) => a.effective_on.localeCompare(b.effective_on));
  const statusAt = (e: Employee, day: string) => {
    const changes = events.filter((m) => m.employee_id === e.id);
    const last = changes.filter((m) => m.effective_on <= day).at(-1);
    return (
      last?.status ||
      last?.to_value ||
      changes[0]?.from_value ||
      e.values.status
    );
  };
  const before = new Date(`${from}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  const previous = before.toISOString().slice(0, 10);
  const cohort = employees.filter((e) => e.values.date_hired);
  const opening = cohort.filter(
    (e) =>
      String(e.values.date_hired) < from && statusAt(e, previous) === "Active",
  );
  const closing = cohort.filter(
    (e) => String(e.values.date_hired) <= end && statusAt(e, end) === "Active",
  );
  const separated = events.filter(
    (m) =>
      cohort.some((e) => e.id === m.employee_id) &&
      m.effective_on >= from &&
      m.effective_on <= end &&
      ["Separated", "Resigned", "Terminated"].includes(
        m.status || m.to_value || "",
      ),
  );
  const active = employees.filter((e) => e.values.status === "Active");
  const branches = Object.entries(count(active, "branch")).map(
    ([label, count]) => ({
      id:
        org.find((o) => o.kind === "branch" && o.label === label)?.id || label,
      label,
      count,
    }),
  );
  const clients = org
    .filter((o) => o.kind === "client")
    .map((o) => ({
      id: o.id,
      label: o.label,
      context: o.context,
      count: active.filter(
        (e) => e.values.client === o.label && e.values.branch === o.context,
      ).length,
    }))
    .filter((o) => o.count);
  const noClient = active.filter((e) => !e.values.client).length;
  if (noClient)
    clients.push({
      id: "none",
      label: "No client",
      context: undefined,
      count: noClient,
    });
  const targets = new Map<
    string,
    { client: Option; type: string; required: number }
  >();
  for (const row of staffing.filter(
    (r) =>
      r.active && r.starts_on <= today && (!r.ends_on || r.ends_on > today),
  )) {
    const client = org.find((o) => o.id === row.client_id);
    if (!client) continue;
    const key = `${client.id}:${row.employment_type}`,
      prior = targets.get(key);
    targets.set(key, {
      client,
      type: row.employment_type,
      required: row.required_headcount + (prior?.required || 0),
    });
  }
  let required = 0,
    filled = 0;
  for (const target of targets.values()) {
    required += target.required;
    filled += Math.min(
      target.required,
      active.filter(
        (e) =>
          e.values.client === target.client.label &&
          e.values.branch === target.client.context &&
          e.values.employment_type === target.type,
      ).length,
    );
  }
  const mix = new Map<string, { age: string; gender: string; count: number }>();
  for (const e of active) {
    const birth = e.values.birth_date ? String(e.values.birth_date) : "",
      year =
        Number(today.slice(0, 4)) -
        Number(birth.slice(0, 4)) -
        Number(today.slice(5) < birth.slice(5));
    const age =
      !birth || year < 0
        ? "Not recorded"
        : year < 18
          ? "Under 18"
          : year <= 25
            ? "18–25"
            : year <= 30
              ? "26–30"
              : year <= 40
                ? "31–40"
                : year <= 50
                  ? "41–50"
                  : year <= 60
                    ? "51–60"
                    : "61+";
    const gender = String(e.values.gender || "Not recorded"),
      key = `${age}:${gender}`;
    mix.set(key, { age, gender, count: (mix.get(key)?.count || 0) + 1 });
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    today,
    from,
    to: end,
    total: employees.length,
    headcount: active.length,
    status_coverage: employees.length,
    statuses: count(employees, "status"),
    placements: count(employees, "branch"),
    fill_rate: required ? round((filled / required) * 100) : null,
    staffing: { required, filled },
    period: {
      eligible: cohort.length,
      opening: opening.length,
      closing: closing.length,
      hires: cohort.length
        ? cohort.filter(
            (e) =>
              String(e.values.date_hired) >= from &&
              String(e.values.date_hired) <= end,
          ).length
        : null,
      separations: cohort.length ? separated.length : null,
      retention: opening.length
        ? round(
            (opening.filter(
              (e) =>
                closing.includes(e) &&
                !separated.some((m) => m.employee_id === e.id),
            ).length /
              opening.length) *
              100,
          )
        : null,
      turnover:
        opening.length + closing.length
          ? round(
              (separated.length / ((opening.length + closing.length) / 2)) *
                100,
            )
          : null,
    },
    branches,
    branch_groups: branches.length,
    clients,
    client_groups: clients.length,
    employment_types: Object.entries(count(active, "employment_type")).map(
      ([label, count]) => ({ label, count }),
    ),
    age_gender: [...mix.values()],
  };
}
