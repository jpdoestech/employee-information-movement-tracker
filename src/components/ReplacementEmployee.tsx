import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import {
  defaultFilter,
  type Employee,
  type Field,
  type Option,
} from "../domain";
import { SearchFilterPicker } from "./SearchFilterPicker";
// Read only when the control is used; overview rendering stays side-effect free.
async function query<T>(operation: string, q: unknown): Promise<T> {
  return (await import("../api")).query<T>(operation, q);
}

function option(employee: Employee): Option {
  return {
    id: employee.id,
    label: String(employee.values.name || "Restricted or unavailable employee"),
    context: [employee.values.employee_number, employee.values.status]
      .filter(Boolean)
      .join(" · "),
  };
}

export function ReplacementEmployee({
  value,
  field,
  onChange,
  revision = 0,
  creating = false,
  disabled = false,
}: {
  value: unknown;
  field?: Field;
  onChange?: (value: string | null) => void;
  revision?: number;
  creating?: boolean;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<Option[]>([]);
  const id = typeof value === "string" ? value : "";
  useEffect(() => {
    let active = true;
    setSelected([]);
    if (id)
      query<{ employee: Employee }>("employee", { id })
        .then((r) => {
          if (active && r?.employee) setSelected([option(r.employee)]);
        })
        .catch(() => {
          /* Current permissions govern historical reference labels, too. */
        });
    return () => {
      active = false;
    };
  }, [id, revision]);
  if (!onChange)
    return (
      <span>
        {id ? selected[0]?.label || "Restricted or unavailable employee" : "—"}
      </span>
    );
  return (
    <div className="field form-control">
      <span>{field?.label || "Employee replaced"} *</span>
      <SearchFilterPicker
        disabled={disabled}
        mode="single"
        label={field?.label || "Employee replaced"}
        icon={UserRound}
        value={id ? [id] : []}
        options={selected}
        clearable={!id || !field || field.actions.includes("D") || creating}
        load={async (search) => {
          const page = await query<{ items: Employee[] }>("employees", {
            ...defaultFilter,
            search,
            sort: "id",
            statuses: ["Inactive", "Separated"],
            limit: 25,
          });
          return page.items
            .filter((e) => !!e.values.name)
            .slice(0, 20)
            .map(option);
        }}
        onChange={(ids, options) => {
          setSelected(options || []);
          onChange(ids[0] || null);
        }}
      />
    </div>
  );
}
