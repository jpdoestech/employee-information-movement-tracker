import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { query } from "../api";
import type { Field, Option } from "../domain";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { FloatingNotification } from "./FloatingNotification";

type PrfOption = Option & {
  department: string;
  position: string;
  employment_type: string;
  available?: boolean;
};
type PrfOptions = { items: PrfOption[]; selected: PrfOption | null };

export function PrfAssignment({
  field,
  value,
  employeeId,
  clientId,
  selectionId,
  revision,
  disabled,
  onChange,
}: {
  field: Field;
  value: unknown;
  employeeId?: string;
  clientId?: string;
  selectionId?: string;
  revision: number;
  disabled: boolean;
  onChange: (id: string | null, requirement?: PrfOption) => void;
}) {
  const key = `${employeeId || ""}:${clientId || ""}:${revision}`;
  const [selection, setSelection] = useState<{
    key: string;
    options: PrfOption[];
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    if (!employeeId && !clientId) return;
    query<PrfOptions>("staffing_options", {
      employee_id: employeeId,
      client_id: clientId,
      selected_id: selectionId,
    })
      .then((result) => {
        if (active)
          setSelection({
            key,
            options: result.selected ? [result.selected] : [],
          });
      })
      .catch((e) => {
        if (active) {
          setSelection({ key, options: [] });
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [key, selectionId]);
  const selected = selection?.key === key ? selection.options : [];
  return (
    <div className="field form-control">
      <span>{field.label}</span>
      <SearchFilterPicker
        icon={ClipboardList}
        mode="single"
        label={field.label}
        disabled={disabled || (!employeeId && !clientId) || !!error}
        options={selected}
        value={value ? selected.map((option) => option.id) : []}
        clearable={!employeeId || field.actions.includes("D")}
        displayLabel={
          value && !selected.length
            ? selection?.key === key
              ? "Restricted or unavailable PRF"
              : "Loading PRF requirement…"
            : "Select PRF and job requirement"
        }
        load={async (search) =>
          (
            await query<PrfOptions>("staffing_options", {
              employee_id: employeeId,
              client_id: clientId,
              search,
            })
          ).items
        }
        onChange={(ids, options) => {
          const chosen = (options || []) as PrfOption[];
          setSelection({ key, options: chosen });
          onChange(ids[0] || null, chosen[0]);
        }}
      />
      {!!value && selected[0] && (
        <small>
          {selected[0].context}
          {selected[0].available === false
            ? " · Retired or inactive requirement"
            : ""}
        </small>
      )}
      {error && (
        <FloatingNotification onDismiss={() => setError("")}>
          {error}
        </FloatingNotification>
      )}
    </div>
  );
}
