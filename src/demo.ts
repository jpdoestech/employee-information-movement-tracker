import {
  defaultFilter,
  localToday,
  type Context,
  type Employee,
  type Field,
  type Filter,
  type Option,
} from "./domain";
const org: Option[] = [
  {
    id: "head_office",
    kind: "head_office",
    label: "Head Office",
    context: "Head Office",
    active: true,
  },
  {
    id: "north",
    kind: "branch",
    label: "Example North Branch",
    context: "Branch",
    active: true,
    row_version: 1,
    code: "B01",
  },
  {
    id: "south",
    kind: "branch",
    label: "Example South Branch",
    context: "Branch",
    active: true,
    row_version: 1,
    code: "B02",
  },
  {
    id: "client-n",
    kind: "client",
    label: "Example Client",
    context: "Example North Branch",
    branch_id: "north",
    active: true,
    row_version: 1,
    code: "C01",
  },
  {
    id: "client-s",
    kind: "client",
    label: "Example Client",
    context: "Example South Branch",
    branch_id: "south",
    active: true,
    row_version: 1,
    code: "C01",
  },
];
const base = [
  ["employee_number", "Employee ID", "system"],
  ["name", "Employee Name", "system"],
  ["status", "Employment Status", "system"],
  ["position", "Position", "system"],
  ["branch", "Primary Branch", "system"],
  ["client", "Primary Client", "system"],
  ["email", "Email", "email"],
  ["phone", "Phone", "phone"],
  ...Array.from({ length: 10 }, (_, i) => [
    `example_${i + 1}`,
    `Example Field ${i + 1}`,
    "short_text",
  ]),
];
const fields: Field[] = base.map(([key, label, type], i) => ({
  id: `field-${key}`,
  key,
  label,
  type,
  group_id: i < 6 ? "core" : "contact",
  group_name: i < 6 ? "Core identity" : "Contact information",
  active: true,
  required: false,
  sensitivity: "normal",
  list_eligible: true,
  scope_mode: "all",
  row_version: 1,
  actions: ["C", "R", "U", "D"],
}));
let employees: Employee[] = Array.from({ length: 34 }, (_, i) => ({
  id: `demo-${i + 1}`,
  row_version: 1,
  values: {
    employee_number: `EMP-${String(i + 1).padStart(7, "0")}`,
    name: `Synthetic Employee ${String(i + 1).padStart(2, "0")}`,
    status: i % 8 === 0 ? "Inactive" : "Active",
    position: ["Coordinator", "Team Lead", "Associate"][i % 3],
    branch:
      i % 3 === 0
        ? "Head Office"
        : i % 2 === 0
          ? "Example North Branch"
          : "Example South Branch",
    client: i % 3 === 0 ? null : "Example Client",
    email: `synthetic${i + 1}@example.invalid`,
    phone: "Example only",
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, j) => [
        `example_${j + 1}`,
        `Sample ${i + 1}.${j + 1}`,
      ]),
    ),
  },
}));
const history: any[] = [];
const audit: any[] = [];
const context: Context = {
  profile: {
    id: "synthetic-superadmin",
    display_name: "Demo Administrator",
    role: "superadmin",
  },
  today: localToday(),
  revision: 1,
  fields,
  groups: [
    { id: "core", name: "Core identity", active: true, row_version: 1 },
    {
      id: "contact",
      name: "Contact information",
      active: true,
      row_version: 1,
    },
  ],
  capabilities: [
    "employee_create",
    "employee_delete",
    "organization_manage",
    "schema_manage",
    "movement_create",
    "movement_correct",
    "bulk_update",
    "audit_read",
    "sync_manage",
  ],
  views: JSON.parse(localStorage.getItem("eimt-synthetic-views") || "[]"),
};
export async function demoQuery(op: string, q: any = {}) {
  await new Promise((r) => setTimeout(r, 40));
  if (op === "context") return structuredClone(context);
  if (op === "field_scope_preview")
    return { resolved_targets: org.length, affected_visible_values: 0 };
  if (op === "target_fields") return structuredClone(fields);
  if (op === "options")
    return org.filter(
      (o) =>
        `${o.label} ${o.context}`
          .toLowerCase()
          .includes((q.search || "").toLowerCase()) &&
        (!q.branches?.length ||
          o.kind !== "client" ||
          q.branches.includes(o.branch_id)),
    );
  if (op === "export") {
    const r: any = await demoQuery("employees", {
      ...q,
      limit: 100,
      offset: 0,
    });
    return { items: r.items, fields };
  }
  if (op === "employees") {
    const f: Filter = { ...defaultFilter, ...q };
    const rows = employees
      .filter((e) => {
        const v = e.values;
        const bo = org.find((o) => o.kind === "branch" && o.label === v.branch);
        const co = org.find(
          (o) => o.kind === "client" && o.branch_id === bo?.id,
        );
        return (
          Object.values(v).some((x) =>
            String(x ?? "")
              .toLowerCase()
              .includes(f.search.toLowerCase()),
          ) &&
          (!f.branches.length || f.branches.includes(bo?.id || "")) &&
          (!f.clients.length || f.clients.includes(co?.id || "")) &&
          (!f.statuses.length || f.statuses.includes(String(v.status))) &&
          (!f.quick ||
            (f.quick.kind === "head_office"
              ? v.branch === "Head Office"
              : f.quick.kind === "branch"
                ? bo?.id === f.quick.id
                : co?.id === f.quick.id)) &&
          f.predicates.every((p) =>
            p.op === "empty"
              ? v[p.key] == null
              : p.op === "eq"
                ? v[p.key] === p.value
                : String(v[p.key] ?? "")
                    .toLowerCase()
                    .includes(String(p.value).toLowerCase()),
          )
        );
      })
      .sort(
        (a, b) =>
          String(a.values[f.sort] ?? "").localeCompare(
            String(b.values[f.sort] ?? ""),
          ) * (f.direction === "asc" ? 1 : -1) || a.id.localeCompare(b.id),
      );
    return {
      items: structuredClone(rows.slice(f.offset, f.offset + f.limit)),
      total: rows.length,
      revision: context.revision,
    };
  }
  if (op === "employee")
    return {
      employee: structuredClone(employees.find((e) => e.id === q.id)),
      fields: structuredClone(fields),
      assignments: [],
      movements: history.filter((m) => m.employee_id === q.id),
    };
  if (op === "movements") return history;
  if (op === "dashboard")
    return {
      total: employees.length,
      today: context.today,
      statuses: Object.fromEntries(
        ["Active", "Inactive"].map((s) => [
          s,
          employees.filter((e) => e.values.status === s).length,
        ]),
      ),
      placements: Object.fromEntries(
        ["Head Office", "Example North Branch", "Example South Branch"].map(
          (s) => [s, employees.filter((e) => e.values.branch === s).length],
        ),
      ),
    };
  if (op === "schema") return { fields, groups: context.groups, targets: [] };
  if (op === "security")
    return {
      users: [context.profile],
      scopes: [],
      policies: [],
      capabilities: [],
    };
  if (op === "audit") return audit;
  if (op === "effective_permissions")
    return fields.map((f) => ({
      ...f,
      explanation:
        "Synthetic full-access demo; real policies are evaluated in PostgreSQL.",
    }));
  if (op === "sync") return { workbooks: [], pending: 0, connected: false };
  throw new Error("Unknown demo query");
}
export async function demoMutate(op: string, p: any) {
  if (op.startsWith("employee_") || op === "bulk_update") {
    if (op === "employee_create") {
      const id = crypto.randomUUID();
      employees.push({
        id,
        row_version: 1,
        values: {
          employee_number: `EMP-${String(employees.length + 1).padStart(7, "0")}`,
          status: "Active",
          branch:
            org.find((o) => o.id === p.branch_id || o.id === p.target_level)
              ?.label || "Unassigned",
          ...p.values,
        },
      });
      context.revision++;
      return { id };
    }
    const targets =
      op === "bulk_update"
        ? p.rows
        : [{ id: p.id, row_version: p.expected_version }];
    for (const t of targets) {
      const e = employees.find((e) => e.id === t.id);
      if (!e || e.row_version !== t.row_version)
        throw new Error(
          "Revision conflict: reload before reapplying your draft",
        );
    }
    for (const t of targets) {
      const e = employees.find((e) => e.id === t.id)!;
      if (op === "employee_delete")
        employees = employees.filter((x) => x.id !== e.id);
      else {
        Object.assign(e.values, p.values);
        e.row_version++;
      }
    }
  } else if (op === "field") {
    const f = fields.find((f) => f.id === p.id);
    if (
      fields.some(
        (f) =>
          f.id !== p.id &&
          (f.key === p.key ||
            f.label.trim().toLowerCase().replace(/\s+/g, " ") ===
              p.label.trim().toLowerCase().replace(/\s+/g, " ")),
      )
    )
      throw new Error(
        "An existing active or inactive field matches. Reuse or reactivate it.",
      );
    if (f) Object.assign(f, p, { row_version: f.row_version + 1 });
    else
      fields.push({
        ...p,
        id: crypto.randomUUID(),
        active: true,
        row_version: 1,
        list_eligible: true,
        group_name: context.groups.find((g) => g.id === p.group_id)?.name,
        actions: ["C", "R", "U", "D"],
      });
  } else if (op === "group") {
    const g = context.groups.find((g) => g.id === p.id);
    if (g) Object.assign(g, p, { row_version: g.row_version + 1 });
    else
      context.groups.push({
        ...p,
        id: crypto.randomUUID(),
        active: true,
        row_version: 1,
      });
  } else if (op === "organization") {
    const o = org.find((o) => o.id === p.id);
    if (o)
      Object.assign(o, p, {
        label: p.name,
        row_version: (o.row_version || 1) + 1,
      });
    else
      org.push({
        ...p,
        id: crypto.randomUUID(),
        label: p.name,
        context:
          p.kind === "branch"
            ? "Branch"
            : org.find((o) => o.id === p.branch_id)?.label,
        active: true,
        row_version: 1,
      });
  } else if (op === "save_view") {
    const v = context.views.find((v) => v.name === p.name);
    if (v) v.config = p.config;
    else context.views.push({ id: crypto.randomUUID(), ...p });
    localStorage.setItem("eimt-synthetic-views", JSON.stringify(context.views));
  } else if (op === "movement") {
    const e = employees.find((e) => e.id === p.employee_id)!;
    if (!e || e.row_version !== p.expected_version)
      throw new Error("Movement preview is stale");
    history.unshift({
      ...p,
      id: crypto.randomUUID(),
      employee_name: e.values.name,
      state: p.effective_on > context.today ? "Scheduled" : "Effective / past",
    });
    if (p.effective_on <= context.today) {
      if (p.type === "status") e.values.status = p.status;
      else if (p.type === "position") e.values.position = p.position;
      else if (p.type !== "temporary" && p.category !== "additional") {
        e.values.branch =
          p.target_level === "head_office"
            ? "Head Office"
            : org.find((o) => o.id === p.branch_id)?.label || "Unassigned";
        e.values.client = org.find((o) => o.id === p.client_id)?.label || null;
      }
    }
    e.row_version++;
  } else if (op === "void_movement") {
    const m = history.find((m) => m.id === p.id);
    if (m) m.state = "Voided";
  } else if (
    [
      "profile",
      "scope",
      "policy",
      "capability",
      "workbook",
      "sync_now",
    ].includes(op)
  ) {
    /* synthetic presentation only */
  } else throw new Error("Unknown demo mutation");
  context.revision++;
  audit.unshift({
    id: audit.length + 1,
    operation: op,
    created_at: new Date().toISOString(),
  });
  return { saved: true };
}
