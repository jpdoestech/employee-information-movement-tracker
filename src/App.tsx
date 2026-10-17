import { RecordExplorer } from "./components/RecordExplorer";
import { Appearance, SidebarToggle } from "./components/Appearance";
import { refreshContext } from "./refreshContext";
import { RowsPerPage } from "./components/RowsPerPage";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ChevronRight,
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
  PencilLine,
  X,
} from "lucide-react";
import { FloatingNotification } from "./components/FloatingNotification";
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
  const [mobileNavigation, setMobileNavigation] = useState(
    () => matchMedia("(max-width:760px)").matches,
  );
  const navigation = useRef<HTMLElement>(null);
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
    [activeViewId, setActiveViewId] = useState(""),
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
    [busy, setBusy] = useState(false);
  const loadedUser = useRef<string | null>(null);
  const fetchedSearch = useRef(filter.search);
  useEffect(() => {
    const media = matchMedia("(max-width:760px)");
    const update = () => {
      setMobileNavigation(media.matches);
      setMenu(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!menu || !mobileNavigation) return;
    const previous = document.activeElement as HTMLElement;
    navigation.current?.querySelector<HTMLElement>("button,a")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key === "Tab") {
        const items = Array.from(
          navigation.current!.querySelectorAll<HTMLElement>("button,a"),
        ).filter((item) => item.getClientRects().length);
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [menu, mobileNavigation]);
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
    const stop = refreshContext(fetch);
    return () => {
      active = false;
      stop();
    };
  }, [authenticated, version]);
  useEffect(() => {
    if (!ctx || !["employees", "dashboard"].includes(page)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () => {
        fetchedSearch.current = filter.search;
        Promise.all([
          page === "employees"
            ? query("employees", filter)
            : Promise.resolve(undefined),
          page === "dashboard"
            ? query("dashboard")
            : Promise.resolve(undefined),
        ])
          .then(([result, r]) => {
            if (active) {
              if (result && filter.offset && filter.offset >= result.total) {
                setFilter((f) => ({
                  ...f,
                  offset:
                    Math.max(0, Math.ceil(result.total / f.limit) - 1) *
                    f.limit,
                }));
                return;
              }
              setRows(result?.items || []);
              setTotal(result?.total || 0);
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
      },
      filter.search === fetchedSearch.current ? 0 : 180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ctx?.revision, page, JSON.stringify(filter), version]);
  const fields = ctx?.fields || [];
  const can = (c: string) => ctx?.capabilities.includes(c);
  const readable = fields.filter((f) => f.actions.includes("R") && f.active);
  const tableLayout = { ...layout, filter };
  const currentNav = nav.find((n) => n.id === page) || nav[0];
  const visibleNav = nav.filter(
    (n) =>
      !["fields", "permissions", "sync", "audit"].includes(n.id) ||
      (n.id === "fields"
        ? can("schema_manage")
        : n.id === "permissions"
          ? ctx?.profile.role === "superadmin"
          : n.id === "sync"
            ? can("sync_manage")
            : can("audit_read")),
  );
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
          <span className="eyebrow">EMPLOYEE TRACKER</span>
          <h1>Employee information & movement</h1>
          <p>Employee records, branch assignments, and movement history.</p>
          <div className="login-modules" aria-label="Workspace features">
            <span>
              <Users size={20} aria-hidden="true" />
              Employee register
            </span>
            <span>
              <Building2 size={20} aria-hidden="true" />
              Branches & clients
            </span>
            <span>
              <GitBranch size={20} aria-hidden="true" />
              Movement records
            </span>
          </div>
          <div className="login-statement">
            <ShieldCheck size={22} />
            <span>Access is controlled by your account permissions.</span>
          </div>
        </section>
        <section className="login-form">
          <div className="login-appearance">
            <Appearance />
          </div>
          <span className="eyebrow">ACCOUNT ACCESS</span>
          <h2>Sign in</h2>
          <p>Use your authorized company account.</p>
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
            <FloatingNotification onDismiss={() => setError("")}>
              {error}
            </FloatingNotification>
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
      <aside
        ref={navigation}
        className={menu ? "sidebar open" : "sidebar"}
        inert={mobileNavigation && !menu}
        role={mobileNavigation ? "dialog" : undefined}
        aria-label={mobileNavigation ? "Navigation" : undefined}
        aria-modal={mobileNavigation && menu ? true : undefined}
      >
        {mobileNavigation && (
          <button
            className="mobile-navigation-close"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          >
            <X size={18} aria-hidden />
          </button>
        )}
        <a className="brand" href="#dashboard">
          <span className="brandmark">
            <GitBranch size={22} />
          </span>
          <span>
            Employee Tracker<small>INFORMATION & MOVEMENT</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation" id="workspace-navigation">
          {visibleNav.map((n) => (
            <Fragment key={n.id}>
              {n.id === "organization" && (
                <span className="nav-group-label">ADMINISTRATION</span>
              )}
              <a
                key={n.id}
                title={n.label}
                aria-label={n.label}
                href={`#${n.id}`}
                className={page === n.id ? "active" : ""}
                aria-current={page === n.id ? "page" : undefined}
              >
                <n.icon size={18} aria-hidden="true" />
                <span className="rail-label">{n.label}</span>
              </a>
            </Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={19} />
          <p>
            Controlled access<small>Employee workspace</small>
          </p>
        </div>
      </aside>
      {menu && (
        <div
          className="nav-scrim"
          aria-hidden="true"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace" inert={mobileNavigation && menu}>
        <header className="topbar">
          <SidebarToggle />
          <button
            className="menu-button"
            aria-label="Open navigation"
            aria-expanded={menu}
            aria-controls="workspace-navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={22} />
          </button>
          <nav className="workspace-title" aria-label="Breadcrumb">
            <a className="breadcrumb" href="#dashboard">
              Workspace
            </a>
            <ChevronRight
              className="breadcrumb-divider"
              size={14}
              aria-hidden
            />
            <h1 aria-current="page">{currentNav.label}</h1>
          </nav>
          <div className="account">
            <Appearance />
            {isDemo() && (
              <span
                className="environment-badge"
                title="Fictional records. Changes stay in memory."
              >
                Demo
                <span className="sr-only">
                  : fictional records; changes are not saved to the database.
                </span>
              </span>
            )}
            <button
              aria-label="Refresh authorized data"
              title="Refresh data"
              onClick={() => setVersion((v) => v + 1)}
            >
              <RefreshCw size={17} aria-hidden="true" />
            </button>
            <span className="avatar">
              {ctx?.profile.display_name.slice(0, 1) || "A"}
            </span>
            <span className="account-name">
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
        <div className="notification-stack" aria-label="Notifications">
          {notice && (
            <FloatingNotification kind="notice" onDismiss={() => setNotice("")}>
              {notice}
            </FloatingNotification>
          )}
          {error && (
            <FloatingNotification onDismiss={() => setError("")}>
              {error}
            </FloatingNotification>
          )}
          {loading && (
            <FloatingNotification kind="loading">
              Loading authorized data...
            </FloatingNotification>
          )}
        </div>
        <main id="main" tabIndex={-1}>
          {ctx && page === "dashboard" && (
            <>
              <div className="stats">
                <a href="#employees" className="stat">
                  <span className="stat-label">
                    Total employees
                    <Users size={18} aria-hidden="true" />
                  </span>
                  <strong>{report?.total ?? "—"}</strong>
                  <small>Within your access scope</small>
                </a>
                <div className="stat">
                  <span className="stat-label">
                    Active employees
                    <ShieldCheck size={18} aria-hidden="true" />
                  </span>
                  <strong>{report?.statuses?.Active ?? "—"}</strong>
                  <small>Effective status today</small>
                </div>
                <div className="stat">
                  <span className="stat-label">
                    Head Office
                    <Building2 size={18} aria-hidden="true" />
                  </span>
                  <strong>{report?.placements?.["Head Office"] ?? "—"}</strong>
                  <small>Primary placement</small>
                </div>
                <div className="stat">
                  <span className="stat-label">
                    Unassigned
                    <GitBranch size={18} aria-hidden="true" />
                  </span>
                  <strong>{report?.placements?.Unassigned ?? "—"}</strong>
                  <small>Awaiting primary placement</small>
                </div>
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>People by placement</h2>
                      <p>Current primary assignments</p>
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
                  <div className="section-heading">
                    <div>
                      <h2>Employee status</h2>
                      <p>Effective status today</p>
                    </div>
                    <Users size={20} aria-hidden="true" />
                  </div>
                  <dl className="status-summary">
                    {Object.entries(report?.statuses || {}).map(
                      ([label, count]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{String(count)}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                  <a className="action-link" href="#employees">
                    Employee register
                    <ArrowRight size={17} />
                  </a>
                  <a className="action-link" href="#movements">
                    Movement history
                    <ArrowRight size={17} />
                  </a>
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Employee register</h2>
                    <p>Recent records within your access scope</p>
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
                  rowNumbersAllowed={ctx.register_settings.row_numbers_allowed}
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
                <div className="actions">
                  <button
                    aria-label="Customize Columns"
                    title="Customize columns"
                    onClick={() => setDialog("columns")}
                  >
                    <Columns3 size={16} />
                    <span className="action-label">Customize Columns</span>
                  </button>
                  <button
                    aria-label="Export CSV"
                    title="Export CSV"
                    disabled={busy || !total}
                    onClick={exportCSV}
                  >
                    <Download size={16} />
                    <span className="action-label">Export CSV</span>
                  </button>
                  {can("employee_create") && (
                    <button
                      className="primary"
                      aria-label="Add employee"
                      onClick={() => {
                        setEditing(null);
                        setDialog("employee");
                      }}
                    >
                      <Plus size={16} />
                      <span className="action-label">Add employee</span>
                      <span className="mobile-action-label" aria-hidden="true">
                        Add
                      </span>
                    </button>
                  )}
                </div>
              </div>
              <FilterBar
                filter={filter}
                setFilter={setFilter}
                options={options}
                context={ctx}
                onSaved={refresh}
              >
                <SearchFilterPicker
                  mode="single"
                  label="Saved view"
                  compactLabel="Views"
                  options={[
                    { id: "default", label: "Default system view" },
                    ...ctx.views
                      .filter((v) => v.name !== "__active__")
                      .map((v) => ({ id: v.id, label: v.name })),
                  ]}
                  value={activeViewId ? [activeViewId] : []}
                  onChange={(v) => {
                    setActiveViewId(v[0] || "");
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
              </FilterBar>
              {selected.length > 0 && (
                <div className="register-tools">
                  {selected.length > 0 && (
                    <span className="selection-count" role="status">
                      {selected.length} selected
                    </span>
                  )}
                  {selected.length > 0 && (
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
                      Select all {total} matching
                    </button>
                  )}
                  {can("bulk_update") && selected.length > 0 && (
                    <button
                      disabled={!selected.length}
                      onClick={() => setDialog("bulk")}
                    >
                      <PencilLine size={14} aria-hidden />
                      Bulk update
                    </button>
                  )}
                  {selected.length > 0 && (
                    <button onClick={() => setSelected([])}>
                      <X size={14} aria-hidden />
                      Clear selection
                    </button>
                  )}
                </div>
              )}
              <EmployeeTable
                rows={rows}
                fields={fields}
                layout={tableLayout}
                rowNumbersAllowed={ctx.register_settings.row_numbers_allowed}
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
                <RowsPerPage
                  value={filter.limit}
                  onChange={(limit) =>
                    setFilter({
                      ...filter,
                      limit,
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
              revision={ctx.revision}
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
            <RecordExplorer
              kind="movements"
              options={options}
              revision={`${ctx.revision}:${version}`}
              onCreate={
                can("movement_create") ? () => setDialog("movement") : undefined
              }
              onCorrect={
                can("movement_correct")
                  ? async (m) => {
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
                    }
                  : undefined
              }
            />
          )}
          {ctx && page === "audit" && (
            <RecordExplorer
              kind="audit"
              revision={`${ctx.revision}:${version}`}
            />
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
          <span className="footer-title">
            Employee Information & Movement Tracker
          </span>
          <span>Asia/Manila · Employee records</span>
        </footer>
      </div>
      {ctx && dialog === "columns" && (
        <ColumnDesigner
          layout={tableLayout}
          rowNumbersAllowed={ctx.register_settings.row_numbers_allowed}
          fields={fields}
          onClose={() => setDialog(null)}
          onApply={async (draft, name) => {
            await mutate("save_view", { name, config: draft });
            await mutate(
              "save_view",
              { name: "__active__", config: draft },
              undefined,
              true,
            );
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
              <FloatingNotification onDismiss={() => setError("")}>
                {error}
              </FloatingNotification>
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
