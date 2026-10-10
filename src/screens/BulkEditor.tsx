import { FloatingNotification } from "../components/FloatingNotification";
import { useState } from "react";
import { Dialog } from "../components/Dialog";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import { ValueEditor } from "../components/ValueEditor";
import { mutate, preview as validatePreview } from "../api";
import type { Employee, Field } from "../domain";
export function BulkEditor({
  rows,
  fields,
  onSaved,
  onClose,
}: {
  rows: Employee[];
  fields: Field[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [keys, setKeys] = useState<string[]>([]),
    [patch, setPatch] = useState<Record<string, unknown>>({}),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const allowed = fields.filter(
    (f) =>
      f.active &&
      (f.type !== "system" || f.key === "name") &&
      f.actions.includes("U"),
  );
  return (
    <Dialog title="Bulk update employees" onClose={onClose} wide>
      <div className="dialog-body">
        <p>
          {rows.length} selected employees · all-or-nothing · maximum 100 per
          transaction
        </p>
        {!preview ? (
          <>
            <SearchFilterPicker
              mode="multiple"
              label="Fields to update"
              options={allowed.map((f) => ({
                id: f.key,
                label: f.label,
                context: f.group_name,
              }))}
              value={keys}
              onChange={(v) => {
                setKeys(v);
                setPatch((p) =>
                  Object.fromEntries(
                    Object.entries(p).filter(([k]) => v.includes(k)),
                  ),
                );
              }}
            />
            <div className="form-grid">
              {keys.map((k) => (
                <ValueEditor
                  key={k}
                  field={allowed.find((f) => f.key === k)!}
                  value={patch[k]}
                  blind={
                    !allowed.find((f) => f.key === k)!.actions.includes("R")
                  }
                  onChange={(v) => setPatch((p) => ({ ...p, [k]: v }))}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <h3>Confirm changes</h3>
            <p>
              Every row, field, applicability scope and revision will be checked
              again by the database. A single conflict cancels the whole
              operation.
            </p>
            <div className="table-region">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    {keys.map((k) => (
                      <th key={k}>{allowed.find((f) => f.key === k)?.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r) => (
                    <tr key={r.id}>
                      <td>
                        {String(
                          r.values.employee_number || "Authorized record",
                        )}
                      </td>
                      {keys.map((k) => (
                        <td key={k}>
                          {k in r.values
                            ? String(r.values[k] ?? "Empty")
                            : "Restricted"}{" "}
                          → {String(patch[k] ?? "Clear")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small>
              Showing {Math.min(rows.length, 10)} authorized samples.
            </small>
          </>
        )}
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        {preview && <button onClick={() => setPreview(false)}>Back</button>}
        <button
          className="primary"
          disabled={busy || !keys.length || keys.some((k) => !(k in patch))}
          onClick={async () => {
            setBusy(true);
            try {
              if (!preview) {
                await validatePreview("bulk_update", {
                  rows: rows.map((r) => ({
                    id: r.id,
                    row_version: r.row_version,
                  })),
                  values: patch,
                });
                setPreview(true);
                return;
              }
              await mutate("bulk_update", {
                rows: rows.map((r) => ({
                  id: r.id,
                  row_version: r.row_version,
                })),
                values: patch,
              });
              onSaved();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Updating…" : preview ? "Confirm update" : "Preview changes"}
        </button>
      </footer>
    </Dialog>
  );
}
