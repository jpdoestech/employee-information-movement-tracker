import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { mutate, preview, query } from "../api";
import type { Context, Field, Option } from "../domain";
import { importFields, prepareImport, readImportFile } from "../employeeImport";
import { nameCaseOptions, type NameCase } from "../inputNormalization";
import { fieldGroupPath } from "../employeeForm";
import { useClientIdMode } from "../clientIdentity";
import { trackTransaction } from "../transactions";
import { Dialog } from "../components/Dialog";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import { FloatingNotification } from "../components/FloatingNotification";
import { confirmTransaction } from "../components/TransactionConfirmation";
import { FieldTypeIcon } from "../components/FieldTypeIcon";
import { fieldTextRole } from "../typography";
import { mapJobEntries } from "../jobCatalog";
import { JobImportReview } from "../components/JobImportReview";

export function EmployeeImport({
  context,
  options,
  onClose,
  onSaved,
}: {
  context: Context;
  options: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState("unassigned");
  const [mode, setMode] = useState<NameCase>("upper");
  const [access, setAccess] = useState<{
    key: string;
    fields: Field[];
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  const [file, setFile] = useState<{ name: string; data: unknown[][] }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [validated, setValidated] = useState("");
  const [jobMappings, setJobMappings] = useState<Record<string, string>>({});
  const destinations: Option[] = [
    { id: "unassigned", kind: "unassigned", label: "Unassigned", active: true },
    ...options.filter((o) => o.active),
  ];
  const organization = destinations.find((o) => o.id === target);
  const destination = {
    target_level: organization?.kind || "unassigned",
    branch_id:
      organization?.kind === "branch"
        ? organization.id
        : organization?.branch_id,
    client_id: organization?.kind === "client" ? organization.id : undefined,
  };
  const key = `${context.profile.id}:${context.revision}:${context.today}:${target}`;
  const ids = useClientIdMode(destination.client_id, context.revision + retry);
  const ready =
    access?.key === key &&
    !access.error &&
    (!destination.client_id || (!!ids.mode && !ids.error));
  const fields = access?.key === key ? importFields(access.fields) : [];
  useEffect(() => {
    let active = true;
    void trackTransaction("Checking import fields", () =>
      query<Field[]>("target_fields", destination),
    )
      .then((fields) => {
        if (active) setAccess({ key, fields });
      })
      .catch((e) => {
        if (active) setAccess({ key, fields: [], error: e.message });
      });
    return () => {
      active = false;
    };
  }, [key, retry]);
  const parsed = useMemo(() => {
    if (!file || !ready) return undefined;
    try {
      return prepareImport(file.data, fields, mode, ids.mode === "manual");
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [file, access, ready, mode, ids.mode]);
  const sourceRows = parsed && !("error" in parsed) ? parsed.rows : [];
  const rows = mapJobEntries(sourceRows, fields, jobMappings);
  const headers = parsed && !("error" in parsed) ? parsed.headers : [];
  const payload = { ...destination, rows };
  const fingerprint = key + JSON.stringify(payload);
  const reviewed = validated === fingerprint;
  function template() {
    const keys = [
      ...fields.map((f) => f.key),
      ...(ids.mode === "manual" ? ["manual_client_id"] : []),
    ];
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + keys.join(",") + "\r\n"], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-import-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Dialog
      title="Import employees"
      onClose={onClose}
      wide
      className="employee-import-dialog"
      isDirty={!!file}
      closeDisabled={busy}
    >
      <div className="dialog-body">
        <div className="form-grid">
          <SearchFilterPicker
            mode="single"
            label="Initial organization"
            options={destinations}
            clearable={false}
            value={target ? [target] : []}
            disabled={busy}
            onChange={(v) => {
              setTarget(v[0] || "");
              setValidated("");
            }}
          />
          <SearchFilterPicker
            mode="single"
            label="Name case"
            options={nameCaseOptions}
            value={[mode]}
            clearable={false}
            disabled={busy}
            onChange={(v) => {
              setMode(v[0] as NameCase);
              setValidated("");
            }}
          />
        </div>
        <p className="muted">
          Create up to 100 employees in one organization. Excel uses the first
          sheet. Blank cells use existing defaults. The entire batch is saved
          together.
        </p>
        <div className="import-file-controls">
          <button
            disabled={busy || !ready || !fields.length}
            onClick={template}
          >
            <Download size={16} />
            Download template
          </button>
          <label>
            Excel or CSV file
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={busy || !ready || !fields.length}
              onChange={async (e) => {
                const selected = e.target.files?.[0];
                if (!selected) return;
                setBusy(true);
                setError("");
                setFile(undefined);
                setValidated("");
                try {
                  const data = await trackTransaction(
                    "Reading employee file",
                    () => readImportFile(selected),
                  );
                  setFile({ name: selected.name, data });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
        {!ready && (
          <p role="status">
            {(access?.key === key && access.error) ||
              ids.error ||
              "Checking organization and field access…"}
          </p>
        )}
        {(access?.error || ids.error) && (
          <button
            disabled={busy}
            onClick={() => {
              setRetry((n) => n + 1);
            }}
          >
            Retry access check
          </button>
        )}
        {ready && !fields.length && (
          <p>
            No fields are available to create employees in this organization.
          </p>
        )}
        <details className="import-guide">
          <summary>Column guide</summary>
          <p>
            Keep the template’s field keys in the first row. Use YYYY-MM-DD
            dates, numbers without separators, and true/false for checkboxes.
            Format names, account numbers, phone numbers and IDs as Text to
            preserve their exact characters. Maximum file size: 1 MB.
          </p>
          <p>
            System IDs and employee category are assigned automatically.
            Possible duplicates stop the batch; review those employees using Add
            employee. Import never updates existing employees.
          </p>
          <dl>
            {fields.map((f) => (
              <div key={f.key}>
                <dt>
                  <code>{f.key}</code>
                </dt>
                <dd>
                  {f.label}
                  {f.required ? " · Required" : ""} ·{" "}
                  {fieldGroupPath(context.groups, f.group_id)}
                  {f.options?.length ? ` · ${f.options.join(", ")}` : ""}
                </dd>
              </div>
            ))}
          </dl>
          {ids.mode === "manual" && (
            <p>
              <code>manual_client_id</code> is required for each employee in
              this client.
            </p>
          )}
        </details>
        <JobImportReview
          rows={sourceRows}
          fields={fields}
          mappings={jobMappings}
          disabled={busy}
          onChange={(id, official) => {
            setJobMappings((current) => {
              const next = { ...current };
              if (official) next[id] = official;
              else delete next[id];
              return next;
            });
            setValidated("");
          }}
        />
        {file && (
          <p>
            {file.name} · {rows.length} employees
            {reviewed ? " · Validation passed" : ""}
          </p>
        )}
        {parsed && "error" in parsed && (
          <p className="error" role="alert">
            {parsed.error}
          </p>
        )}
        {!!rows.length && (
          <div className="data-panel import-preview">
            <div
              className="data-scroll-region"
              role="region"
              aria-label="Employee import preview"
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">Employee import preview</caption>
                <thead>
                  <tr>
                    <th>No.</th>
                    {headers.map((k) => (
                      <th key={k}>
                        <FieldTypeIcon
                          type={
                            fields.find((f) => f.key === k)?.type ||
                            "short_text"
                          }
                          size={13}
                        />
                        {fields.find((f) => f.key === k)?.label || "Client ID"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      {headers.map((k) => (
                        <td
                          className={fieldTextRole(
                            fields.find((f) => f.key === k),
                          )}
                          key={k}
                          title={String(
                            k === "manual_client_id"
                              ? r.manual_client_id || ""
                              : (r.values[k] ?? "Default"),
                          )}
                        >
                          {String(
                            k === "manual_client_id"
                              ? r.manual_client_id || ""
                              : (r.values[k] ?? "Default"),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
          className="primary"
          disabled={busy || !ready || !rows.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (!reviewed) {
                await preview("employee_import", payload);
                setValidated(fingerprint);
                return;
              }
              if (
                !(await confirmTransaction(
                  "Import employees",
                  `Create ${rows.length} employees in ${organization?.label || "Unassigned"}? All rows will be saved together. Existing employees will not be updated.`,
                ))
              )
                return;
              await mutate("employee_import", payload, undefined, true);
              onSaved();
              onClose();
            } catch (e) {
              setValidated("");
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Checking…"
            : reviewed
              ? `Import ${rows.length} employee${rows.length === 1 ? "" : "s"}`
              : "Validate import"}
        </button>
      </footer>
    </Dialog>
  );
}
