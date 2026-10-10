import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  Columns3,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
  GitBranch,
  SlidersHorizontal,
  RefreshCw,
  Sheet,
} from "lucide-react";
import { Dialog } from "./components/Dialog";
import { enableDemo, isDemo, mutate, query, supabase } from "./api";
import {
  csv,
  defaultColumns,
  defaultFilter,
  movementTypes,
  reconcileLayout,
  type Context,
  type Employee,
  type Field,
  type Filter,
  type Layout,
  type Option,
} from "./domain";
import { FilterBar } from "./components/FilterBar";
import { EmployeeTable } from "./components/EmployeeTable";
import { SearchFilterPicker } from "./components/SearchFilterPicker";
import { ColumnDesigner } from "./components/ColumnDesigner";
import { EmployeeEditor } from "./screens/EmployeeEditor";
import { BulkEditor } from "./screens/BulkEditor";
import { MovementEditor } from "./screens/MovementEditor";
import { Organization, FieldBuilder } from "./screens/Configuration";
import { Security } from "./screens/Security";
import { Sync } from "./screens/Sync";
const nav = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "movements", label: "Movements", icon: GitBranch },
  { id: "organization", label: "Organization", icon: Building2 },
  { id: "fields", label: "Field Builder", icon: SlidersHorizontal },
  { id: "permissions", label: "Permissions", icon: ShieldCheck },
  { id: "sync", label: "Sheets sync", icon: Sheet },
  { id: "audit", label: "Audit history", icon: Settings2 },
];
export default function App() {
  const [authenticated, setAuthenticated] = useState(isDemo()),
    [ctx, setCtx] = useState<Context>(),
    [page, setPage] = useState(location.hash.slice(1) || "dashboard"),
    [menu, setMenu] = useState(false),
    [options, setOptions] = useState<Option[]>([]),
    [filter, setFilter] = useState<Filter>({ ...defaultFilter }),
    [layout, setLayout] = useState<Layout>({
      columns: defaultColumns,
      pinned: ["employee_number", "name"],
      filter: defaultFilter,
    }),
    [rows, setRows] = useState<Employee[]>([]),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0),
    [dialog, setDialog] = useState<
      "columns" | "employee" | "bulk" | "movement" | null
    >(null),
    [editing, setEditing] = useState<Employee | null>(null),
    [report, setReport] = useState<any>(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [columnFilter, setColumnFilter] = useState(""),
    [operator, setOperator] = useState("contains"),
    [columnValue, setColumnValue] = useState(""),
    [movementFilter, setMovementFilter] = useState<string[]>([]);
  const loadedUser = useRef<string | null>(null);
  const [correction, setCorrection] = useState<any>(),
    [correctionReason, setCorrectionReason] = useState("");
  const refresh = () => {
    setVersion((v) => v + 1);
    setNotice(
      isDemo()
        ? "Saved in synthetic demo memory."
        : "Saved to Supabase. Google Sheets sync is asynchronous.",
    );
  };
  useEffect(() => {
    const change = () => {
      setPage(location.hash.slice(1) || "dashboard");
      setMenu(false);
    };
    window.addEventListener("hashchange", change);
    if (!supabase)
      return () => window.removeEventListener("hashchange", change);
    supabase.auth
      .getSession()
      .then(({ data }) => setAuthenticated(!!data.session || isDemo()));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session || isDemo());
      if (!session && !isDemo()) {
        setCtx(undefined);
        setRows([]);
        setOptions([]);
        setReport(undefined);
      }
    });
    return () => {
      window.removeEventListener("hashchange", change);
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    async function fetch() {
      try {
        const [c, o] = await Promise.all([
          query<Context>("context"),
          query<Option[]>("options"),
        ]);
        if (active) {
          setCtx(c);
          setOptions(o);
          if (loadedUser.current !== c.profile.id) {
            loadedUser.current = c.profile.id;
            const saved = c.views.find((v) => v.name === "__active__");
            if (saved) {
              const safe = reconcileLayout(saved.config, c.fields);
              setLayout(safe);
              setFilter(safe.filter);
            } else setLayout((l) => reconcileLayout(l, c.fields));
          } else setLayout((l) => reconcileLayout(l, c.fields));
        }
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setCtx(undefined);
          setRows([]);
          setReport(undefined);
          setOptions([]);
        }
      }
    }
    fetch();
    const timer = setInterval(fetch, 30000);
    const onFocus = () => fetch();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [authenticated, version]);
  useEffect(() => {
    if (!ctx) return;
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      Promise.all([
        query("employees", filter),
        query(
          page === "dashboard"
            ? "dashboard"
            : page === "movements"
              ? "movements"
              : page === "audit"
                ? "audit"
                : "dashboard",
          page === "movements" ? { types: movementFilter } : {},
        ),
      ])
        .then(([result, r]) => {
          if (active) {
            setRows(result.items);
            setTotal(result.total);
            setReport(r);
            setSelected([]);
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setRows([]);
            setReport(undefined);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    ctx?.revision,
    page,
    JSON.stringify(filter),
    JSON.stringify(movementFilter),
    version,
  ]);
  const fields = ctx?.fields || [];
  const can = (c: string) => ctx?.capabilities.includes(c);
  const readable = fields.filter((f) => f.actions.includes("R") && f.active);
  const tableLayout = { ...layout, filter };
  const currentNav = nav.find((n) => n.id === page) || nav[0];
  async function exportCSV() {
    setBusy(true);
    try {
      const exported = await query("export", filter);
      const blob = new Blob(
        [csv(exported.items, exported.fields, layout.columns)],
        { type: "text/csv;charset=utf-8;" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "authorized-employees.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!authenticated)
    return (
      <div className="login-shell">
        <section className="login-brand">
          <div className="brandmark">
            <GitBranch size={26} />
          </div>
          <span className="eyebrow">EMPLOYEE INFORMATION & MOVEMENT</span>
          <h1>
            One profile.
            <br />
            Every placement.
            <br />A reliable history.
          </h1>
          <p>A focused workspace for your people, branches and clients.</p>
          <div className="login-statement">
            <ShieldCheck size={22} />
            <span>
              Secure access, defined for every field and organization.
            </span>
          </div>
        </section>
        <section className="login-form">
          <h2>Welcome back</h2>
          <p>Sign in with your authorized company account.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (!supabase)
                  throw new Error(
                    "Add this project’s VITE_SUPABASE_URL and publishable key to .env.local.",
                  );
                const { error } = await supabase.auth.signInWithPassword({
                  email,
                  password,
                });
                if (error) throw error;
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="demo-button"
            onClick={() => {
              enableDemo();
              setAuthenticated(true);
            }}
          >
            Explore synthetic demo
          </button>
          <small>
            Demo data is fictional and is not connected to Supabase or Google.
          </small>
        </section>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#dashboard">
          <span className="brandmark">
            <GitBranch size={22} />
          </span>
          <span>
            Employee Tracker<small>INFORMATION & MOVEMENT</small>
          </span>
        </a>
        <div className="workspace-label">COMPANY WORKSPACE</div>
        <nav>
          {nav
            .filter(
              (n) =>
                !["fields", "permissions", "sync", "audit"].includes(n.id) ||
                (n.id === "fields"
                  ? can("schema_manage")
                  : n.id === "permissions"
                    ? ctx?.profile.role === "superadmin"
                    : n.id === "sync"
                      ? can("sync_manage")
                      : can("audit_read")),
            )
            .map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className={page === n.id ? "active" : ""}
                aria-current={page === n.id ? "page" : undefined}
              >
                <n.icon size={18} />
                {n.label}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={19} />
          <p>
            Permission protected<small>Supabase primary database</small>
          </p>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={22} />
          </button>
          <div>
            <span className="breadcrumb">Workspace / </span>
            <strong>{currentNav.label}</strong>
          </div>
          <div className="account">
            <span className="avatar">
              {ctx?.profile.display_name.slice(0, 1) || "A"}
            </span>
            <span>
              {ctx?.profile.display_name || "Authorized account"}
              <small>{ctx?.profile.role || "Loading…"}</small>
            </span>
            <button
              aria-label="Sign out"
              onClick={async () => {
                await supabase?.auth.signOut();
                if (isDemo()) location.reload();
                else setAuthenticated(false);
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {isDemo() && (
          <div className="demo-banner">
            Synthetic demo · UI review only · changes stay in memory · security
            and sync are enforced by the real backend.
          </div>
        )}
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">PEOPLE & PLACEMENTS</span>
              <h1>{currentNav.label}</h1>
              <p>
                {page === "employees"
                  ? "A single source of truth for every employee."
                  : page === "dashboard"
                    ? `Current as of ${ctx?.today || "today"} · Asia/Manila`
                    : "Focused tools for employee information and movement."}
              </p>
            </div>
            <button
              aria-label="Refresh authorized data"
              onClick={() => setVersion((v) => v + 1)}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {loading && (
            <div className="loading-line" role="status">
              Loading authorized data…
            </div>
          )}
          {ctx && page === "dashboard" && (
            <>
              <div className="stats">
                <a href="#employees" className="stat">
                  <span>Accessible employees</span>
                  <strong>{report?.total ?? "—"}</strong>
                  <small>Permanent profiles</small>
                </a>
                <div className="stat">
                  <span>Active employees</span>
                  <strong>{report?.statuses?.Active ?? "—"}</strong>
                  <small>Effective status today</small>
                </div>
                <div className="stat">
                  <span>Head Office</span>
                  <strong>{report?.placements?.["Head Office"] ?? "—"}</strong>
                  <small>Primary placement</small>
                </div>
                <div className="stat">
                  <span>Unassigned</span>
                  <strong>{report?.placements?.Unassigned ?? "—"}</strong>
                  <small>Awaiting primary placement</small>
                </div>
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>People by placement</h2>
                      <p>Counts respect your scope and column permissions.</p>
                    </div>
                    <Building2 size={20} />
                  </div>
                  {Object.entries(report?.placements || {}).map(
                    ([label, n]) => (
                      <div className="placement-row" key={label}>
                        <span>{label}</span>
                        <div className="bar">
                          <span
                            style={{
                              width: `${(Number(n) / Math.max(report.total, 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <strong>{String(n)}</strong>
                      </div>
                    ),
                  )}
                </section>
                <section className="panel">
                  <span className="eyebrow">QUICK ACCESS</span>
                  <h2>Keep information current</h2>
                  <p>
                    Manage profiles and record effective-dated changes in one
                    focused workspace.
                  </p>
                  <a className="action-link" href="#employees">
                    Open employee register
                    <ArrowRight size={17} />
                  </a>
                  <a className="action-link" href="#movements">
                    View movement history
                    <ArrowRight size={17} />
                  </a>
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Employee register</h2>
                    <p>Authorized recent register preview</p>
                  </div>
                  <a href="#employees">
                    View all
                    <ArrowRight size={16} />
                  </a>
                </div>
                <EmployeeTable
                  rows={rows.slice(0, 5)}
                  fields={fields}
                  layout={tableLayout}
                  onOpen={(r) => {
                    setEditing(r);
                    setDialog("employee");
                  }}
                />
              </section>
            </>
          )}
          {ctx && page === "employees" && (
            <section className="panel register">
              <div className="section-heading">
                <div>
                  <h2>
                    Employee register <span className="badge">{total}</span>
                  </h2>
                  <p>Primary assignment scope · authorized columns</p>
                </div>
                <div className="actions">
                  <button onClick={() => setDialog("columns")}>
                    <Columns3 size={16} />
                    Customize Columns
                  </button>
                  <button disabled={busy || !total} onClick={exportCSV}>
                    <Download size={16} />
                    Export CSV
                  </button>
                  {can("employee_create") && (
                    <button
                      className="primary"
                      onClick={() => {
                        setEditing(null);
                        setDialog("employee");
                      }}
                    >
                      <Plus size={16} />
                      Add employee
                    </button>
                  )}
                </div>
              </div>
              <FilterBar
                filter={filter}
                setFilter={setFilter}
                options={options}
              />
              <div className="advanced-filter">
                <SearchFilterPicker
                  mode="single"
                  label="Filter column"
                  options={readable.map((f) => ({
                    id: f.key,
                    label: f.label,
                    context: f.group_name,
                  }))}
                  value={columnFilter ? [columnFilter] : []}
                  onChange={(v) => setColumnFilter(v[0] || "")}
                />
                <SearchFilterPicker
                  mode="single"
                  label="Operator"
                  options={[
                    "contains",
                    "eq",
                    "empty",
                    "before",
                    "after",
                    "between",
                  ].map((id) => ({ id, label: id }))}
                  value={[operator]}
                  onChange={(v) => setOperator(v[0] || "eq")}
                />
                <input
                  aria-label="Column filter value"
                  placeholder={
                    operator === "between"
                      ? "JSON range: [1, 10]"
                      : "Filter value"
                  }
                  value={columnValue}
                  onChange={(e) => setColumnValue(e.target.value)}
                />
                <button
                  disabled={!columnFilter}
                  onClick={() => {
                    const f = fields.find((f) => f.key === columnFilter);
                    let value: unknown = columnValue;
                    try {
                      if (operator === "between")
                        value = JSON.parse(columnValue);
                      else if (f?.type === "integer" || f?.type === "decimal")
                        value = Number(columnValue);
                      else if (f?.type === "checkbox")
                        value = columnValue === "true";
                      setFilter({
                        ...filter,
                        predicates: [
                          ...filter.predicates,
                          { key: columnFilter, op: operator, value },
                        ],
                        offset: 0,
                      });
                    } catch {
                      setError("Enter a valid JSON range.");
                    }
                  }}
                >
                  Add filter
                </button>
                {filter.predicates.map((p, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setFilter({
                        ...filter,
                        predicates: filter.predicates.filter((_, j) => j !== i),
                        offset: 0,
                      })
                    }
                  >
                    {fields.find((f) => f.key === p.key)?.label} {p.op} ×
                  </button>
                ))}
              </div>
              <div className="register-tools">
                <SearchFilterPicker
                  mode="single"
                  label="Saved view"
                  options={[
                    { id: "default", label: "Default system view" },
                    ...ctx.views
                      .filter((v) => v.name !== "__active__")
                      .map((v) => ({ id: v.id, label: v.name })),
                  ]}
                  value={[]}
                  onChange={(v) => {
                    const view = ctx.views.find((x) => x.id === v[0]);
                    if (view) {
                      const safe = reconcileLayout(view.config, fields);
                      setLayout(safe);
                      setFilter(safe.filter);
                      if (safe.columns.length < view.config.columns.length)
                        setNotice(
                          "Some saved columns are unavailable under the current schema or permissions.",
                        );
                    } else {
                      setLayout({
                        columns: defaultColumns.filter((k) =>
                          readable.some((f) => f.key === k),
                        ),
                        pinned: ["employee_number", "name"],
                        filter: defaultFilter,
                      });
                      setFilter({ ...defaultFilter });
                    }
                  }}
                />
                <span>{selected.length} selected</span>
                <button
                  disabled={!total || total > 100}
                  onClick={async () => {
                    const r = await query("employees", {
                      ...filter,
                      limit: 100,
                      offset: 0,
                    });
                    setRows(r.items);
                    setSelected(r.items.map((e: Employee) => e.id));
                  }}
                >
                  Select all {total} matching (max 100)
                </button>
                {can("bulk_update") && (
                  <button
                    disabled={!selected.length}
                    onClick={() => setDialog("bulk")}
                  >
                    Bulk update
                  </button>
                )}
              </div>
              <EmployeeTable
                rows={rows}
                fields={fields}
                layout={tableLayout}
                selected={selected}
                onSelect={setSelected}
                onOpen={(r) => {
                  setEditing(r);
                  setDialog("employee");
                }}
                onSort={(key) =>
                  setFilter({
                    ...filter,
                    sort: key,
                    direction:
                      filter.sort === key && filter.direction === "asc"
                        ? "desc"
                        : "asc",
                    offset: 0,
                  })
                }
              />
              <div className="pagination">
                <span>
                  {total ? filter.offset + 1 : 0}–
                  {Math.min(filter.offset + filter.limit, total)} of {total}
                </span>
                <SearchFilterPicker
                  mode="single"
                  label="Rows per page"
                  options={[10, 25, 50, 100].map((n) => ({
                    id: String(n),
                    label: String(n),
                  }))}
                  value={[String(filter.limit)]}
                  onChange={(v) =>
                    setFilter({
                      ...filter,
                      limit: Number(v[0] || 25),
                      offset: 0,
                    })
                  }
                />
                <button
                  aria-label="Previous page"
                  disabled={!filter.offset}
                  onClick={() =>
                    setFilter({
                      ...filter,
                      offset: Math.max(0, filter.offset - filter.limit),
                    })
                  }
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  aria-label="Next page"
                  disabled={filter.offset + filter.limit >= total}
                  onClick={() =>
                    setFilter({
                      ...filter,
                      offset: filter.offset + filter.limit,
                    })
                  }
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}
          {ctx && page === "organization" && (
            <Organization
              options={options}
              canManage={!!can("organization_manage")}
              onSaved={refresh}
            />
          )}
          {ctx &&
            page === "fields" &&
            (can("schema_manage") ? (
              <FieldBuilder context={ctx} options={options} onSaved={refresh} />
            ) : (
              <p>Field administration access is required.</p>
            ))}
          {ctx &&
            page === "permissions" &&
            (ctx.profile.role === "superadmin" ? (
              <Security context={ctx} options={options} onSaved={refresh} />
            ) : (
              <p>Superadmin access is required.</p>
            ))}
          {ctx &&
            page === "sync" &&
            (can("sync_manage") ? (
              <Sync context={ctx} options={options} onSaved={refresh} />
            ) : (
              <p>Sync administration access is required.</p>
            ))}
          {ctx && page === "movements" && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Movement history</h2>
                  <p>
                    Seven transaction types, with effective dates and preserved
                    history.
                  </p>
                </div>
                {can("movement_create") && (
                  <button
                    className="primary"
                    onClick={() => setDialog("movement")}
                  >
                    <Plus size={16} />
                    New transaction
                  </button>
                )}
              </div>
              <SearchFilterPicker
                mode="multiple"
                label="Movement types"
                options={movementTypes}
                value={movementFilter}
                onChange={setMovementFilter}
              />
              {Array.isArray(report) && report.length ? (
                report.map((m: any) => (
                  <div className="timeline-item" key={m.id}>
                    <div>
                      <strong>
                        {movementTypes.find((x) => x.id === m.type)?.label}
                      </strong>
                      <p>
                        {m.employee_name || "Authorized employee"} ·{" "}
                        {m.effective_on}
                      </p>
                    </div>
                    <span className="badge">{m.state}</span>
                    {can("movement_correct") && m.state !== "Voided" && (
                      <button
                        onClick={async () => {
                          try {
                            const d = await query("employee", {
                              id: m.employee_id,
                            });
                            setCorrection({
                              ...m,
                              expected_version: d.employee.row_version,
                            });
                            setCorrectionReason("");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Void / correct
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty">
                  No accessible movement history. Create a transaction to record
                  a change.
                </div>
              )}
            </section>
          )}
          {ctx && page === "audit" && (
            <section className="panel">
              <h2>Audit history</h2>
              <p>
                Operational references are retained without unnecessary employee
                values.
              </p>
              {Array.isArray(report) && report.length ? (
                report.map((a: any) => (
                  <div className="field-row" key={a.id}>
                    <strong>{a.operation}</strong>
                    <span>
                      {a.entity} · {a.created_at}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty">No accessible audit events.</div>
              )}
            </section>
          )}
          {!ctx && !loading && (
            <section className="panel">
              <h2>Account access needs configuration</h2>
              <p>
                Your authenticated account must have an active user profile and
                explicit grants. A trusted administrator can enroll it.
              </p>
            </section>
          )}
        </main>
        <footer className="workspace-footer">
          Employee Information & Movement Tracker
          <span>Asia/Manila · Supabase canonical</span>
        </footer>
      </div>
      {ctx && dialog === "columns" && (
        <ColumnDesigner
          layout={tableLayout}
          fields={fields}
          rows={rows}
          onClose={() => setDialog(null)}
          onApply={async (draft, name) => {
            await mutate("save_view", { name, config: draft });
            await mutate("save_view", { name: "__active__", config: draft });
            setLayout(draft);
            refresh();
          }}
        />
      )}
      {ctx && dialog === "employee" && (
        <EmployeeEditor
          row={editing}
          context={ctx}
          options={options}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {dialog === "bulk" && (
        <BulkEditor
          rows={rows.filter((r) => selected.includes(r.id))}
          fields={fields}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {ctx && dialog === "movement" && (
        <MovementEditor
          rows={rows}
          options={options}
          today={ctx.today}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
      {correction && (
        <Dialog
          title="Void / correct movement"
          onClose={() => setCorrection(undefined)}
        >
          <div className="dialog-body">
            <p>
              Void {correction.type} effective {correction.effective_on}?
              History is retained. Later dependent events must be corrected
              first.
            </p>
            <label>
              Correction reason
              <textarea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                maxLength={1000}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer>
            <button onClick={() => setCorrection(undefined)}>Cancel</button>
            <button
              className="primary"
              disabled={busy || !correctionReason.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await mutate("void_movement", {
                    id: correction.id,
                    expected_version: correction.expected_version,
                    reason: correctionReason,
                  });
                  refresh();
                  setCorrection(undefined);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm void
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
