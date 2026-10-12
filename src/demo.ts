import { mobileError, normalizeIdentifier } from "./identifiers";
import { fieldConfigurationError } from "./fieldConfiguration";
import {
  addressDefinitions,
  addressKeys,
  addressValue,
} from "./address/addressFields";
import { addressValidationError } from "./address/addressService";
import { matchesFilterValue } from "./filterValues";
import { combinedName, nameKeys, nameLabels } from "./employeeForm";
import {
  profileDefinitions,
  separationCategories,
  separationReasons,
  employmentError,
} from "./profileFields";
import {
  governmentDefinitions,
  governmentIdError,
  normalizeGovernmentId,
} from "./governmentIds";
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
  ["employee_number", "System ID", "system"],
  ["client_employee_number", "Client-based ID", "system"],
  ["name", "Employee Name", "system"],
  ["status", "Employment Status", "system"],
  ["position", "Position", "system"],
  ["branch", "Primary Branch", "system"],
  ["client", "Primary Client", "system"],
  ["email", "Email", "email"],
  ["phone", "Mobile", "phone"],
  ...Array.from({ length: 10 }, (_, i) => [
    `example_${i + 1}`,
    `Example Field ${i + 1}`,
    "short_text",
  ]),
];
const clientSettings = new Map<
  string,
  {
    row_version: number;
    filter_keys: string[];
    default_values: Record<string, unknown>;
  }
