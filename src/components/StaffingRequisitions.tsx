import { FieldTypeIcon } from "./FieldTypeIcon";
import { useId, useState } from "react";
import { mutate } from "../api";
import type { Context, Option } from "../domain";
import { Dialog } from "./Dialog";
import { RecordExplorer } from "./RecordExplorer";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { FloatingNotification } from "./FloatingNotification";

export type StaffingRequirement = {
  id: string;
  client_id: string;
  reference: string;
  employment_type: string;
  required_headcount: number;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
  row_version?: number;
};
export function StaffingRequisitions({
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
  const [draft, setDraft] = useState<StaffingRequirement>(),
    [initial, setInitial] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const manage = context.capabilities.includes("organization_manage");
  const formId = useId();
  const employmentTypes =
    context.fields.find((f) => f.key === "employment_type")?.options || [];
  function edit(value: StaffingRequirement) {
    setInitial(JSON.stringify(value));
    setDraft(value);
    setError("");
  }
  return (
    <>
      <Dialog
        title="Client staffing / PRFs"
        wide
        className="staffing-dialog"
        onClose={onClose}
        isDirty={false}
      >
        <div className="staffing-description">
          <p>
            Record approved staffing requirements. Concurrent active PRFs add to
            the client’s required headcount by Employment Type. End dates are
            exclusive.
          </p>
        </div>
        <RecordExplorer
          kind="staffing"
          revision={context.revision}
          options={options}
          onCreate={
            manage
              ? () =>
                  edit({
                    id: crypto.randomUUID(),
                    reference: "",
                    client_id: "",
                    employment_type: "",
                    required_headcount: 1,
                    starts_on: context.today,
                    ends_on: null,
                    active: true,
                  })
              : undefined
          }
          onEdit={
            manage
              ? (row) => edit(row as unknown as StaffingRequirement)
              : undefined
          }
        />
      </Dialog>
      {draft && (
        <Dialog
          title={draft.row_version ? "Edit staffing PRF" : "Add staffing PRF"}
          closeDisabled={busy}
          onClose={() => setDraft(undefined)}
          isDirty={JSON.stringify(draft) !== initial}
        >
          <form
            id={formId}
            className="dialog-body staffing-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.client_id || !draft.employment_type) {
                setError("Select a client and Employment Type.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await mutate("staffing_requisition", {
                  ...draft,
                  expected_version: draft.row_version || 0,
                });
                setDraft(undefined);
                onSaved();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <label>
                PRF reference
                <span className="value-control has-type-icon">
                  <span className="value-type-icon">
                    <FieldTypeIcon type="short_text" size={14} />
                  </span>
                  <input
                    disabled={busy}
                    required
                    maxLength={80}
                    value={draft.reference}
                    onChange={(e) =>
                      setDraft({ ...draft, reference: e.target.value })
                    }
                  />
                </span>
              </label>
              <label>
                Client
                <SearchFilterPicker
                  mode="single"
                  label="PRF client"
                  clearable={false}
                  disabled={busy || !!draft.row_version}
                  options={options.filter(
                    (o) => o.kind === "client" && o.active,
                  )}
                  value={draft.client_id ? [draft.client_id] : []}
                  onChange={([client_id]) => setDraft({ ...draft, client_id })}
                />
              </label>
              <label>
                Employment Type
                <SearchFilterPicker
                  mode="single"
                  label="PRF Employment Type"
                  disabled={busy}
                  clearable={false}
                  options={[
                    ...new Set([
                      ...employmentTypes,
                      ...(draft.employment_type ? [draft.employment_type] : []),
                    ]),
                  ].map((id) => ({ id, label: id }))}
                  value={draft.employment_type ? [draft.employment_type] : []}
                  onChange={([employment_type]) =>
                    setDraft({ ...draft, employment_type })
                  }
                />
              </label>
              <label>
                Required headcount
                <span className="value-control has-type-icon">
                  <span className="value-type-icon">
                    <FieldTypeIcon type="integer" size={14} />
                  </span>
                  <input
                    disabled={busy}
                    type="number"
                    min={1}
                    max={100000}
                    step={1}
                    required
                    value={draft.required_headcount}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        required_headcount: Number(e.target.value),
                      })
                    }
                  />
                </span>
              </label>
              <label>
                Starts on
                <span className="value-control has-type-icon">
                  <span className="value-type-icon">
                    <FieldTypeIcon type="date" size={14} />
                  </span>
                  <input
                    disabled={busy}
                    className="text-date"
                    type="date"
                    required
                    value={draft.starts_on}
                    onChange={(e) =>
                      setDraft({ ...draft, starts_on: e.target.value })
                    }
                  />
                </span>
              </label>
              <label>
                Ends before (optional)
                <span className="value-control has-type-icon">
                  <span className="value-type-icon">
                    <FieldTypeIcon type="date" size={14} />
                  </span>
                  <input
                    disabled={busy}
                    className="text-date"
                    type="date"
                    min={draft.starts_on}
                    value={draft.ends_on || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, ends_on: e.target.value || null })
                    }
                  />
                </span>
              </label>
              <label className="check-label">
                <input
                  disabled={busy}
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) =>
                    setDraft({ ...draft, active: e.target.checked })
                  }
                />
                Active staffing requirement
              </label>
              <p className="analytics-note">
                Use the same Employment Type as employee records. Configure
                additional choices, such as On-call, in Field Builder.
              </p>
              {error && (
                <FloatingNotification onDismiss={() => setError("")}>
                  {error}
                </FloatingNotification>
              )}
            </div>
          </form>
          <footer>
            <button type="button" disabled={busy}>
              Cancel
            </button>
            <button
              className="primary"
              type="submit"
              form={formId}
              disabled={busy}
            >
              Save PRF
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
