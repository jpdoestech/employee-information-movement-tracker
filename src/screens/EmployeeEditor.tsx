import { AddressFields } from "../components/forms/AddressFields";
import {
  addressKeys,
  addressValue,
  addressAccess,
  relationshipOptions,
} from "../address/addressFields";
import { addressValidationError } from "../address/addressService";
import { FloatingNotification } from "../components/FloatingNotification";
import { useEffect, useId, useRef, useState } from "react";
import { employeeTabs, nameKeys } from "../employeeForm";
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
        f.type !== "system") &&
      f.actions.includes(row ? "U" : "C"),
  );
  const addressFieldKeys = new Set(
    ["", "current_"].flatMap((prefix) =>
      addressKeys.map((key) => prefix + key),
    ),
  );
  const draft = { ...values, ...changed };
  const structured =
    !row ||
    nameKeys.some(
      (key) =>
        values[key] != null ||
        !fields.find((f) => f.key === key)?.actions.includes("R"),
    );
  const regular = editable.filter(
    (f) => !addressFieldKeys.has(f.key) && !(structured && f.key === "name"),
  );
  const groups = [...new Set(regular.map((f) => f.group_name))];
  const tabs = employeeTabs(context.groups, fields);
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
    const field = fields.find((f) => f.key === key);
    const tab = tabs.find((t) => t.groups.includes(field?.group_id ?? ""));
    if (tab) selectTab(tab.name);
  }
  async function save() {
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
      if (structured || nameKeys.some((key) => Object.hasOwn(changed, key))) {
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
      const missing = editable.find(
        (f) => f.required && (draft[f.key] == null || draft[f.key] === ""),
      );
      if (missing) {
        revealField(missing.key);
        throw new Error(`${missing.label} is required.`);
      }
      const o = options.find((o) => o.id === target);
      const p = row
        ? {
            id: row.id,
            expected_version: detail?.employee.row_version ?? row.row_version,
            values: changed,
          }
        : {
            target_level: o?.kind || "unassigned",
            branch_id: o?.kind === "branch" ? o.id : o?.branch_id,
            client_id: o?.kind === "client" ? o.id : undefined,
            values: changed,
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
    <Dialog
      title={row ? "Employee profile" : "New employee"}
      onClose={onClose}
      wide
      className="employee-dialog"
    >
      <div className="employee-editor-summary">
        <p className="muted">
          {row
            ? `${row.values.employee_number || "Authorized record"} · Revision ${detail?.employee.row_version ?? row.row_version}`
            : "One permanent profile. System ID is allocated by the database."}
        </p>
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
                    : event.key === "ArrowRight"
                      ? (index + 1) % tabNames.length
                      : event.key === "ArrowLeft"
                        ? (index + tabNames.length - 1) % tabNames.length
                        : undefined;
              if (next !== undefined) {
                event.preventDefault();
                selectTab(tabNames[next]);
                document.getElementById(`${tabId}-tab-${next}`)?.focus();
              }
            }}
          >
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
            {groups
              .filter((g) =>
                regular.some(
                  (f) => f.group_name === g && tab.groups.includes(f.group_id),
                ),
              )
              .map((g) => (
                <fieldset key={g}>
                  <legend>
                    {g === "Address" &&
                    regular
                      .filter(
                        (f) =>
                          f.group_name === g && tab.groups.includes(f.group_id),
                      )
                      .every((f) => f.key.startsWith("emergency_contact_"))
                      ? "Emergency contact"
                      : g}
                  </legend>
                  <div
                    className={`form-grid${regular.filter((f) => f.group_name === g).every((f) => f.key === "name" || nameKeys.includes(f.key as (typeof nameKeys)[number])) ? " employee-name-grid" : ""}`}
                  >
                    {regular
                      .filter((f) => f.group_name === g)
                      .map((f) => (
                        <div key={f.key}>
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
                                  : f
                            }
                            value={
                              Object.hasOwn(changed, f.key)
                                ? changed[f.key]
                                : values[f.key]
                            }
                            blind={!!row && !f.actions.includes("R")}
                            onChange={(value) =>
                              setChanged((v) => ({ ...v, [f.key]: value }))
                            }
                          />
                          {row && f.actions.includes("D") && (
                            <button
                              type="button"
                              className="text-link"
                              onClick={() =>
                                setChanged((v) => ({ ...v, [f.key]: null }))
                              }
                            >
                              Clear value
                            </button>
                          )}
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
                      f.key === prefix + key && tab.groups.includes(f.group_id),
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
                  <legend>{prefix ? "Current Address" : "Home Address"}</legend>
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
                  <dd>{String(v ?? "—")}</dd>
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
              Archive this employee? The identity and authoritative history are
              retained.
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
          onClick={save}
        >
          {busy ? "Saving…" : "Save to Supabase"}
        </button>
      </footer>
    </Dialog>
  );
}
