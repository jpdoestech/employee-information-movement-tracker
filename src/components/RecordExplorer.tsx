import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Search,
  RotateCcw,
  ListFilter,
  Plus,
  UserRound,
  GitBranch,
  CalendarDays,
  CircleDot,
  AlignLeft,
  Undo2,
} from "lucide-react";
import { query } from "../api";
import { contentWidths, useFontMetrics } from "../tableSizing";
import { RowsPerPage } from "./RowsPerPage";
import { movementTypes, type Option } from "../domain";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { Popover } from "./Popover";
import { FloatingNotification } from "./FloatingNotification";

export type RecordRow = {
  id: string;
  employee_id?: string;
  employee_name?: string;
  employee_number?: string;
  type?: string;
  effective_on?: string;
  state?: string;
  reason?: string;
  from_value?: string;
  to_value?: string;
  operation?: string;
  entity?: string;
  entity_id?: string;
  created_at?: string;
  kind?: string;
  label?: string;
  context?: string;
  code?: string;
  active?: boolean;
  row_version?: number;
  branch_id?: string;
};
type ListFilter = {
  search: string;
  types: string[];
  states: string[];
  branches: string[];
  clients: string[];
  from: string;
  to: string;
  sort: string;
  direction: "asc" | "desc";
  limit: number;
  offset: number;
};
export function RecordExplorer({
  kind,
  revision,
  options = [],
  onCreate,
  onEdit,
  onCorrect,
}: {
  kind: "movements" | "audit" | "organization";
  revision: string | number;
  options?: Option[];
  onCreate?: () => void;
  onEdit?: (row: RecordRow) => void;
  onCorrect?: (row: RecordRow) => void;
}) {
  const initial: ListFilter = {
    search: "",
    types: [],
    states: [],
    branches: [],
    clients: [],
    from: "",
    to: "",
    sort:
      kind === "organization"
        ? "label"
        : kind === "audit"
          ? "created_at"
          : "effective_on",
    direction: kind === "organization" ? "asc" : "desc",
    limit: 25,
    offset: 0,
  };
  const [filter, setFilter] = useState(initial),
    [data, setData] = useState<{ items: RecordRow[]; total: number }>({
      items: [],
      total: 0,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const set = (patch: Partial<ListFilter>) =>
    setFilter((f) => ({ ...f, ...patch, offset: 0 }));
  const fetchedSearch = useRef(filter.search);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () => {
        fetchedSearch.current = filter.search;
        query<{ items: RecordRow[]; total: number }>("record_page", {
          kind,
          ...filter,
        })
          .then((r) => {
            if (!active) return;
            if (filter.offset && filter.offset >= r.total) {
              setFilter((f) => ({
                ...f,
                offset: Math.max(0, Math.ceil(r.total / f.limit) - 1) * f.limit,
              }));
              return;
            }
            setData(r);
          })
          .catch((e) => {
            if (active) {
              setError(e.message);
              setData({ items: [], total: 0 });
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
  }, [kind, revision, JSON.stringify(filter)]);
  const title =
    kind === "movements"
      ? "Movement history"
      : kind === "audit"
        ? "Recorded activity"
        : "Branches and clients";
  const choices =
    kind === "movements"
      ? movementTypes
      : [
          { id: "branch", label: "Branches" },
          { id: "client", label: "Clients" },
          { id: "head_office", label: "Head Office" },
        ];
  const count =
    filter.branches.length +
    filter.clients.length +
    filter.states.length +
    Number(!!filter.from) +
    Number(!!filter.to);
  const changeSort = (key: string) =>
    set({
      sort: key,
      direction:
        filter.sort === key && filter.direction === "asc" ? "desc" : "asc",
    });
  const heading = (key: string, label: string) => (
    <th
      aria-sort={
        filter.sort === key
          ? filter.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button onClick={() => changeSort(key)}>
        <span className="record-column-label">
          {key === "type" && <GitBranch size={13} aria-hidden />}
          {key === "effective_on" && <CalendarDays size={13} aria-hidden />}
          {label}
        </span>
        {filter.sort === key &&
          (filter.direction === "asc" ? (
            <ArrowUp size={13} />
          ) : (
            <ArrowDown size={13} />
          ))}
      </button>
    </th>
  );
  const when = (value?: string) =>
    value
      ? new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";
  let headers: ReactNode, columns: number;
  if (kind === "movements") {
    headers = (
      <>
        <th>
          <span className="record-column-label">
            <UserRound size={13} aria-hidden />
            Employee
          </span>
        </th>
        {heading("type", "Transaction")}
        <th>
          <span className="record-column-label">
            <ArrowLeft size={13} aria-hidden />
            From
          </span>
        </th>
        <th>
          <span className="record-column-label">
            <ArrowRight size={13} aria-hidden />
            To
          </span>
        </th>
        {heading("effective_on", "Effective date")}
        <th>
          <span className="record-column-label">
            <CircleDot size={13} aria-hidden />
            State
          </span>
        </th>
        <th>
          <span className="record-column-label">
            <AlignLeft size={13} aria-hidden />
            Reason
          </span>
        </th>
        <th>Actions</th>
      </>
    );
    columns = 8;
  } else if (kind === "audit") {
    headers = (
      <>
        {heading("operation", "Operation")}
        {heading("entity", "Entity")}
        <th>Record reference</th>
        <th>
          <span className="record-column-label">
            <ArrowLeft size={13} aria-hidden />
            From
          </span>
        </th>
        <th>
          <span className="record-column-label">
            <ArrowRight size={13} aria-hidden />
            To
          </span>
        </th>
        {heading("created_at", "Recorded (Manila)")}
      </>
    );
    columns = 6;
  } else {
    headers = (
      <>
        {heading("label", "Organization")}
        <th>Code</th>
        <th>Type</th>
        <th>Parent branch</th>
        <th>Status</th>
        <th>
          <span className="sr-only">Actions</span>
        </th>
      </>
    );
    columns = 6;
  }
  const columnLabels =
    kind === "movements"
      ? [
          "Employee",
          "Transaction",
          "From",
          "To",
          "Effective date",
          "State",
          "Reason",
          "Actions",
        ]
      : kind === "audit"
        ? [
            "Operation",
            "Entity",
            "Record reference",
            "From",
            "To",
            "Recorded (Manila)",
          ]
        : [
            "Organization",
            "Code",
            "Type",
            "Parent branch",
            "Status",
            "Actions",
          ];
  useFontMetrics();
  const recordWidths = contentWidths(
    columnLabels,
    data.items.map((r) =>
      kind === "movements"
        ? [
            r.employee_name || r.employee_number || "Authorized employee",
            movementTypes.find((t) => t.id === r.type)?.label || r.type || "",
            r.from_value || "—",
            r.to_value || "—",
            r.effective_on || "",
            r.state || "",
            r.reason || "—",
            onCorrect ? "Correct" : "",
          ]
        : kind === "audit"
          ? [
              r.operation?.replaceAll("_", " ") || "",
              r.entity || "",
              r.entity_id?.slice(0, 8) || "",
              r.from_value || "—",
              r.to_value || "—",
              when(r.created_at),
            ]
          : [
              r.label || "",
              r.code || "",
              r.kind?.replaceAll("_", " ") || "",
              r.kind === "client" ? r.context || "" : "—",
              r.active ? "Active" : "Inactive",
              onEdit ? "Edit" : "",
            ],
    ),
    60,
    kind === "movements"
      ? ["", "", "", "", "text-date"]
      : kind === "audit"
        ? ["", "", "text-id", "", "", "text-date"]
        : ["", "text-id"],
  );
  // The date heading includes a type icon and sort direction in addition to text.
  if (kind === "movements") recordWidths[4] = Math.max(recordWidths[4], 160);
  return (
    <section className="panel data-panel record-explorer">
      <div className="filterbar workspace-toolbar">
        <label className="search-control">
          <Search size={16} aria-hidden />
          <input
            type="search"
            aria-label={`Search ${kind}`}
            placeholder="Search…"
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>
        {kind !== "audit" && (
          <SearchFilterPicker
            mode="multiple"
            label={
              kind === "movements" ? "Movement types" : "Organization types"
            }
            options={choices}
            value={filter.types}
            onChange={(types) => set({ types })}
          />
        )}
        <Popover label="More filters" icon={ListFilter} count={count}>
          <div className="record-filter-editor">
            {kind !== "audit" && (
              <>
                <SearchFilterPicker
                  mode="multiple"
                  label="Branches"
                  options={options.filter((o) => o.kind === "branch")}
                  value={filter.branches}
                  onChange={(branches) =>
                    set({
                      branches,
                      clients: filter.clients.filter((id) =>
                        options.some(
                          (o) =>
                            o.id === id &&
                            (!branches.length ||
                              branches.includes(o.branch_id || "")),
                        ),
                      ),
                    })
                  }
                />
                {kind === "movements" && (
                  <SearchFilterPicker
                    mode="multiple"
                    label="Clients"
                    options={options.filter(
                      (o) =>
                        o.kind === "client" &&
                        (!filter.branches.length ||
                          filter.branches.includes(o.branch_id || "")),
                    )}
                    value={filter.clients}
                    onChange={(clients) => set({ clients })}
                  />
                )}
              </>
            )}
            {kind === "movements" && (
              <SearchFilterPicker
                mode="multiple"
                label="Movement state"
                options={["Scheduled", "Effective", "Past", "Voided"].map(
                  (id) => ({ id, label: id }),
                )}
                value={filter.states}
                onChange={(states) => set({ states })}
              />
            )}
            {kind !== "organization" && (
              <div className="form-grid">
                <label>
                  From date
                  <input
                    type="date"
                    value={filter.from}
                    onChange={(e) => set({ from: e.target.value })}
                  />
                </label>
                <label>
                  Through date
                  <input
                    type="date"
                    value={filter.to}
                    min={filter.from || undefined}
                    onChange={(e) => set({ to: e.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        </Popover>
        <button
          className="filter-reset"
          aria-label="Reset filters"
          title="Reset filters"
          onClick={() => setFilter(initial)}
        >
          <RotateCcw size={16} />
          <span>Reset</span>
        </button>
        {onCreate && (
          <div className="toolbar-actions">
            <button className="primary" onClick={onCreate}>
              <Plus size={16} />
              <span>
                {kind === "movements" ? "New transaction" : "Add organization"}
              </span>
            </button>
          </div>
        )}
      </div>
      <div
        className="data-scroll-region"
        tabIndex={0}
        role="region"
        aria-label={
          kind === "movements"
            ? "Movement records"
            : kind === "audit"
              ? "Audit records"
              : "Organization records"
        }
        aria-busy={loading}
      >
        <table
          className="record-table"
          aria-label={title}
          style={{
            width: recordWidths.reduce((sum, width) => sum + width, 0),
            minWidth: recordWidths.reduce((sum, width) => sum + width, 0),
          }}
        >
          <colgroup>
            {recordWidths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>{headers}</tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                {kind === "movements" ? (
                  <>
                    <td
                      title={[r.employee_name, r.employee_number]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <strong>
                        {r.employee_name ||
                          r.employee_number ||
                          "Authorized employee"}
                      </strong>
                      {r.employee_name && (
                        <small className="text-id">{r.employee_number}</small>
                      )}
                    </td>
                    <td>
                      {movementTypes.find((t) => t.id === r.type)?.label ||
                        r.type}
                    </td>
                    <td title={r.from_value || "—"}>{r.from_value || "—"}</td>
                    <td title={r.to_value || "—"}>{r.to_value || "—"}</td>
                    <td className="text-date">{r.effective_on}</td>
                    <td>
                      <span className="badge">{r.state}</span>
                    </td>
                    <td title={r.reason || "—"}>{r.reason || "—"}</td>
                    <td>
                      {onCorrect && r.state !== "Voided" && (
                        <button
                          className="record-correct"
                          aria-label="Void / correct"
                          title="Void or correct this transaction"
                          onClick={() => onCorrect(r)}
                        >
                          <Undo2 size={14} aria-hidden />
                          Correct
                        </button>
                      )}
                    </td>
                  </>
                ) : kind === "audit" ? (
                  <>
                    <td title={r.operation?.replaceAll("_", " ")}>
                      {r.operation?.replaceAll("_", " ")}
                    </td>
                    <td>{r.entity || "—"}</td>
                    <td>
                      <code title={r.entity_id}>
                        {r.entity_id?.slice(0, 8) || "—"}
                      </code>
                    </td>
                    <td title={r.from_value || "—"}>{r.from_value || "—"}</td>
                    <td title={r.to_value || "—"}>{r.to_value || "—"}</td>
                    <td className="text-date">{when(r.created_at)}</td>
                  </>
                ) : (
                  <>
                    <td title={r.label}>
                      <strong>{r.label}</strong>
                    </td>
                    <td className="text-id">{r.code || "—"}</td>
                    <td>{r.kind?.replaceAll("_", " ")}</td>
                    <td title={r.kind === "client" ? r.context : undefined}>
                      {r.kind === "client" ? r.context : "—"}
                    </td>
                    <td>
                      <span className="badge">
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {onEdit && r.kind !== "head_office" && (
                        <button
                          aria-label={`Edit ${r.label}`}
                          onClick={() => onEdit(r)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!data.items.length && (
              <tr>
                <td colSpan={columns} className="empty">
                  {loading ? "Loading records…" : "No matching records."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          {data.total ? filter.offset + 1 : 0}–
          {Math.min(filter.offset + data.items.length, data.total)} of{" "}
          {data.total}
        </span>
        <RowsPerPage
          value={filter.limit}
          onChange={(limit) => set({ limit })}
        />
        <button
          aria-label="Previous page"
          disabled={!filter.offset || loading}
          onClick={() =>
            setFilter((f) => ({
              ...f,
              offset: Math.max(0, f.offset - f.limit),
            }))
          }
        >
          <ArrowLeft size={16} />
        </button>
        <button
          aria-label="Next page"
          disabled={loading || filter.offset + filter.limit >= data.total}
          onClick={() =>
            setFilter((f) => ({ ...f, offset: f.offset + f.limit }))
          }
        >
          <ArrowRight size={16} />
        </button>
      </div>
      {loading && (
        <FloatingNotification kind="loading">
          Loading records…
        </FloatingNotification>
      )}
      {error && (
        <FloatingNotification onDismiss={() => setError("")}>
          {error}
        </FloatingNotification>
      )}
    </section>
  );
}
