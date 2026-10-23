import {
  useClientIdMode,
  clientIdError,
  normalizeClientId,
} from "../clientIdentity";
import { ManualClientId } from "../components/ManualClientId";
import { FloatingNotification } from "../components/FloatingNotification";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "../components/Dialog";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import {
  movementTypes,
  defaultFilter,
  statuses,
  type Employee,
  type Option,
  type Field,
} from "../domain";
import { ValueEditor } from "../components/ValueEditor";
import { mutate, query, preview as validatePreview } from "../api";
export function MovementEditor({
  rows,
  options,
  today,
  onClose,
  onSaved,
}: {
  rows: Employee[];
  options: Option[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [manualId, setManualId] = useState("");
  const [eid, setEid] = useState(""),
    [typ, setTyp] = useState("transfer"),
    [dest, setDest] = useState(""),
    [date, setDate] = useState(today),
    [end, setEnd] = useState(""),
    [reason, setReason] = useState(""),
    [value, setValue] = useState(""),
    [category, setCategory] = useState("primary"),
    [preview, setPreview] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [separationCategory, setSeparationCategory] = useState(""),
    [separationReason, setSeparationReason] = useState(""),
    [separationDetails, setSeparationDetails] = useState("");
  const separating = typ === "status" && !!value && value !== "Active";
  const [assignments, setAssignments] = useState<any[]>([]),
    [selectedEmployee, setSelectedEmployee] = useState<Option[]>([]),
    [assignmentId, setAssignmentId] = useState(""),
    [destinationFields, setDestinationFields] = useState<Field[]>([]),
    [employeeFields, setEmployeeFields] = useState<Field[]>([]),
    [destinationValues, setDestinationValues] = useState<
      Record<string, unknown>
    >({});
  const loadEmployees = useCallback(async (search: string) => {
    const result = await query<{ items: Employee[] }>("employees", {
      ...defaultFilter,
      search,
      sort: "id",
      limit: 100,
    });
    return result.items.map((r) => ({
      id: r.id,
      label: String(
        r.values.name || r.values.employee_number || "Authorized employee",
      ),
      context: String(r.values.employee_number || ""),
    }));
  }, []);
  useEffect(() => {
    let active = true;
    if (eid)
      query("employee", { id: eid })
        .then((d) => {
          if (active) {
            setAssignments(d.assignments);
            setEmployeeFields(d.fields);
          }
        })
        .catch(() => {
          if (active) {
            setAssignments([]);
            setEmployeeFields([]);
          }
        });
    return () => {
      active = false;
    };
  }, [eid]);
  useEffect(() => {
    let active = true;
    setDestinationFields([]);
    const o = options.find((o) => o.id === dest);
    if (o)
      query<Field[]>("target_fields", {
        target_level: o.kind,
        branch_id: o.kind === "branch" ? o.id : o.branch_id,
        client_id: o.kind === "client" ? o.id : undefined,
      })
        .then((f) => {
          if (active) setDestinationFields(f);
        })
        .catch(() => {
          if (active) setDestinationFields([]);
        });
    return () => {
      active = false;
    };
  }, [dest]);
  const e = rows.find((r) => r.id === eid),
    o = options.find((o) => o.id === dest);
  const identityClient =
    !["status", "position", "return"].includes(typ) && o?.kind === "client"
      ? o
      : undefined;
  const idConfig = useClientIdMode(identityClient?.id);
  useEffect(() => setManualId(""), [dest]);
  const payload = () => ({
    employee_id: eid,
    expected_version: preview?.employee?.row_version ?? e?.row_version,
    type: typ,
    target_level: dest === "unassigned" ? "unassigned" : o?.kind,
    branch_id: o?.kind === "branch" ? o.id : o?.branch_id,
    client_id: o?.kind === "client" ? o.id : undefined,
    effective_on: date,
    ends_on: end || undefined,
    reason,
    ...(separating
      ? {
          separation_category: separationCategory,
          separation_reason: separationReason,
          separation_details: separationDetails,
        }
      : {}),
    category,
    assignment_id: assignmentId || undefined,
    values: destinationValues,
    ...(identityClient && idConfig.mode === "manual" && manualId.trim()
      ? { manual_client_id: normalizeClientId(manualId) }
      : {}),
    status: typ === "status" ? value : undefined,
    position: typ === "position" ? value : undefined,
  });
  return (
    <Dialog
      title="New movement transaction"
      onClose={onClose}
      wide
      className="transaction-editor"
    >
      <div className="dialog-body">
        <p>
          Effective dates use Asia/Manila. Assignment intervals include the
          start and exclude the end.
        </p>
        {!preview ? (
          <div className="transaction-form">
            <SearchFilterPicker
              mode="single"
              label="Employee"
              load={loadEmployees}
              options={[
                ...selectedEmployee,
                ...rows
                  .filter((r) => !selectedEmployee.some((o) => o.id === r.id))
                  .map((r) => ({
                    id: r.id,
                    label: String(
                      r.values.name ||
                        r.values.employee_number ||
                        "Authorized employee",
                    ),
                    context: String(r.values.employee_number || ""),
                  })),
              ]}
              value={eid ? [eid] : []}
              onChange={(v, selected) => {
                setSelectedEmployee(selected || []);
                setEid(v[0] || "");
                setAssignments([]);
                setAssignmentId("");
                setDestinationValues({});
              }}
            />
            <SearchFilterPicker
              mode="single"
              label="Movement type"
              options={movementTypes}
              value={[typ]}
              onChange={(v) => {
                setTyp(v[0] || "transfer");
                setValue("");
                setDest("");
                setCategory("primary");
                setEnd("");
                setAssignmentId("");
                setDestinationValues({});
              }}
            />
            {typ === "status" ? (
              <SearchFilterPicker
                mode="single"
                label="New employment status"
                options={statuses}
                value={value ? [value] : []}
                onChange={(v) => setValue(v[0] || "")}
              />
            ) : typ === "position" ? (
              <label>
                New position
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={200}
                />
              </label>
            ) : (
              <>
                <SearchFilterPicker
                  mode="single"
                  label="Destination branch or client"
                  options={[
                    ...options.filter((o) => o.active),
                    ...(typ === "return"
                      ? [
                          {
                            id: "unassigned",
                            label: "Unassigned",
                            kind: "unassigned",
                          },
                        ]
                      : []),
                  ]}
                  value={dest ? [dest] : []}
                  onChange={(v) => {
                    setDest(v[0] || "");
                    setDestinationValues({});
                  }}
                />
                {typ === "deployment" && (
                  <SearchFilterPicker
                    mode="single"
                    label="Assignment category"
                    options={[
                      { id: "primary", label: "Primary" },
                      { id: "additional", label: "Additional" },
                    ]}
                    value={[category]}
                    onChange={(v) => setCategory(v[0] || "primary")}
                  />
                )}
              </>
            )}
            {identityClient && idConfig.mode === "manual" && (
              <ManualClientId
                field={destinationFields.find(
                  (field) => field.key === "client_employee_number",
                )}
                value={manualId}
                onChange={setManualId}
                disabled={busy}
              />
            )}
            {identityClient && idConfig.error && (
              <FloatingNotification>{idConfig.error}</FloatingNotification>
            )}
            {identityClient && !idConfig.mode && !idConfig.error && (
              <FloatingNotification kind="loading">
                Loading client ID settings…
              </FloatingNotification>
            )}
            {separating && (
              <>
                <div className="form-control">
                  <span>Separation Category *</span>
                  <SearchFilterPicker
                    mode="single"
                    label="Separation Category"
                    options={(
                      employeeFields.find(
                        (field) => field.key === "separation_category",
                      )?.options || []
                    ).map((id) => ({
                      id,
                      label: id,
                    }))}
                    value={separationCategory ? [separationCategory] : []}
                    onChange={(v) => setSeparationCategory(v[0] ?? "")}
                  />
                </div>
                <div className="form-control">
                  <span>Reason for Separation *</span>
                  <SearchFilterPicker
                    mode="single"
                    label="Reason for Separation"
                    options={(
                      employeeFields.find(
                        (field) => field.key === "separation_reason",
                      )?.options || []
                    ).map((id) => ({ id, label: id }))}
                    value={separationReason ? [separationReason] : []}
                    onChange={(v) => setSeparationReason(v[0] ?? "")}
                  />
                </div>
                {separationReason === "Others (specify)" && (
                  <label>
                    Specify other separation reason *
                    <input
                      value={separationDetails}
                      maxLength={500}
                      onChange={(e) => setSeparationDetails(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            {typ === "return" && (
              <SearchFilterPicker
                mode="single"
                label="Placement to end (optional)"
                options={assignments.map((a) => ({
                  id: a.id,
                  label: `${a.category} · ${options.find((o) => o.id === a.client_id || o.id === a.branch_id)?.label || a.target_level}`,
                  context: `${a.starts_on} to ${a.ends_on || "open"}`,
                }))}
                value={assignmentId ? [assignmentId] : []}
                onChange={(v) => setAssignmentId(v[0] || "")}
              />
            )}
            {(typ === "transfer" ||
              typ === "deployment" ||
              typ === "reassignment") &&
              category === "primary" &&
              destinationFields.some(
                (f) => f.type !== "system" && f.actions.includes("U"),
              ) && (
                <fieldset>
                  <legend>Destination field values</legend>
                  <p>
                    Enter explicit new values where needed. Untouched fields are
                    retained; restricted old values are never shown.
                  </p>
                  {destinationFields
                    .filter(
                      (f) => f.type !== "system" && f.actions.includes("U"),
                    )
                    .map((f) => (
                      <ValueEditor
                        key={f.key}
                        field={f}
                        value={destinationValues[f.key]}
                        blind={!f.actions.includes("R")}
                        onChange={(v) =>
                          setDestinationValues((p) => ({ ...p, [f.key]: v }))
                        }
                      />
                    ))}
                </fieldset>
              )}
            <div className="form-grid">
              <label>
                Effective date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              {(typ === "temporary" || category === "additional") && (
                <label>
                  End date (exclusive)
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    required={typ === "temporary"}
                  />
                </label>
              )}
            </div>
            <label>
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                required
              />
            </label>
          </div>
        ) : (
          <div className="transaction-review">
            <h3>Confirm transaction</h3>
            <p>
              {String(
                preview.employee.values.name ||
                  preview.employee.values.employee_number ||
                  "Authorized employee",
              )}
            </p>
            <p>
              {movementTypes.find((m) => m.id === typ)?.label} · {date}
              {date > today ? " · Scheduled" : ""}
            </p>
            <p>
              Current authorized primary placement:{" "}
              {String(preview.employee.values.branch || "Restricted")}
            </p>
            <p>
              New state:{" "}
              {typ === "status" || typ === "position"
                ? value
                : o?.label || "Unassigned"}
            </p>
            {separating && (
              <p>
                {separationCategory} � {separationReason}
                {separationReason === "Others (specify)"
                  ? `: ${separationDetails}`
                  : ""}
              </p>
            )}
            <p>Reason: {reason}</p>
          </div>
        )}
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        {preview && <button onClick={() => setPreview(undefined)}>Back</button>}
        <button
          className="primary"
          disabled={
            busy ||
            (!!identityClient && !idConfig.mode) ||
            !eid ||
            !reason.trim() ||
            !date ||
            (typ === "status" || typ === "position" ? !value : !dest) ||
            (typ === "temporary" && !end) ||
            (separating &&
              (!separationCategory ||
                !separationReason ||
                (separationReason === "Others (specify)" &&
                  !separationDetails.trim())))
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (identityClient && manualId.trim() && clientIdError(manualId))
                throw new Error(clientIdError(manualId));
              if (!preview) {
                const d = await query("employee", {
                  id: eid,
                  include_history: false,
                });
                await validatePreview("movement", {
                  ...payload(),
                  expected_version: d.employee.row_version,
                });
                setPreview(d);
              } else {
                await mutate("movement", payload());
                onSaved();
                onClose();
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Checking…"
            : preview
              ? "Confirm transaction"
              : "Preview transaction"}
        </button>
      </footer>
    </Dialog>
  );
}