>();
const fields: Field[] = base.map(([key, label, type], i) => ({
  id: `field-${key}`,
  key,
  label,
  type,
  group_id: i < 7 ? "core" : i < 9 ? "contact" : "additional",
  group_name:
    i < 7
      ? "Core identity"
      : i < 9
        ? "Contact information"
        : "Additional information",
  active: true,
  required: false,
  sensitivity: "normal",
  list_eligible: true,
  scope_mode: "all",
  row_version: 1,
  actions: ["C", "R", "U", "D"],
}));
fields.push(
  ...governmentDefinitions.map(({ digits, ...f }) => ({
    ...f,
    id: `field-${f.key}`,
    group_id: "government",
    group_name: "Government IDs",
    type: "short_text",
    active: true,
    required: false,
    sensitivity: "restricted",
    list_eligible: false,
    scope_mode: "all",
    row_version: 1,
    validation: { government_id_digits: digits, max_length: digits },
    actions: ["C", "R", "U", "D"],
  })),
  ...profileDefinitions.map(({ group, ...f }, i) => ({
    ...f,
    id: `field-${f.key}`,
    group_id: group,
    group_name:
      group === "personal" ? "Personal information" : "Employment information",
    active: true,
    required: false,
    sensitivity: "normal",
    list_eligible: true,
    scope_mode: "all",
    row_version: 1,
    actions: ["C", "R", "U", "D"],
  })),
  ...nameKeys.map((key, i) => ({
    ...fields.find((f) => f.key === "name")!,
    id: `field-${key}`,
    key,
    label: nameLabels[i],
    validation: { max_length: 80 },
  })),
  ...addressDefinitions.map((f, i) => ({
    ...f,
    id: `field-${f.key}`,
    group_id: "address",
    group_name: "Address",
    active: true,
    required: false,
    sensitivity: "normal",
    list_eligible: true,
    scope_mode: "all",
    row_version: 1,
    actions: ["C", "R", "U", "D"],
  })),
);
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
    phone: "09123456789",
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, j) => [
        `example_${j + 1}`,
        `Sample ${i + 1}.${j + 1}`,
      ]),
    ),
  },
}));
const clientCounters = new Map<string, number>();
const clientIdentities = new Map<string, string>();
function clientIdentity(employee: Employee, clientId: string) {
  const key = `${employee.id}:${clientId}`;
  if (!clientIdentities.has(key)) {
    const next = (clientCounters.get(clientId) || 0) + 1;
    if (next > 99999) throw new Error("Client ID sequence is exhausted");
    clientCounters.set(clientId, next);
    clientIdentities.set(
      key,
      `${org.find((o) => o.id === clientId)?.code}-${String(next).padStart(5, "0")}`,
    );
  }
  return clientIdentities.get(key)!;
}
for (const e of employees)
  e.values.client_employee_number = e.values.client
    ? clientIdentity(
        e,
        e.values.branch === "Example North Branch" ? "client-n" : "client-s",
      )
    : null;
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
  register_settings: { row_numbers_allowed: true, row_version: 1 },
  fields,
  groups: [
    {
      id: "additional",
      name: "Additional information",
      active: true,
      row_version: 1,
      display_order: 40,
      tab_name: "Additional information",
      tab_order: 30,
    },
    {
      id: "government",
      name: "Government IDs",
      active: true,
      row_version: 1,
      display_order: 30,
      tab_name: "Government ID",
      tab_order: 10,
    },
    {
      id: "personal",
      name: "Personal information",
      active: true,
      row_version: 1,
      display_order: 10,
      tab_name: "Profile",
      tab_order: 0,
    },
    {
      id: "employment",
      name: "Employment information",
      active: true,
      row_version: 1,
      display_order: 20,
      tab_name: "Profile",
      tab_order: 0,
    },
    {
      id: "address",
      name: "Address",
      active: true,
      row_version: 1,
      tab_name: "Address",
      tab_order: 20,
    },
    {
      id: "core",
      name: "Core identity",
      active: true,
      row_version: 1,
      tab_name: "Profile",
      tab_order: 0,
    },
    {
      id: "contact",
      name: "Contact information",
      tab_name: "Profile",
      tab_order: 0,
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
  if (op === "field_scope_preview") {
    const matches = (o: Option) =>
      q.scope_mode === "all" ||
      (q.targets || []).some(
        (t: any) =>
          (t.scope_type === o.kind &&
            (o.kind === "head_office" || t.scope_id === o.id)) ||
          (t.scope_type === "branch" &&
            t.include_descendants &&
            o.kind === "client" &&
            t.scope_id === o.branch_id),
      );
    const resolved = org.filter(matches);
    const selected = employees.filter((e) => {
      const placement = e.values.client
        ? org.find((o) => o.kind === "client" && o.context === e.values.branch)
        : org.find((o) => o.label === e.values.branch);
      return placement ? matches(placement) : q.scope_mode === "all";
    });
    const f = fields.find((f) => f.id === q.id);
    return {
      resolved_targets: resolved.length + (q.scope_mode === "all" ? 1 : 0),
      scoped_employee_count: selected.length,
      samples: selected.slice(0, 5).map((e) => ({
        employee_number: e.values.employee_number,
        name: e.values.name,
      })),
      affected_visible_values: f
        ? employees.filter(
            (e) => !selected.includes(e) && e.values[f.key] !== undefined,
          ).length
        : 0,
      revision: context.revision,
    };
  }
  if (op === "client_settings")
    return {
      client_id: q.client_id,
      row_version: 0,
      filter_keys: ["status"],
      default_values: {},
      ...structuredClone(clientSettings.get(q.client_id)),
    };
  if (op === "filter_values") {
    const rows: any = await demoQuery("employees", {
      ...defaultFilter,
      quick: q.client_id ? { kind: "client", id: q.client_id } : null,
      limit: 10000,
    });
    return [
      ...new Set(
        rows.items
          .map((e: Employee) => JSON.stringify(e.values[q.key]))
          .filter(Boolean),
      ),
    ]
      .filter((v: any) =>
        String(JSON.parse(v))
          .toLowerCase()
          .includes((q.search ?? "").toLowerCase()),
      )
      .sort()
      .slice(0, 100)
      .map((id: any) => ({ id, label: String(JSON.parse(id)) }));
  }
  if (op === "target_fields")
    return structuredClone(fields).map((f) => ({
      ...f,
      default_value:
        q.target_level === "client" &&
        Object.hasOwn(
          clientSettings.get(q.client_id)?.default_values ?? {},
          f.key,
        )
          ? clientSettings.get(q.client_id)!.default_values[f.key]
          : f.default_value,
    }));
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
          f.predicates.every((p) => matchesFilterValue(v[p.key], p))
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
  if (op === "record_page") {
    const source =
      q.kind === "movements" ? history : q.kind === "audit" ? audit : org;
    let items = source.filter(
      (r: any) =>
        (!q.search ||
          [
            r.employee_name,
            r.employee_number,
            r.type,
            r.state,
            r.operation,
            r.entity,
            r.label,
            r.context,
            r.code,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q.search.toLowerCase())) &&
        (!q.types?.length || q.types.includes(r.type || r.kind)) &&
        (!q.states?.length || q.states.includes(r.state)) &&
        (!q.branches?.length ||
          q.branches.includes(
            q.kind === "organization" && r.kind === "branch"
              ? r.id
              : r.branch_id,
          )) &&
        (!q.clients?.length || q.clients.includes(r.client_id)) &&
        (!q.from || (r.effective_on || r.created_at?.slice(0, 10)) >= q.from) &&
        (!q.to || (r.effective_on || r.created_at?.slice(0, 10)) <= q.to),
    );
    items = [...items].sort(
      (a: any, b: any) =>
        String(a[q.sort] || "").localeCompare(String(b[q.sort] || "")) *
          (q.direction === "asc" ? 1 : -1) ||
        String(a.id).localeCompare(String(b.id)),
    );
    return structuredClone({
      items: items.slice(q.offset || 0, (q.offset || 0) + (q.limit || 25)),
      total: items.length,
      revision: context.revision,
    });
  }
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
  if (op === "client_settings") {
    const prior = clientSettings.get(p.client_id);
    if ((prior?.row_version ?? 0) !== p.expected_version)
      throw new Error("Client settings changed; reload before saving");
    if (p.filter_keys.length > 8)
      throw new Error("Choose up to eight direct filters");
    const defaults = p.default_values ?? prior?.default_values ?? {};
    for (const [key, value] of Object.entries(defaults)) {
      const f = fields.find(
        (f) =>
          f.key === key &&
          f.type !== "system" &&
          !f.validation?.government_id_digits,
      );
      if (!f) throw new Error("Default field unavailable");
      const invalid = fieldConfigurationError({ ...f, default_value: value });
      if (invalid) throw new Error(invalid);
    }
    const result = {
      row_version: (prior?.row_version ?? 0) + 1,
      filter_keys: p.filter_keys,
      default_values: defaults,
    };
    clientSettings.set(p.client_id, structuredClone(result));
    context.revision++;
    return result;
  }
  if (op === "form_layout") {
    if (context.profile.role !== "superadmin")
      throw new Error("Only a Superadmin may configure form tabs");
    for (const item of p.groups) {
      const group = context.groups.find((g) => g.id === item.id);
      if (!group || group.row_version !== item.expected_version)
        throw new Error("Field groups changed; reload before applying tabs");
      if (
        !item.tab_name.trim() ||
        item.tab_name === "Record history" ||
        item.tab_name.length > 60 ||
        !Number.isInteger(item.tab_order) ||
        item.tab_order < 0 ||
        item.tab_order > 999
      )
        throw new Error("Invalid tab name or order");
    }
    for (const item of p.groups)
      Object.assign(
        context.groups.find((g) => g.id === item.id)!,
        {
          tab_name: item.tab_name,
          tab_order: item.tab_order,
          row_version: item.expected_version + 1,
        },
      );
    context.revision++;
    return { saved: true };
  }
  function structuredValues(values: Record<string, unknown>) {
    for (const key of ["last_name", "first_name"])
      if (typeof values[key] !== "string" || !String(values[key]).trim())
        throw new Error("Last Name and First Name are required");
    if (
      nameKeys.some(
        (key) =>
          values[key] != null &&
          (typeof values[key] !== "string" || String(values[key]).length > 80),
      )
    )
      throw new Error("Name parts must be text of at most 80 characters");
    return combinedName(values);
  }
  if (op === "employee_create") {
    const defaults = Object.fromEntries(
      fields
        .filter(
          (f) =>
            f.active &&
            f.type !== "system" &&
            f.actions.includes("C") &&
            f.default_value != null,
        )
        .map((f) => [f.key, f.default_value]),
    );
    p = {
      ...p,
      values: {
        ...defaults,
        ...(p.target_level === "client"
          ? clientSettings.get(p.client_id)?.default_values
          : {}),
        ...p.values,
      },
    };
  }
  if (op === "employee_create")
    p = {
      ...p,
      values: { ...p.values, name: structuredValues(p.values ?? {}) },
    };
  if (
    p.values &&
    ("client_employee_number" in p.values || "employee_number" in p.values)
  )
    throw new Error("Identity fields are system-managed");
  if (op.startsWith("employee_") || op === "bulk_update") {
    if (p.employment || p.initial_employment) {
      const change = p.employment || p.initial_employment;
      const e = employees.find((e) => e.id === p.id);
      const draft = {
        ...e?.values,
        ...p.values,
        ...change,
        position: change.position ?? p.initial_position ?? e?.values.position,
        status: change.status ?? e?.values.status ?? "Active",
      };
      if (!["official", "correction"].includes(change.change_kind))
        throw new Error("Choose official change or typo correction");
      if (change.change_kind === "correction" && change.status != null)
        throw new Error("Status changes require an official movement");
      const problem = employmentError(draft);
      if (problem) throw new Error(problem.message);
      if (change.position != null && change.change_kind === "official")
        p.position_change = change.position;
    }
    if (op === "employee_update" && Object.hasOwn(p, "position_change")) {
      if (
        typeof p.position_change !== "string" ||
        !p.position_change.trim() ||
        p.position_change.trim().length > 200
      )
        throw new Error("Enter a position of 1-200 characters");
      if (
        history.some(
          (m: any) =>
            m.employee_id === p.id &&
            m.type === "position" &&
            m.effective_on >= context.today &&
            m.state !== "Voided",
        )
      )
        throw new Error("Resolve the conflicting scheduled event first");
    }
    for (const field of fields.filter((f) => f.type === "phone")) {
      if (Object.hasOwn(p.values ?? {}, field.key)) {
        const error = mobileError(p.values[field.key]);
        if (error) throw new Error(error);
        if (typeof p.values[field.key] === "string")
          p.values[field.key] = normalizeIdentifier(p.values[field.key]);
      }
    }
    for (const field of fields.filter(
      (f) => f.validation?.government_id_digits,
    )) {
      if (Object.hasOwn(p.values ?? {}, field.key)) {
        const error = governmentIdError(field, p.values[field.key]);
        if (error) throw new Error(error);
        if (typeof p.values[field.key] === "string")
          p.values[field.key] = normalizeGovernmentId(p.values[field.key]);
      }
    }
    if (op === "employee_create") {
      for (const prefix of ["", "current_"]) {
        const problem = await addressValidationError(
          addressValue(p.values ?? {}, prefix),
        );
        if (problem) throw new Error(problem);
      }
      const id = crypto.randomUUID();
      const created: Employee = {
        id,
        row_version: 1,
        values: {
          employee_number: `EMP-${String(employees.length + 1).padStart(7, "0")}`,
          status: p.initial_employment?.status ?? "Active",
          position: p.initial_position ?? "",
          branch:
            org.find((o) => o.id === p.branch_id || o.id === p.target_level)
              ?.label || "Unassigned",
          ...p.values,
        },
      };
      created.values.client =
        org.find((o) => o.id === p.client_id)?.label || null;
      created.values.client_employee_number = p.client_id
        ? clientIdentity(created, p.client_id)
        : null;
      employees.push(created);
      audit.unshift({
        id: audit.length + 1,
        operation: op,
        entity: "employee",
        entity_id: id,
        created_at: new Date().toISOString(),
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
    if (op !== "employee_delete")
      for (const t of targets) {
        const e = employees.find((e) => e.id === t.id)!;
        if (nameKeys.some((key) => Object.hasOwn(p.values ?? {}, key)))
          structuredValues({ ...e.values, ...p.values });
        else if (
          Object.hasOwn(p.values ?? {}, "name") &&
          nameKeys.some((key) => e.values[key] != null)
        )
          throw new Error(
            "Edit the separate name fields to change a structured employee name",
          );
        for (const prefix of ["", "current_"])
          if (
            addressKeys.some((key) =>
              Object.hasOwn(p.values ?? {}, prefix + key),
            )
          ) {
            const problem = await addressValidationError(
              addressValue({ ...e.values, ...p.values }, prefix),
            );
            if (problem) throw new Error(problem);
          }
      }
    for (const t of targets) {
      const e = employees.find((e) => e.id === t.id)!;
      const previous = { ...e.values };
      if (op === "employee_delete")
        employees = employees.filter((x) => x.id !== e.id);
      else {
        Object.assign(e.values, p.values);
        if (nameKeys.some((key) => Object.hasOwn(p.values ?? {}, key)))
          e.values.name = structuredValues(e.values);
        e.row_version++;
        if (
          p.employment?.change_kind === "correction" &&
          p.employment.position != null
        )
          e.values.position = p.employment.position;
        if (
          p.employment?.status != null &&
          p.employment.status !== e.values.status
        ) {
          history.unshift({
            id: crypto.randomUUID(),
            employee_id: e.id,
            type: "status",
            from_value: String(previous.status || "—"),
            to_value: p.employment.status,
            status: p.employment.status,
            effective_on: e.values.status_effective_date ?? context.today,
            reason:
              e.values.separation_details ||
              e.values.separation_reason ||
              "Official employment status change",
            state:
              (e.values.status_effective_date ?? context.today) > context.today
                ? "Scheduled"
                : "Effective",
            employee_name: e.values.name,
            employee_number: e.values.employee_number,
          });
          if (
            (e.values.status_effective_date ?? context.today) <= context.today
          )
            e.values.status = p.employment.status;
        }
        if (
          p.employment?.change_kind === "official" &&
          Object.hasOwn(p.values, "department") &&
          p.position_change == null
        )
          history.unshift({
            id: crypto.randomUUID(),
            employee_id: e.id,
            type: "position",
            from_value: `Department: ${previous.department || "—"}`,
            to_value: `Department: ${p.values.department || "—"}`,
            effective_on: context.today,
            reason: "Official department change from profile",
            state: "Effective",
            employee_name: e.values.name,
            employee_number: e.values.employee_number,
          });
        if (op === "employee_update" && Object.hasOwn(p, "position_change")) {
          e.values.position = p.position_change.trim();
          history.unshift({
            id: crypto.randomUUID(),
            employee_id: e.id,
            type: "position",
            from_value: String(previous.position || "—"),
            to_value: e.values.position,
            position: e.values.position,
            effective_on: context.today,
            reason: "Position updated from employee profile",
            state: "Effective",
            employee_name: e.values.name,
            employee_number: e.values.employee_number,
          });
        }
      }
    }
  } else if (op === "field") {
    const invalid = fieldConfigurationError(p);
    if (invalid) throw new Error(invalid);
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
    if (g) {
      const followsName =
        !g.tab_name ||
        (g.tab_name === g.name &&
          !context.groups.some(
            (other) => other.id !== g.id && other.tab_name === g.tab_name,
          ));
      Object.assign(g, p, {
        row_version: g.row_version + 1,
        tab_name: followsName ? p.name : g.tab_name,
      });
      for (const field of fields) {
        if (field.group_id === g.id) field.group_name = g.name;
      }
    } else
      context.groups.push({
        ...p,
        id: crypto.randomUUID(),
        active: true,
        row_version: 1,
      });
  } else if (op === "organization") {
    const o = org.find((o) => o.id === p.id);
    if (p.kind === "client") {
      p.code = String(p.code || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z][A-Z0-9_-]{0,19}$/.test(p.code))
        throw new Error("Invalid client code");
      if (o && o.code !== p.code && (clientCounters.get(o.id) || 0) > 0)
        throw new Error("Client code is locked after IDs have been issued");
    }
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
  } else if (op === "register_settings") {
    if (p.expected_version !== context.register_settings.row_version)
      throw new Error("Register settings changed; reload before saving");
    context.register_settings = {
      row_numbers_allowed: p.row_numbers_allowed,
      row_version: context.register_settings.row_version + 1,
    };
  } else if (op === "save_view") {
    const v = context.views.find((v) => v.name === p.name);
    if (v) v.config = p.config;
    else context.views.push({ id: crypto.randomUUID(), ...p });
    localStorage.setItem("eimt-synthetic-views", JSON.stringify(context.views));
  } else if (op === "movement") {
    if (
      p.type === "status" &&
      ["Separated", "Resigned", "Terminated"].includes(p.status) &&
      (!separationCategories.includes(p.separation_category) ||
        !separationReasons.includes(p.separation_reason) ||
        (p.separation_reason === "Others (specify)" &&
          !String(p.separation_details ?? "").trim()))
    )
      throw new Error(
        "Choose a separation category and reason; specify other reasons",
      );
    const e = employees.find((e) => e.id === p.employee_id)!;
    if (!e || e.row_version !== p.expected_version)
      throw new Error("Movement preview is stale");
    if (p.client_id) clientIdentity(e, p.client_id);
    history.unshift({
      ...p,
      from_value:
        p.type === "position"
          ? String(e.values.position || "—")
          : p.type === "status"
            ? String(e.values.status || "—")
            : [e.values.branch, e.values.client].filter(Boolean).join(" / "),
      to_value:
        p.type === "position"
          ? p.position
          : p.type === "status"
            ? p.status
            : p.target_level === "head_office"
              ? "Head Office"
              : p.target_level === "unassigned"
                ? "Unassigned"
                : [
                    org.find((o) => o.id === p.branch_id)?.label,
                    org.find((o) => o.id === p.client_id)?.label,
                  ]
                    .filter(Boolean)
                    .join(" / "),
      id: crypto.randomUUID(),
      employee_name: e.values.name,
      employee_number: e.values.employee_number,
      created_at: new Date().toISOString(),
      state: p.effective_on > context.today ? "Scheduled" : "Effective",
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
        e.values.client_employee_number = p.client_id
          ? clientIdentity(e, p.client_id)
          : null;
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
    operation:
      p.employment?.change_kind === "correction" ? "typo_correction" : op,
    entity: op.startsWith("employee") || op === "movement" ? "employee" : op,
    entity_id: p.employee_id || p.id,
    created_at: new Date().toISOString(),
  });
  return { saved: true };
}
