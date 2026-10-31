import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { mutate, query } from "../api";
import type { Option } from "../domain";
import { trackTransaction } from "../transactions";
import { Dialog } from "./Dialog";
import { FloatingNotification } from "./FloatingNotification";
import { SearchFilterPicker } from "./SearchFilterPicker";

type Preview = {
  token: string;
  scope_label: string;
  scope_type: string;
  expires_at: string;
  confirmation: string;
  counts: {
    employees: number;
    archived: number;
    assignments: number;
    movements: number;
    other_location_history: number;
    linked_accounts: number;
  };
  sample: { employee_number: string; name: string }[];
};

export function EmployeeDataDeletion({
  options,
  onSaved,
}: {
  options: Option[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section className="panel employee-data-deletion">
      <h3>
        <TriangleAlert size={16} aria-hidden /> Permanent employee data deletion
      </h3>
      <p>
        Hard-delete all employee records, or those currently assigned to Head
        Office, a branch or a client. Their complete history is deleted,
        including history in other locations. Organization setup and login
        accounts stay.
      </p>
      <button className="danger" onClick={() => setOpen(true)}>
        Review data deletion
      </button>
      {open && (
        <DeletionDialog
          options={options}
          onClose={() => setOpen(false)}
          onDeleted={(count) => {
            setOpen(false);
            setNotice(
              `${count} employee records permanently deleted. Managed spreadsheet cleanup is queued.`,
            );
            onSaved();
          }}
        />
      )}
      {notice && (
        <FloatingNotification kind="notice" onDismiss={() => setNotice("")}>
          {notice}
        </FloatingNotification>
      )}
    </section>
  );
}

function DeletionDialog({
  options,
  onClose,
  onDeleted,
}: {
  options: Option[];
  onClose: () => void;
  onDeleted: (count: number) => void;
}) {
  const [scope, setScope] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = options.find((o) => o.id === scope);
  return (
    <Dialog
      title="Permanently delete employee data"
      onClose={onClose}
      wide
      closeDisabled={busy}
      isDirty={!!reason || !!confirmation}
      className="employee-purge-dialog"
    >
      <div className="dialog-body">
        <p className="purge-warning">
          <TriangleAlert size={18} aria-hidden /> This cannot be undone in the
          app. Recovery requires a separate backup. This does not erase backups,
          downloaded exports or unmanaged spreadsheet copies.
        </p>
        <SearchFilterPicker
          mode="single"
          label="Deletion scope"
          disabled={busy}
          value={scope ? [scope] : []}
          options={[
            { id: "all", label: "All employee data (including unassigned)" },
            ...options.filter((o) =>
              ["head_office", "branch", "client"].includes(o.kind || ""),
            ),
          ]}
          onChange={(values) => {
            setScope(values[0] || "");
            setPreview(undefined);
            setConfirmation("");
            setError("");
          }}
        />
        <p>
          Uses the current primary assignment, including archived employees. A
          branch includes its clients. Historical-only and temporary assignments
          do not select an employee for deletion.
        </p>
        <button
          disabled={busy || !scope}
          onClick={async () => {
            setBusy(true);
            setError("");
            setPreview(undefined);
            setConfirmation("");
            try {
              setPreview(
                await trackTransaction("Reviewing employee deletion", () =>
                  query<Preview>("preview_employee_purge", {
                    scope_type: scope === "all" ? "all" : target?.kind,
                    scope_id:
                      target?.kind === "branch" || target?.kind === "client"
                        ? target.id
                        : null,
                  }),
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Preview affected data
        </button>
        {preview && (
          <section aria-label="Deletion preview" className="purge-preview">
            <h3>{preview.scope_label}</h3>
            <dl className="purge-counts">
              <div>
                <dt>Employees</dt>
                <dd>{preview.counts.employees}</dd>
              </div>
              <div>
                <dt>Archived employees included</dt>
                <dd>{preview.counts.archived}</dd>
              </div>
              <div>
                <dt>Assignments</dt>
                <dd>{preview.counts.assignments}</dd>
              </div>
              <div>
                <dt>Movements</dt>
                <dd>{preview.counts.movements}</dd>
              </div>
              <div>
                <dt>Employees with other-location history</dt>
                <dd>{preview.counts.other_location_history}</dd>
              </div>
              <div>
                <dt>Linked accounts affected</dt>
                <dd>{preview.counts.linked_accounts}</dd>
              </div>
            </dl>
            <p>
              Deletes employee profiles, assignments, movements, client IDs and
              associated value history. Linked self/report accounts lose that
              record access; login accounts are retained. No employee or client
              ID counters are reset.
            </p>
            {preview.sample.length > 0 && (
              <div
                className="data-scroll-region purge-sample"
                role="region"
                aria-label="Employee deletion sample"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>System ID</th>
                      <th>Employee Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((e) => (
                      <tr key={e.employee_number}>
                        <td>{e.employee_number}</td>
                        <td>{e.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <small>
              First {preview.sample.length} records shown. Preview expires in 10
              minutes; changes require a new preview.
            </small>
            <label>
              Deletion reason
              <input
                value={reason}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label>
              Type {preview.confirmation}
              <input
                value={confirmation}
                autoComplete="off"
                disabled={busy}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          </section>
        )}
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="danger"
          disabled={
            busy ||
            !preview?.counts.employees ||
            confirmation !== preview.confirmation ||
            !reason.trim()
          }
          onClick={async () => {
            if (!preview) return;
            setBusy(true);
            setError("");
            try {
              const result = await mutate<{ deleted_employees: number }>(
                "employee_purge",
                { token: preview.token, confirmation, reason },
              );
              onDeleted(result.deleted_employees);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Permanently delete
        </button>
      </footer>
    </Dialog>
  );
}
