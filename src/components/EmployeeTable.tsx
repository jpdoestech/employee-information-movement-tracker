import type { CSSProperties } from "react";
import { ArrowUpDown } from "lucide-react";
import type { Employee, Field, Layout } from "../domain";
const width = (k: string) =>
  k === "employee_number" ? 152 : k === "name" ? 232 : 188;
export function EmployeeTable({
  rows,
  fields,
  layout,
  onOpen,
  onSort,
  selected = [],
  onSelect,
  preview = false,
}: {
  rows: Employee[];
  fields: Field[];
  layout: Layout;
  onOpen?: (row: Employee) => void;
  onSort?: (key: string) => void;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  preview?: boolean;
}) {
  const columns = layout.columns.filter((k) =>
    fields.some((f) => f.key === k && f.actions.includes("R")),
  );
  const pinned = layout.pinned.filter((k) => columns.includes(k));
  const order = [...pinned, ...columns.filter((k) => !pinned.includes(k))];
  function style(k: string): CSSProperties {
    return {
      width: width(k),
      minWidth: width(k),
      "--pin-left": `${pinned.slice(0, pinned.indexOf(k)).reduce((n, c) => n + width(c), 0) + (onSelect ? 44 : 0)}px`,
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
      aria-label={preview ? "Live column preview" : "Scrollable employee table"}
    >
      <table
        style={{
          minWidth: order.reduce((s, k) => s + width(k), onSelect ? 44 : 0),
        }}
      >
        <caption className="sr-only">
          {preview
            ? "Draft table layout preview"
            : "Employees: authorized columns only"}
        </caption>
        <thead>
          <tr>
            {onSelect && (
              <th className="selection">
                <input
                  type="checkbox"
                  aria-label="Select visible employees"
                  checked={
                    rows.length > 0 &&
                    rows.every((r) => selected.includes(r.id))
                  }
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
                    {fields.find((f) => f.key === k)?.label}
                    <ArrowUpDown size={13} aria-hidden />
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
          {rows.map((row) => (
            <tr key={row.id}>
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
                <td key={k} className={cls(k)} style={style(k)}>
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
                    String(row.values[k] ?? "—")
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
