import { mobileError } from "../identifiers";
import {
  employmentOrder,
  employmentStatus,
  employmentError,
  inactiveEmploymentRequired,
} from "../profileFields";
import { AddressFields } from "../components/forms/AddressFields";
import {
  UserRound,
  ShieldCheck,
  MapPin,
  SlidersHorizontal,
  History,
} from "lucide-react";
import {
  addressKeys,
  addressValue,
  addressAccess,
  relationshipOptions,
} from "../address/addressFields";
import { addressValidationError } from "../address/addressService";
import { FloatingNotification } from "../components/FloatingNotification";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { valueWidth } from "../controlSizing";
import { employeeTabs, nameKeys, defaultEntryPriority } from "../employeeForm";
import { displayFieldValue } from "../fieldValues";
import { governmentIdError, requiredForEdit } from "../governmentIds";
import { Dialog } from "../components/Dialog";
import { ValueEditor } from "../components/ValueEditor";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import { query, mutate } from "../api";
import type { Context, Employee, Field, Option } from "../domain";
export function EmployeeEditor({
  row,
  context,
  options,
  onClose,
  onSaved,
}: {
  row: Employee | null;
  context: Context;
  options: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const tabId = useId();
  const body = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("");
  const [changeChoice, setChangeChoice] = useState(false);
  const [verticalTabs, setVerticalTabs] = useState(
    () => window.matchMedia("(min-width: 761px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");
    const update = () => setVerticalTabs(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [values, setValues] = useState<Record<string, unknown>>({}),
    [changed, setChanged] = useState<Record<string, unknown>>({}),
    [detail, setDetail] = useState<any>(),
    [fields, setFields] = useState(context.fields),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmArchive, setConfirmArchive] = useState(false),
    [addressValid, setAddressValid] = useState<Record<string, boolean>>({}),
    [addressErrors, setAddressErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    if (row) {
      query("employee", { id: row.id })
        .then((d) => {
          if (active) {
            setDetail(d);
            setValues(d.employee.values);
            setFields(d.fields);
          }
        })
        .catch((e) => {
          if (active) {
            setFields([]);
            setValues({});
            setError(e.message);
          }
        });
    } else {
      const o = options.find((o) => o.id === target);
      query<Field[]>("target_fields", {
        target_level: o?.kind || "unassigned",
        branch_id: o?.kind === "branch" ? o.id : o?.branch_id,
        client_id: o?.kind === "client" ? o.id : undefined,
      })
        .then((f) => {
          if (active) setFields(f);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [row?.id, context.revision, target]);
  const editable = fields.filter(
    (f) =>
      f.active &&
      (f.key === "name" ||
        nameKeys.includes(f.key as (typeof nameKeys)[number]) ||
        f.type !== "system" ||
        ["position", "status"].includes(f.key)) &&
      f.actions.includes(row ? "U" : "C"),
  );
  const addressFieldKeys = new Set(
    ["", "current_"].flatMap((prefix) =>
      addressKeys.map((key) => prefix + key),
    ),
  );
  const defaults = row
    ? {}
    : Object.fromEntries(
        fields
          .filter(
            (f) =>
              f.active &&
              f.actions.includes("C") &&
              f.type !== "system" &&
              f.default_value != null,
          )
          .map((f) => [f.key, f.default_value]),
      );
  const draft = {
    status: "Active",
    ...defaults,
    ...values,
    ...changed,
  } as Record<string, unknown>;
  const inactive = employmentStatus(draft.status) !== "Active";
  const department = fields.find(
    (f) =>
      f.key === "department" &&
      f.active &&
      context.groups.some((g) => g.id === f.group_id && g.active),
  );
  const formFields = fields.map((f) =>
    ["position", "status"].includes(f.key) && department
      ? {
          ...f,
          group_id: department.group_id,
          group_name: department.group_name,
        }
      : f,
  );
  const regular = editable
    .filter(
      (f) =>
        !addressFieldKeys.has(f.key) &&
        !["name", "status_reason"].includes(f.key) &&
        (![
          "status_effective_date",
          "separation_category",
          "separation_reason",
          "separation_details",
        ].includes(f.key) ||
          inactive) &&
        (f.key !== "separation_details" ||
          draft.separation_reason === "Others (specify)"),
    )
    .map((f) =>
      ["position", "status"].includes(f.key) && department
        ? {
            ...f,
            group_id: department.group_id,
            group_name: department.group_name,
          }
        : f,
    )
    .sort(
      (a, b) =>
        defaultEntryPriority(a.key) - defaultEntryPriority(b.key) ||
        Number(!nameKeys.includes(a.key as (typeof nameKeys)[number])) -
          Number(!nameKeys.includes(b.key as (typeof nameKeys)[number])) ||
        (context.groups.find((g) => g.id === a.group_id)?.display_order ?? 0) -
          (context.groups.find((g) => g.id === b.group_id)?.display_order ??
            0) ||
        (employmentOrder.includes(a.key) && employmentOrder.includes(b.key)
          ? employmentOrder.indexOf(a.key) - employmentOrder.indexOf(b.key)
          : a.key === "department"
            ? -1
            : b.key === "department"
              ? 1
              : a.key === "position"
                ? -1
                : b.key === "position"
                  ? 1
                  : 0),
    );
  const groups = [...new Set(regular.map((f) => f.group_name))];
  const tabs = employeeTabs(context.groups, formFields);
  const tabNames = [
    ...tabs.map((t) => t.name),
    ...(row ? ["Record history"] : []),
  ];
  const selectedTab = tabNames.includes(activeTab) ? activeTab : tabNames[0];
  function selectTab(name: string) {
    setActiveTab(name);
    body.current?.scrollTo({ top: 0 });
  }
  function revealField(key: string) {
    const field = formFields.find((f) => f.key === key);
    const tab = tabs.find((t) => t.groups.includes(field?.group_id ?? ""));
    if (tab) selectTab(tab.name);
  }
  async function save(changeKind?: "official" | "correction") {
    setError("");
    setBusy(true);
    try {
      if (Object.values(addressValid).includes(false)) {
        const invalidSection =
          Object.keys(addressValid).find((p) => addressValid[p] === false) ??
          "[]";
        selectTab(JSON.parse(invalidSection)[0]);
        throw new Error(
          "Confirm locations from the official lists before saving.",
        );
      }
      if (!row || nameKeys.some((key) => Object.hasOwn(changed, key))) {
        for (const key of ["last_name", "first_name"]) {
          // Blind updates may retain a server value unavailable to this operator.
          if (
            !row ||
            Object.hasOwn(changed, key) ||
            fields.find((f) => f.key === key)?.actions.includes("R")
          ) {
            if (typeof draft[key] !== "string" || !String(draft[key]).trim()) {
              revealField(key);
              throw new Error(
                `${key === "last_name" ? "Last Name" : "First Name"} is required.`,
              );
            }
          }
        }
      }
      const problems: Record<string, string> = {};
      for (const prefix of ["", "current_"]) {
        if (!addressKeys.some((key) => Object.hasOwn(changed, prefix + key)))
          continue;
        const hierarchy = ["province", "city_municipality", "barangay"];
        // Hidden unchanged values are validated by the database, never fetched to validate in the browser.
        if (
          !hierarchy.every(
            (key) =>
              Object.hasOwn(changed, prefix + key) ||
              fields.find((f) => f.key === prefix + key)?.actions.includes("R"),
          )
        )
          continue;
        const problem = await addressValidationError(
          addressValue(draft, prefix),
        );
        if (problem) problems[prefix] = problem;
      }
      setAddressErrors(problems);
      if (Object.keys(problems).length) {
        revealField(Object.keys(problems)[0] + "barangay");
        throw new Error("Correct the highlighted address before saving.");
      }
      const invalidNumber = body.current?.querySelector<HTMLInputElement>(
        '[data-number-field][aria-invalid="true"]',
      );
      if (invalidNumber) {
        revealField(invalidNumber.dataset.numberField!);
        throw new Error("Enter a valid number before saving.");
      }
      const invalidMobile = editable.find(
        (f) =>
          f.type === "phone" &&
          Object.hasOwn(changed, f.key) &&
          mobileError(draft[f.key]),
      );
      if (invalidMobile) {
        revealField(invalidMobile.key);
        throw new Error(mobileError(draft[invalidMobile.key]));
      }
      // Legacy profiles may be incomplete. Contact/address edits must not force
      // unrelated employment changes or require reading hidden employment values.
      const employmentProblem =
        !row ||
        employmentOrder.some(
          (key) => key !== "remarks" && Object.hasOwn(changed, key),
        )
          ? employmentError(draft)
          : undefined;
      if (employmentProblem) {
        revealField(employmentProblem.key);
        throw new Error(employmentProblem.message);
      }
      const missing = editable.find(
        (f) =>
          requiredForEdit(f, values, changed, !row) &&
          (draft[f.key] == null || draft[f.key] === ""),
      );
      if (missing) {
        revealField(missing.key);
        throw new Error(`${missing.label} is required.`);
      }
      const invalidId = editable.find((f) =>
        governmentIdError(f, draft[f.key]),
      );
      if (invalidId) {
        revealField(invalidId.key);
        throw new Error(governmentIdError(invalidId, draft[invalidId.key]));
      }
      if (
        Object.hasOwn(changed, "position") &&
        (typeof changed.position !== "string" ||
          !changed.position.trim() ||
          changed.position.trim().length > 200)
      ) {
        revealField("position");
        throw new Error("Enter a position of 1-200 characters.");
      }
      const o = options.find((o) => o.id === target);
      const employmentChanged = ["department", "position", "status"].some(
        (key) => Object.hasOwn(changed, key),
      );
      if (row && employmentChanged && !changeKind) {
        setChangeChoice(true);
        return;
      }
      const createValues = { ...changed };
      delete createValues.position;
      delete createValues.status;
      const employment = {
        change_kind: changeKind || "official",
        ...(Object.hasOwn(changed, "position")
          ? { position: changed.position }
          : {}),
        ...(Object.hasOwn(changed, "status")
          ? { status: employmentStatus(changed.status) }
          : {}),
      };
      const p = row
        ? {
            id: row.id,
            expected_version: detail?.employee.row_version ?? row.row_version,
            values: createValues,
            ...(employmentChanged ? { employment } : {}),
          }
        : {
            target_level: o?.kind || "unassigned",
            branch_id: o?.kind === "branch" ? o.id : o?.branch_id,
            client_id: o?.kind === "client" ? o.id : undefined,
            values: createValues,
            initial_position:
              typeof changed.position === "string" && changed.position.trim()
                ? changed.position.trim()
                : undefined,
            initial_employment: {
              change_kind: "official",
              status: employmentStatus(draft.status),
            },
          };
      await mutate(row ? "employee_update" : "employee_create", p);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Dialog
        title={row ? "Employee profile" : "New employee"}
        onClose={onClose}
        wide
        className="employee-dialog employee-edit-dialog"
      >
        <div className="employee-editor-summary">
          {row && (
            <div className="employee-identity-strip">
              <span className="employee-identity-avatar" aria-hidden="true">
                <UserRound size={22} />
              </span>
              <strong>
                {typeof values.name === "string"
                  ? values.name
                  : "Employee record"}
              </strong>
            </div>
          )}
          <p className="muted">
            {row
              ? `${row.values.employee_number || "Authorized record"} · Revision ${detail?.employee.row_version ?? row.row_version}`
              : "One permanent profile. System ID is allocated by the database."}
          </p>
          {row &&
            typeof values.name === "string" &&
            !nameKeys.some((key) => values[key] != null) && (
              <p className="muted">
                Recorded name: {values.name}. Enter the separate name parts to
                revise it.
              </p>
            )}
          {!row && (
            <SearchFilterPicker
              mode="single"
              label="Initial organization"
              options={options.filter((o) => o.active)}
              value={target ? [target] : []}
              onChange={(v) => setTarget(v[0] || "")}
            />
          )}
        </div>
        <div
          className="employee-form-tabs"
          role="tablist"
          aria-label="Employee sections"
          aria-orientation={verticalTabs ? "vertical" : "horizontal"}
        >
          {tabNames.map((name, index) => (
            <button
              type="button"
              key={name}
              role="tab"
              id={`${tabId}-tab-${index}`}
              aria-controls={`${tabId}-panel-${index}`}
              aria-selected={selectedTab === name}
              tabIndex={selectedTab === name ? 0 : -1}
              onClick={() => selectTab(name)}
              onKeyDown={(event) => {
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabNames.length - 1
                      : event.key === "ArrowRight" ||
                          (verticalTabs && event.key === "ArrowDown")
                        ? (index + 1) % tabNames.length
                        : event.key === "ArrowLeft" ||
                            (verticalTabs && event.key === "ArrowUp")
                          ? (index + tabNames.length - 1) % tabNames.length
                          : undefined;
                if (next !== undefined) {
                  event.preventDefault();
                  selectTab(tabNames[next]);
                  document.getElementById(`${tabId}-tab-${next}`)?.focus();
                }
              }}
            >
              {row &&
                (() => {
                  const Icon =
                    name === "Profile"
                      ? UserRound
                      : name === "Government ID"
                        ? ShieldCheck
                        : name === "Address"
                          ? MapPin
                          : name === "Record history"
                            ? History
                            : SlidersHorizontal;
                  return <Icon size={16} aria-hidden="true" />;
                })()}
              {name}
            </button>
          ))}
        </div>
        <div className="dialog-body employee-tab-body" ref={body}>
          {tabs.map((tab, index) => (
            <div
              key={tab.name}
              role="tabpanel"
              id={`${tabId}-panel-${index}`}
              aria-labelledby={`${tabId}-tab-${index}`}
              hidden={selectedTab !== tab.name}
            >
              {fields.some(
                (f) =>
                  tab.groups.includes(f.group_id) &&
                  [
                    ...(!editable.some((f) => f.key === "status")
                      ? ["status"]
                      : []),
                    ...(!editable.some((f) => f.key === "position")
                      ? ["position"]
                      : []),
                  ].includes(f.key) &&
                  f.actions.includes(row ? "R" : "C"),
              ) && (
                <div
                  className="employment-context"
                  role="group"
                  aria-label="Current employment"
                >
                  {fields
                    .filter(
                      (f) =>
                        tab.groups.includes(f.group_id) &&
                        [
                          ...(!editable.some((f) => f.key === "status")
                            ? ["status"]
                            : []),
                          ...(!editable.some((f) => f.key === "position")
                            ? ["position"]
                            : []),
                        ].includes(f.key) &&
                        f.actions.includes(row ? "R" : "C"),
                    )
                    .map((f) => (
                      <div className="employment-context-item" key={f.key}>
                        <span>{f.label}</span>
                        <output
                          aria-label={f.label}
                          className={f.key === "status" ? "badge" : undefined}
                        >
                          {String(row ? (values[f.key] ?? "—") : "Active") ||
                            "—"}
                        </output>
                      </div>
                    ))}
                  <small className="muted">Changes use Movements.</small>
                </div>
              )}
              {groups
                .filter((g) =>
                  regular.some(
                    (f) =>
                      f.group_name === g && tab.groups.includes(f.group_id),
                  ),
                )
                .map((g) => (
                  <fieldset key={g}>
                    <legend>
                      {g === "Address" &&
                      regular
                        .filter(
                          (f) =>
                            f.group_name === g &&
                            tab.groups.includes(f.group_id),
                        )
                        .every((f) => f.key.startsWith("emergency_contact_"))
                        ? "Emergency contact"
                        : g}
                    </legend>
                    <div className="form-grid field-entry-grid">
                      {regular
                        .filter((f) => f.group_name === g)
                        .map((f) => (
                          <div
                            key={f.key}
                            className="field-slot"
                            data-field={f.key}
                            style={
                              {
                                "--field-width": valueWidth(
                                  f.type,
                                  f.options,
                                  f.validation?.government_id_digits,
                                  f.key,
                                  f.validation?.input_width,
                                ),
                              } as CSSProperties
                            }
                          >
                            <ValueEditor
                              field={
                                [
                                  "emergency_contact_relationship",
                                  "emergency_relationship",
                                ].includes(f.key)
                                  ? {
                                      ...f,
                                      type: "select",
                                      options: [
                                        ...new Set([
                                          ...relationshipOptions,
                                          ...(f.options ?? []),
                                        ]),
                                      ],
                                    }
                                  : nameKeys.includes(
                                        f.key as (typeof nameKeys)[number],
                                      )
                                    ? {
                                        ...f,
                                        type: "short_text",
                                        required:
                                          !row &&
                                          ["last_name", "first_name"].includes(
                                            f.key,
                                          ),
                                      }
                                    : f.key === "position"
                                      ? {
                                          ...f,
                                          type: "short_text",
                                          required: inactive,
                                          help_text: "",
                                          validation: { max_length: 200 },
                                        }
                                      : f.key === "status"
                                        ? {
                                            ...f,
                                            type: "select",
                                            options: [
                                              "Active",
                                              "Inactive",
                                              "Separated",
                                            ],
                                            required: true,
                                          }
                                        : {
                                            ...f,
                                            required:
                                              (inactive &&
                                                inactiveEmploymentRequired.includes(
                                                  f.key,
                                                )) ||
                                              (inactive &&
                                                f.key ===
                                                  "separation_details") ||
                                              requiredForEdit(
                                                f,
                                                values,
                                                changed,
                                                !row,
                                              ),
                                          }
                              }
                              value={
                                Object.hasOwn(changed, f.key)
                                  ? changed[f.key]
                                  : f.key === "status"
                                    ? employmentStatus(draft.status)
                                    : draft[f.key]
                              }
                              blind={!!row && !f.actions.includes("R")}
                              clearable={
                                !["position", "status"].includes(f.key) &&
                                (!row || f.actions.includes("D"))
                              }
                              onChange={(value) =>
                                setChanged((v) => ({ ...v, [f.key]: value }))
                              }
                            />
                          </div>
                        ))}
                    </div>
                  </fieldset>
                ))}
              {["", "current_"].map((prefix) => {
                const access = addressAccess(fields, !!row, prefix);
                for (const key of addressKeys) {
                  access[key].visible =
                    access[key].visible &&
                    fields.some(
                      (f) =>
                        f.key === prefix + key &&
                        tab.groups.includes(f.group_id),
                    );
                }
                if (
                  !fields.some(
                    (f) =>
                      addressKeys.some((key) => prefix + key === f.key) &&
                      tab.groups.includes(f.group_id),
                  )
                )
                  return null;
                if (!Object.values(access).some((right) => right.visible))
                  return null;
                return (
                  <fieldset key={prefix || "home"}>
                    <legend>
                      {prefix ? "Current Address" : "Home Address"}
                    </legend>
                    <AddressFields
                      value={addressValue(draft, prefix)}
                      access={access}
                      disabled={busy}
                      onValidityChange={(valid) =>
                        setAddressValid((old) =>
                          old[JSON.stringify([tab.name, prefix])] === valid
                            ? old
                            : {
                                ...old,
                                [JSON.stringify([tab.name, prefix])]: valid,
                              },
                        )
                      }
                      onChange={(_, patch) => {
                        setChanged((old) => ({
                          ...old,
                          ...Object.fromEntries(
                            Object.entries(patch).map(([key, value]) => [
                              prefix + key,
                              value,
                            ]),
                          ),
                        }));
                        setAddressErrors((old) => ({ ...old, [prefix]: "" }));
                      }}
                    />
                    {addressErrors[prefix] && (
                      <p role="alert" className="address-error">
                        {addressErrors[prefix]}
                      </p>
                    )}
                  </fieldset>
                );
              })}
            </div>
          ))}
          {row && (
            <div
              role="tabpanel"
              id={`${tabId}-panel-${tabs.length}`}
              aria-labelledby={`${tabId}-tab-${tabs.length}`}
              hidden={selectedTab !== "Record history"}
            >
              <h3>Authorized current information</h3>
              <dl className="details">
                {Object.entries(values).map(([k, v]) => (
                  <div key={k}>
                    <dt>{fields.find((f) => f.key === k)?.label || k}</dt>
                    <dd>
                      {displayFieldValue(
                        fields.find((f) => f.key === k),
                        v,
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <h3>Assignments</h3>
              {detail?.assignments?.length ? (
                detail.assignments.map((a: any) => (
                  <p key={a.id}>
                    {a.category} ·{" "}
                    {options.find(
                      (o) => o.id === a.client_id || o.id === a.branch_id,
                    )?.label || a.target_level}{" "}
                    · {a.starts_on} to {a.ends_on || "open"}
                  </p>
                ))
              ) : (
                <p className="muted">No accessible assignments.</p>
              )}
              <h3>Movement timeline</h3>
              {detail?.movements?.length ? (
                detail.movements.map((m: any) => (
                  <div className="timeline-item" key={m.id}>
                    <strong>{m.type}</strong>
                    <span>
                      {m.effective_on} · {m.state}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">No accessible movement history.</p>
              )}
            </div>
          )}
          {error && (
            <FloatingNotification onDismiss={() => setError("")}>
              <p>{error}</p>
              {error.toLowerCase().includes("conflict") && (
                <button
                  onClick={async () => {
                    const d = await query("employee", { id: row!.id });
                    setDetail(d);
                    setValues(d.employee.values);
                    setFields(d.fields);
                  }}
                >
                  Reload authorized server values; retain draft
                </button>
              )}
            </FloatingNotification>
          )}
          {confirmArchive && (
            <div className="notice">
              <p>
                Archive this employee? The identity and authoritative history
                are retained.
              </p>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    await mutate("employee_delete", {
                      id: row!.id,
                      expected_version:
                        detail?.employee.row_version ?? row!.row_version,
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
                Confirm archive
              </button>
              <button onClick={() => setConfirmArchive(false)}>
                Keep employee
              </button>
            </div>
          )}
        </div>
        <footer>
          {row && context.capabilities.includes("employee_delete") && (
            <button className="danger" onClick={() => setConfirmArchive(true)}>
              Archive employee
            </button>
          )}
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={
              busy ||
              !Object.keys(changed).length ||
              Object.values(addressValid).includes(false)
            }
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save to Supabase"}
          </button>
        </footer>
      </Dialog>
      {changeChoice && (
        <Dialog
          title="Classify employment changes"
          onClose={() => setChangeChoice(false)}
        >
          <div className="dialog-body">
            <p>
              Is this an official employment change or a correction to a typing
              mistake?
            </p>
            <p>
              Official changes appear in movement history. Typo corrections
              update the current text and remain in the audit log.
            </p>
            {Object.hasOwn(changed, "status") && (
              <p>
                Status changes require an official movement because they affect
                effective assignments.
              </p>
            )}
          </div>
          <footer>
            <button onClick={() => setChangeChoice(false)}>Cancel</button>
            <button
              disabled={Object.hasOwn(changed, "status")}
              onClick={() => {
                setChangeChoice(false);
                void save("correction");
              }}
            >
              Typo correction
            </button>
            <button
              className="primary"
              onClick={() => {
                setChangeChoice(false);
                void save("official");
              }}
            >
              Official change
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
