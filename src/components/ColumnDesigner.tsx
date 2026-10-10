import { useState } from "react";
import { ArrowUp, ArrowDown, Pin } from "lucide-react";
import { Dialog } from "./Dialog";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { EmployeeTable } from "./EmployeeTable";
import {
  defaultColumns,
  moveColumn,
  type Employee,
  type Field,
  type Layout,
} from "../domain";
export function ColumnDesigner({
  layout,
  fields,
  rows,
  onApply,
  onClose,
}: {
  layout: Layout;
  fields: Field[];
  rows: Employee[];
  onApply: (draft: Layout, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(structuredClone(layout)),
    [name, setName] = useState("My employee view"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const options = fields
    .filter((f) => f.active && f.list_eligible && f.actions.includes("R"))
    .map((f) => ({ id: f.key, label: f.label, context: f.group_name }));
  return (
    <Dialog title="Customize Columns" onClose={onClose} wide>
      <div className="dialog-body">
        <p>
          Arrange your authorized columns. The preview updates immediately;
          changes remain a draft until you apply.
        </p>
        <SearchFilterPicker
          mode="multiple"
          label="Visible columns"
          options={options}
          value={draft.columns}
          onChange={(columns) =>
            setDraft({
              ...draft,
              columns,
              pinned: draft.pinned.filter((k) => columns.includes(k)),
            })
          }
        />
        <div className="column-list">
          {draft.columns.map((k) => (
            <div key={k}>
              <span>{options.find((o) => o.id === k)?.label}</span>
              <button
                aria-label={`Move ${k} up`}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    columns: moveColumn(draft.columns, k, -1),
                  })
                }
              >
                <ArrowUp size={16} />
              </button>
              <button
                aria-label={`Move ${k} down`}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    columns: moveColumn(draft.columns, k, 1),
                  })
                }
              >
                <ArrowDown size={16} />
              </button>
              <button
                aria-pressed={draft.pinned.includes(k)}
                aria-label={`Pin ${k}`}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    pinned: draft.pinned.includes(k)
                      ? draft.pinned.filter((c) => c !== k)
                      : [...draft.pinned, k].slice(-2),
                  })
                }
              >
                <Pin size={16} />
                {draft.pinned.includes(k) ? "Pinned" : "Pin"}
              </button>
            </div>
          ))}
        </div>
        <h3>Live preview</h3>
        <EmployeeTable
          rows={rows.slice(0, 3)}
          fields={fields}
          layout={draft}
          preview
        />
        <label>
          Saved view name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button
          onClick={() =>
            setDraft({
              ...layout,
              columns: defaultColumns.filter((k) =>
                options.some((o) => o.id === k),
              ),
              pinned: ["employee_number", "name"],
            })
          }
        >
          Reset to default
        </button>
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={busy || !draft.columns.length || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(draft, name);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Apply & Save"}
        </button>
      </footer>
    </Dialog>
  );
}
