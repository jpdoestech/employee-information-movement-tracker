import { useMemo, type CSSProperties } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Hash,
  UserRound,
  Building2,
  BriefcaseBusiness,
  Activity,
  Fingerprint,
  Columns3,
  type LucideIcon,
} from "lucide-react";
import type { Employee, Field, Layout } from "../domain";
import { contentWidths, useFontMetrics } from "../tableSizing";
const columnIcons: Record<string, LucideIcon> = {
  employee_number: Hash,
  name: UserRound,
  client_employee_number: Fingerprint,
  status: Activity,
  position: BriefcaseBusiness,
  branch: Building2,
  client: BriefcaseBusiness,
};
const columnIcon = (key: string) => columnIcons[key] || Columns3;
export function EmployeeTable({
  rows,
  fields,
  layout,
  onOpen,
  onSort,
  selected = [],
  onSelect,
  preview = false,
  rowNumbersAllowed = false,
}: {
  rows: Employee[];
  fields: Field[];
  layout: Layout;
  onOpen?: (row: Employee) => void;
  onSort?: (key: string) => void;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  preview?: boolean;
  rowNumbersAllowed?: boolean;
}) {
  const numbered = rowNumbersAllowed && layout.showRowNumbers !== false;
  const leadingWidth = (numbered ? 48 : 0) + (onSelect ? 44 : 0);
  const columns = layout.columns.filter((k) =>
    fields.some((f) => f.key === k && f.actions.includes("R")),
  );
  const pinned = layout.pinned.filter((k) => columns.includes(k));
  const order = [...pinned, ...columns.filter((k) => !pinned.includes(k))];
  const fontReady = useFontMetrics();
  const widths = useMemo(() => {
    const sized = contentWidths(
      columns.map((key) => fields.find((f) => f.key === key)?.label || key),
      rows.map((row) => columns.map((key) => String(row.values[key] ?? "—"))),
      66,
    );
    return Object.fromEntries(columns.map((key, i) => [key, sized[i]]));
  }, [rows, fields, columns.join("|"), fontReady]);
  const width = (key: string) => widths[key];
  function style(k: string): CSSProperties {
    return {
      width: width(k),
      minWidth: width(k),
      "--pin-left": `${pinned.slice(0, pinned.indexOf(k)).reduce((n, c) => n + width(c), 0) + leadingWidth}px`,
    } as CSSProperties;
  }
  function cls(k: string) {
    const i = pinned.indexOf(k);
    return i >= 0
      ? `pinned pin-${i}${i === pinned.length - 1 ? " pin-edge" : ""}`
      : "";
  }
  return (
    <div
      className="table-region"
      tabIndex={0}
      style={
        { "--row-number-width": `${numbered ? 48 : 0}px` } as CSSProperties
      }
      aria-label={preview ? "Live column preview" : "Scrollable employee table"}
    >
      <table
        style={{
          width: order.reduce((s, k) => s + width(k), leadingWidth),
          minWidth: order.reduce((s, k) => s + width(k), leadingWidth),
        }}
      >
        <caption className="sr-only">
          {preview
            ? "Draft table layout preview"
            : "Employees: authorized columns only"}
        </caption>
        <thead>
          <tr>
            {numbered && (
              <th className="row-ordinal" scope="col" aria-label="Row number">
                No.
              </th>
            )}
            {onSelect && (
              <th className="selection">
                <input
                  type="checkbox"
                  aria-label="Select visible employees"
                  checked={
                    rows.length > 0 &&
                    rows.every((r) => selected.includes(r.id))
                  }
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        rows.some((r) => selected.includes(r.id)) &&
                        !rows.every((r) => selected.includes(r.id));
                  }}
                  onChange={(e) =>
                    onSelect(e.target.checked ? rows.map((r) => r.id) : [])
                  }
                />
              </th>
            )}
            {order.map((k) => (
              <th
                key={k}
                className={cls(k)}
                style={style(k)}
                scope="col"
                aria-sort={
                  layout.filter.sort === k
                    ? layout.filter.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                {onSort ? (
                  <button type="button" onClick={() => onSort(k)}>
                    <span className="column-heading">
                      {(() => {
                        const Icon = columnIcon(k);
                        return <Icon size={14} aria-hidden />;
                      })()}
                      {fields.find((f) => f.key === k)?.label}
                    </span>
                    {layout.filter.sort === k ? (
                      layout.filter.direction === "asc" ? (
                        <ArrowUp size={13} aria-hidden />
                      ) : (
                        <ArrowDown size={13} aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown size={13} aria-hidden />
                    )}
                  </button>
                ) : (
                  <span className="table-header-label">
                    {fields.find((f) => f.key === k)?.label}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className={`${selected.includes(row.id) ? "selected-row" : ""}${onOpen ? " employee-record-row" : ""}`}
              aria-selected={onSelect ? selected.includes(row.id) : undefined}
              tabIndex={onOpen ? 0 : undefined}
              onClick={
                onOpen
                  ? (event) => {
                      if (
                        (event.target as Element).closest(
                          "button,a,input,select,textarea",
                        )
                      )
                        return;
                      onOpen(row);
                    }
                  : undefined
              }
              onKeyDown={
                onOpen
                  ? (event) => {
                      if (
                        event.target !== event.currentTarget ||
                        !["Enter", " "].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      onOpen(row);
                    }
                  : undefined
              }
            >
              {numbered && (
                <td className="row-ordinal">
                  {(preview ? 0 : layout.filter.offset) + rowIndex + 1}
                </td>
              )}
              {onSelect && (
                <td className="selection">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.values.employee_number || "record"}`}
                    checked={selected.includes(row.id)}
                    onChange={(e) =>
                      onSelect(
                        e.target.checked
                          ? [...selected, row.id]
                          : selected.filter((x) => x !== row.id),
                      )
                    }
                  />
                </td>
              )}
              {order.map((k, i) => (
                <td
                  key={k}
                  className={`${cls(k)} ${k === "name" ? "employee-name" : k === "employee_number" ? "employee-id" : ""}`}
                  style={style(k)}
                  title={String(row.values[k] ?? "—")}
                >
                  {i === 0 && onOpen ? (
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => onOpen(row)}
                    >
                      {String(row.values[k] ?? "—")}
                    </button>
                  ) : k === "status" ? (
                    <span
                      className={`badge ${row.values[k] === "Active" ? "success" : ""}`}
                    >
                      {String(row.values[k] ?? "—")}
                    </span>
                  ) : (
                    <span className="cell-value">
                      {String(row.values[k] ?? "—")}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <strong>No employees match</strong>
          <p>Adjust your filters or add an authorized employee.</p>
        </div>
      )}
    </div>
  );
}
