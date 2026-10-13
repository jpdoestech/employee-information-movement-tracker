import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff, Pencil } from "lucide-react";
import type { Context, Field } from "../domain";
import { displayFieldValue } from "../fieldValues";
import { fieldTextRole } from "../typography";
import { fullYears, maskedIdentifier, overviewDate } from "../employeeOverview";
type Entry = {
  key: string;
  label: string;
  value: ReactNode;
  role?: string;
  wide?: boolean;
  column?: "left" | "right";
};
export function EmployeeOverview({
  values,
  fields,
  groups,
  today,
  employeeId,
  onEdit,
}: {
  values: Record<string, unknown>;
  fields: Field[];
  groups: Context["groups"];
  today: string;
  employeeId: string;
  canEdit: boolean;
  onEdit: (groupId?: string) => void;
}) {
  const readable = fields.filter(
    (f) =>
      f.active &&
      f.actions.includes("R") &&
      groups.some((g) => g.id === f.group_id && g.active),
  );
  const governmentKeys = readable
    .filter((f) => f.validation?.government_id_digits)
    .map((f) => f.key)
    .join("|");
  const [unmasked, setUnmasked] = useState(false);
  useEffect(() => setUnmasked(false), [employeeId, governmentKeys]);
  const entries = new Map<string, Entry[]>();
  const used = new Set([
    "name",
    "last_name",
    "first_name",
    "middle_name",
    "suffix",
    "status_reason",
  ]);
  function add(groupId: string, entry: Entry) {
    entries.set(groupId, [...(entries.get(groupId) || []), entry]);
  }
  for (const prefix of ["", "current_"]) {
    const addressFields = [
      "address",
      "barangay",
      "city_municipality",
      "province",
      "postal_code",
    ]
      .map((key) => readable.find((f) => f.key === prefix + key))
      .filter((f): f is Field => !!f);
    if (!addressFields.length) continue;
    const group = addressFields[0].form_group_id || addressFields[0].group_id;
    const text = addressFields
      .map((f) => values[f.key])
      .filter((v) => typeof v === "string" && v.trim())
      .join(", ");
    add(group, {
      key: prefix + "summary-address",
      label: prefix ? "Current Address" : "Home Address",
      value: text || "—",
      wide: true,
    });
    addressFields.forEach((f) => used.add(f.key));
  }
  for (const f of readable) {
    if (used.has(f.key)) continue;
    const section = f.form_group_id || f.group_id;
    const value =
      f.type === "date"
        ? overviewDate(values[f.key])
        : displayFieldValue(f, values[f.key]);
    add(section, {
      key: f.key,
      label: f.label,
      value:
        f.validation?.government_id_digits && !unmasked
          ? maskedIdentifier(value)
          : value,
      role: fieldTextRole(f),
    });
    if (["birth_date", "date_hired"].includes(f.key)) {
      const years = fullYears(values[f.key], today);
      add(section, {
        key: f.key + "-duration",
        label: f.key === "birth_date" ? "Age" : "Length of Service",
        value:
          years == null
            ? "—"
            : f.key === "birth_date"
              ? `${years} ${years === 1 ? "year" : "years"} old`
              : years === 0
                ? "Less than 1 year"
                : `${years} ${years === 1 ? "year" : "years"}`,
      });
    }
  }
  const order = (a: Context["groups"][number], b: Context["groups"][number]) =>
    (a.display_order ?? 0) - (b.display_order ?? 0) ||
    a.name.localeCompare(b.name);
  const roots = groups
    .filter((g) => g.active && !g.parent_group_id)
    .sort(order);
  function renderSection(group: Context["groups"][number], subgroup = false) {
    const items = entries.get(group.id) || [];
    if (!group.active || !items.length) return null;
    const ids = readable.some(
      (f) =>
        (f.form_group_id || f.group_id) === group.id &&
        f.validation?.government_id_digits,
    );
    const compact = items.filter((item) => !item.wide);
    if (compact.some((item) => item.key === "birth_date")) {
      const left = [
        "birth_date",
        "birth_date-duration",
        "gender",
        "civil_status",
        "blood_type",
      ];
      const right = [
        "phone",
        "email",
        "religion",
        "religion_social_affiliation",
        "highest_educational_attainment",
        "educational_attainment",
      ];
      compact.forEach(
        (item) =>
          (item.column = left.includes(item.key)
            ? "left"
            : right.includes(item.key)
              ? "right"
              : undefined),
      );
      compact.sort((a, b) => {
        const keys = [...left, ...right];
        return (
          (keys.indexOf(a.key) < 0 ? 999 : keys.indexOf(a.key)) -
          (keys.indexOf(b.key) < 0 ? 999 : keys.indexOf(b.key))
        );
      });
    }
    const render = (item: Entry) => (
      <div key={item.key}>
        <dt>{item.label}</dt>
        <dd className={item.role}>{item.value}</dd>
      </div>
    );
    return (
      <section
        className={`overview-section ${subgroup ? "overview-subgroup" : ""}`}
        aria-label={group.name}
        key={group.id}
      >
        <div className="overview-section-heading">
          {subgroup ? <h4>{group.name}</h4> : <h3>{group.name}</h3>}
          <div className="overview-section-actions">
            {readable.some(
              (f) =>
                f.actions.includes("U") &&
                ((f.form_group_id || f.group_id) === group.id ||
                  (!subgroup &&
                    groups.some(
                      (child) =>
                        child.parent_group_id === group.id &&
                        child.id === (f.form_group_id || f.group_id),
                    ))),
            ) && (
              <button
                type="button"
                className="overview-edit-icon"
                aria-label={`Edit ${group.name}`}
                title={`Edit ${group.name}`}
                onClick={() => onEdit(group.id)}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            )}
            {ids && (
              <button
                type="button"
                className="overview-unmask"
                aria-pressed={unmasked}
                onClick={() => setUnmasked(!unmasked)}
              >
                {unmasked ? (
                  <EyeOff size={14} aria-hidden="true" />
                ) : (
                  <Eye size={14} aria-hidden="true" />
                )}
                {unmasked ? "Mask Government IDs" : "Unmask Government IDs"}
              </button>
            )}
          </div>
        </div>
        <div className="overview-columns">
          {[0, 1].map((column) => (
            <dl key={column} className="overview-details">
              {compact
                .filter((item, index) =>
                  item.column
                    ? item.column === (column ? "right" : "left")
                    : column
                      ? index >= Math.ceil(compact.length / 2)
                      : index < Math.ceil(compact.length / 2),
                )
                .map(render)}
            </dl>
          ))}
        </div>
        {items.some((item) => item.wide) && (
          <dl className="overview-details overview-addresses">
            {items.filter((item) => item.wide).map(render)}
          </dl>
        )}
      </section>
    );
  }
  return (
    <div className="employee-overview">
      {roots.map((root) => {
        const children = groups
          .filter(
            (g) =>
              g.parent_group_id === root.id && g.active && entries.has(g.id),
          )
          .sort(order);
        if (!entries.has(root.id) && !children.length) return null;
        return (
          <div className="overview-parent" key={root.id}>
            {entries.has(root.id) ? (
              renderSection(root)
            ) : (
              <h3 className="overview-parent-title">{root.name}</h3>
            )}
            {children.map((child) => renderSection(child, true))}
          </div>
        );
      })}
      {!readable.length && (
        <p className="muted">No readable employee information is available.</p>
      )}
    </div>
  );
}
