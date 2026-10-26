import { trackTransaction } from "../transactions";
import { DuplicateEmployees } from "../components/DuplicateEmployees";
import type { DuplicateReview } from "../duplicateEmployees";
import {
  useClientIdMode,
  clientIdError,
  normalizeClientId,
} from "../clientIdentity";
import { ManualClientId } from "../components/ManualClientId";
import { ReplacementEmployee } from "../components/ReplacementEmployee";
import { manpowerError } from "../employmentValidation";
import { lengthOfService } from "../employeeOverview";
import { FieldTypeIcon } from "../components/FieldTypeIcon";
import { fieldTextRole } from "../typography";
import { mobileError } from "../identifiers";
import { confirmTransaction } from "../components/TransactionConfirmation";
import { EmployeeOverview } from "../components/EmployeeOverview";
import {
  employmentOrder,
  employmentDisplayOrder,
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
  Pencil,
  History,
} from "lucide-react";
import {
  addressKeys,
  addressPrefixes,
  addressLabels,
  addressValue,
  addressAccess,
  relationshipOptions,
} from "../address/addressFields";
import { addressValidationError } from "../address/addressService";
import { FloatingNotification } from "../components/FloatingNotification";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { valueWidth } from "../controlSizing";
import {
  combinedName,
  employeeTabs,
  nameKeys,
  defaultEntryPriority,
} from "../employeeForm";
import type { NameCase } from "../inputNormalization";
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
  const [editingOverview, setEditingOverview] = useState(false);
  const [editScope, setEditScope] = useState<string | null>(null);
  const [editorMounted, setEditorMounted] = useState(false);
  const [manualId, setManualId] = useState("");
  const [nameCases, setNameCases] = useState<Record<string, NameCase>>({});
  const verticalTabs = false;
  const [values, setValues] = useState<Record<string, unknown>>({}),
    [changed, setChanged] = useState<Record<string, unknown>>({}),
    [detail, setDetail] = useState<any>(),
    [history, setHistory] = useState<any>(),
    [historyError, setHistoryError] = useState(""),
    [historyRetry, setHistoryRetry] = useState(0),
    [recordFields, setFields] = useState(context.fields),
    [targetFields, setTargetFields] = useState<{
      key: string;
      fields: Field[];
      error?: string;
    }>(),
    [targetRetry, setTargetRetry] = useState(0),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [addressValid, setAddressValid] = useState<Record<string, boolean>>({}),
    [addressErrors, setAddressErrors] = useState<Record<string, string>>({});
  const targetKey = `${context.profile.id}:${context.revision}:${context.today}:${target}`;
  const targetSettled = targetFields?.key === targetKey;
  const targetReady = targetSettled && !targetFields.error;
  const fields = row ? recordFields : targetReady ? targetFields.fields : [];
  const dirtyDraft = useRef(false);
  dirtyDraft.current =
    Object.keys(changed).length > 0 ||
    Object.values(addressValid).includes(false);
  const initialClient = options.find(
    (option) => option.id === target && option.kind === "client",
  );
  const initialOrganization = options.find((option) => option.id === target);
  const automaticCategory =
    !row && initialOrganization
      ? initialOrganization.kind === "head_office"
        ? "Admin"
        : ["branch", "client"].includes(initialOrganization.kind || "")
          ? "Agency"
          : undefined
      : undefined;
  const idConfig = useClientIdMode(
    !row ? initialClient?.id : undefined,
    context.revision,
  );
  useEffect(() => setManualId(""), [target]);
  useEffect(() => {
    let active = true;
    if (row) {
      query("employee", { id: row.id, include_history: false })
        .then((d) => {
          if (active) {
            setDetail((current: any) =>
              dirtyDraft.current && current?.employee.id === d.employee.id
                ? {
                    ...d,
                    employee: {
                      ...d.employee,
                      row_version: current.employee.row_version,
                    },
                  }
                : d,
            );
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
      void trackTransaction("Checking employee fields", () =>
        query<Field[]>("target_fields", {
          target_level: o?.kind || "unassigned",
          branch_id: o?.kind === "branch" ? o.id : o?.branch_id,
          client_id: o?.kind === "client" ? o.id : undefined,
        }),
      )
        .then((f) => {
          if (active) setTargetFields({ key: targetKey, fields: f });
        })
        .catch((e) => {
          if (active)
            setTargetFields({ key: targetKey, fields: [], error: e.message });
        });
    }
    return () => {
      active = false;
    };
  }, [row?.id, targetKey, targetRetry]);
  const editable = fields.filter(
    (f) =>
      f.active &&
      !(automaticCategory && f.key === "employee_category") &&
      (f.key === "name" ||
        nameKeys.includes(f.key as (typeof nameKeys)[number]) ||
        f.type !== "system" ||
        ["position", "status"].includes(f.key)) &&
      f.actions.includes(row ? "U" : "C"),
  );
  const addressFieldKeys = new Set(
    addressPrefixes.flatMap((prefix) => addressKeys.map((key) => prefix + key)),
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
    ...(automaticCategory ? { employee_category: automaticCategory } : {}),
  } as Record<string, unknown>;
  const inactive = employmentStatus(draft.status) !== "Active";
  const department = fields.find(
    (f) =>
      f.key === "department" &&
      f.active &&
      context.groups.some((g) => g.id === f.group_id && g.active),
  );
  const formFields = fields.map((f) => {
    const section = context.groups.find(
      (g) => g.id === (f.form_group_id || f.group_id),
    );
    return f.form_group_id
      ? {
          ...f,
          group_id: f.form_group_id,
          group_name: section?.name || f.group_name,
        }
      : ["position", "status"].includes(f.key) && department
        ? {
            ...f,
            group_id: department.group_id,
            group_name: department.group_name,
          }
        : { ...f, group_name: section?.name || f.group_name };
  });
  const regular = editable
    .map((f) => formFields.find((shown) => shown.id === f.id) || f)
    .filter(
      (f) =>
        !addressFieldKeys.has(f.key) &&
        !["name", "status_reason"].includes(f.key) &&
        (f.key !== "replaced_employee_id" ||
          draft.manpower_classification === "Replacement") &&
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
  const displayFields = [
    ...regular,
    ...formFields.filter(
      (f) =>
        f.active &&
        (f.actions.includes("R") ||
          (automaticCategory &&
            f.key === "employee_category" &&
            f.actions.includes("C")) ||
          (!row &&
            idConfig.mode === "manual" &&
            f.key === "client_employee_number" &&
            f.actions.includes("C"))) &&
        employmentDisplayOrder.includes(f.key) &&
        (f.key !== "replaced_employee_id" ||
          draft.manpower_classification === "Replacement") &&
        !regular.some((entry) => entry.id === f.id) &&
        (![
          "status_effective_date",
          "separation_category",
          "separation_reason",
          "separation_details",
        ].includes(f.key) ||
          inactive) &&
        (f.key !== "separation_details" ||
          draft.separation_reason === "Others (specify)"),
    ),
  ];
  const canReadService = [
    "date_hired",
    "status",
    ...(inactive ? ["status_effective_date"] : []),
  ].every((key) =>
    fields.some(
      (f) => f.key === key && f.active && f.actions.includes(row ? "R" : "C"),
    ),
  );
  const service = canReadService ? lengthOfService(draft, context.today) : "—";
  const groups = context.groups
    .filter(
      (g) =>
        g.active &&
        (displayFields.some((f) => f.group_id === g.id) ||
          formFields.some(
            (f) =>
              f.group_id === g.id &&
              addressFieldKeys.has(f.key) &&
              f.actions.length,
          )),
    )
    .sort((a, b) => {
      const rootA = context.groups.find((g) => g.id === a.parent_group_id) || a,
        rootB = context.groups.find((g) => g.id === b.parent_group_id) || b;
      return (
        (rootA.tab_order ?? 0) - (rootB.tab_order ?? 0) ||
        rootA.name.localeCompare(rootB.name) ||
        Number(!!a.parent_group_id) - Number(!!b.parent_group_id) ||
        (a.display_order ?? 0) - (b.display_order ?? 0)
      );
    });
  const configuredTabs = employeeTabs(context.groups, formFields);
  const scopeGroups = editScope
    ? [
        editScope,
        ...context.groups
          .filter((g) => g.parent_group_id === editScope)
          .map((g) => g.id),
      ]
    : configuredTabs.flatMap((tab) => tab.groups);
  const editTitle = editScope
    ? `Edit ${context.groups.find((g) => g.id === editScope)?.name || "details"}`
    : "Edit details";
  const tabs = row
    ? [
        { name: "Overview", order: -1, groups: [] },
        ...(editorMounted
          ? [{ name: editTitle, order: 0, groups: scopeGroups }]
          : []),
      ]
    : configuredTabs;
  async function startEdit(groupId?: string) {
    const nextScope = groupId || null;
    if (
      (Object.keys(changed).length > 0 ||
        Object.values(addressValid).includes(false)) &&
      nextScope !== null &&
      nextScope !== editScope
    ) {
      const discard = await confirmTransaction(
        "Discard unsaved changes?",
        "Your changes have not been saved. Discard them to edit a different group, or continue editing.",
        "Discard changes",
        "Continue editing",
      );
      if (!discard) {
        setEditingOverview(true);
        selectTab(editTitle);
        return;
      }
      setChanged({});
      setAddressErrors({});
      setAddressValid({});
    }
    setEditorMounted(true);
    setEditScope(nextScope);
    setEditingOverview(true);
    setActiveTab(
      nextScope
        ? `Edit ${context.groups.find((g) => g.id === nextScope)?.name || "details"}`
        : "Edit details",
    );
    body.current?.scrollTo({ top: 0 });
  }
  const tabNames = [
    ...tabs.map((t) => t.name),
    ...(row ? ["Record history"] : []),
  ];
  const selectedTab = tabNames.includes(activeTab) ? activeTab : tabNames[0];
  const historyKey = `${context.profile.id}:${row?.id}:${context.revision}:${context.today}`;
  const historyReady = history?.key === historyKey;
  useEffect(() => {
    if (!row || selectedTab !== "Record history" || historyReady) return;
    let active = true;
    setHistoryError("");
    void trackTransaction("Loading employee history", () =>
      query("employee_history", { id: row.id }),
    )
      .then((data) => {
        if (active) setHistory({ ...data, key: historyKey });
      })
      .catch((e) => {
        if (active) setHistoryError(e.message);
      });
    return () => {
      active = false;
    };
  }, [historyKey, selectedTab, historyReady, historyRetry]);
  function selectTab(name: string) {
    if (row && name === "Overview") {
      setEditingOverview(false);
      document.getElementById(`${tabId}-tab-0`)?.focus();
    }
    setActiveTab(name);
    body.current?.scrollTo({ top: 0 });
  }
  function revealField(key: string) {
    const field = formFields.find((f) => f.key === key);
    if (row) {
      setEditScope(null);
      setEditorMounted(true);
      setEditingOverview(true);
      setActiveTab("Edit details");
    } else {
      const tab = configuredTabs.find((t) =>
        t.groups.includes(field?.group_id ?? ""),
      );
      if (tab) selectTab(tab.name);
    }
  }
  async function save(changeKind?: "official" | "correction") {
    if (!row && (!targetReady || !editable.length)) return;
    setError("");
    setBusy(true);
    try {
      if (Object.values(addressValid).includes(false)) {
        const invalidPrefix =
          Object.keys(addressValid).find(
            (prefix) => addressValid[prefix] === false,
          ) ?? "";
        revealField(invalidPrefix + "address");
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
      for (const prefix of addressPrefixes) {
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
          (key) =>
            ![
              "remarks",
              "employee_category",
              "manpower_classification",
              "replaced_employee_id",
            ].includes(key) && Object.hasOwn(changed, key),
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
      const manpowerProblem =
        !row ||
        ["manpower_classification", "replaced_employee_id"].some((key) =>
          Object.hasOwn(changed, key),
        )
          ? manpowerError(draft, !row)
          : undefined;
      if (manpowerProblem) {
        revealField(
          draft.manpower_classification === "Replacement"
            ? "replaced_employee_id"
            : "manpower_classification",
        );
        throw new Error(manpowerProblem);
      }
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
      if (!row && initialClient) {
        if (idConfig.error) throw new Error(idConfig.error);
        if (!idConfig.mode)
          throw new Error("Wait for client ID settings to load.");
        if (idConfig.mode === "manual" && clientIdError(manualId)) {
          revealField("client_employee_number");
          throw new Error(clientIdError(manualId));
        }
      }
      const createValues: Record<string, unknown> = {
        ...changed,
        ...(!row && automaticCategory
          ? { employee_category: automaticCategory }
          : {}),
      };
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
            ...(!row && initialClient && idConfig.mode === "manual"
              ? { manual_client_id: normalizeClientId(manualId) }
              : {}),
            initial_employment: {
              change_kind: "official",
              status: employmentStatus(draft.status),
            },
          };
      let duplicateReview: string | undefined;
      if (
        !row ||
        [...nameKeys, "birth_date"].some((key) => Object.hasOwn(changed, key))
      ) {
        const review = await trackTransaction(
          "Checking possible duplicate employees",
          () => query<DuplicateReview>("employee_duplicates", p),
        );
        if (review.total > 0) {
          if (
            !(await confirmTransaction(
              "Possible duplicate employee",
              <DuplicateEmployees review={review} />,
            ))
          )
            return;
          duplicateReview = review.token;
        }
      }
      await mutate(
        row ? "employee_update" : "employee_create",
        {
          ...p,
          ...(duplicateReview ? { duplicate_review: duplicateReview } : {}),
        },
        undefined,
        !!duplicateReview,
      );
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
        closeDisabled={busy}
        isDirty={
          row
            ? Object.keys(changed).length > 0 ||
              Object.values(addressValid).includes(false)
            : undefined
        }
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
                  ? nameKeys.some((key) => Object.hasOwn(changed, key))
                    ? combinedName(draft)
                    : values.name
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
            editingOverview &&
            typeof values.name === "string" &&
            !nameKeys.some((key) => values[key] != null) && (
              <p className="muted">
                Recorded name: {values.name}. Enter the separate name parts to
                revise it.
              </p>
            )}
          {row && detail && editable.length > 0 && (
            <div className="employee-profile-controls">
              <button type="button" onClick={() => startEdit()}>
                <Pencil size={14} aria-hidden="true" />
                Edit details
              </button>
            </div>
          )}
          {!row && (
            <SearchFilterPicker
              mode="single"
              label="Initial organization"
              disabled={busy}
              options={options.filter((o) => o.active)}
              value={target ? [target] : []}
              onChange={(v) => setTarget(v[0] || "")}
            />
          )}
          {!row && !targetSettled && (
            <p className="muted" role="status">
              Checking fields for the selected organization…
            </p>
          )}
          {!row && targetSettled && targetFields.error && (
            <>
              <FloatingNotification>{targetFields.error}</FloatingNotification>
              <button
                type="button"
                onClick={() => {
                  setTargetFields(undefined);
                  setTargetRetry((n) => n + 1);
                }}
              >
                Retry field access
              </button>
            </>
          )}
          {!row && targetReady && !editable.length && (
            <p className="muted">
              Choose an authorized branch or client to enter employee details.
            </p>
          )}
          {!row && initialClient && !idConfig.mode && !idConfig.error && (
            <FloatingNotification kind="loading">
              Loading client ID settings…
            </FloatingNotification>
          )}
          {!row && idConfig.error && (
            <FloatingNotification>{idConfig.error}</FloatingNotification>
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
              hidden={!!row && name === editTitle && !editingOverview}
              id={`${tabId}-tab-${index}`}
              aria-controls={`${tabId}-panel-${index}`}
              aria-selected={selectedTab === name}
              tabIndex={selectedTab === name ? 0 : -1}
              onClick={() => selectTab(name)}
              onKeyDown={(event) => {
                const visible = tabNames
                  .map((_, i) => i)
                  .filter(
                    (i) => !row || editingOverview || tabNames[i] !== editTitle,
                  );
                const position = visible.indexOf(index);
                const next =
                  event.key === "Home"
                    ? visible[0]
                    : event.key === "End"
                      ? visible[visible.length - 1]
                      : event.key === "ArrowRight"
                        ? visible[(position + 1) % visible.length]
                        : event.key === "ArrowLeft"
                          ? visible[
                              (position + visible.length - 1) % visible.length
                            ]
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
                  const Icon = ["Profile", "Overview"].includes(name)
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
          {row && editingOverview && (
            <div className="overview-actions">
              <button type="button" onClick={() => selectTab("Overview")}>
                Back to overview
              </button>
            </div>
          )}

          {tabs.map((tab, index) => (
            <div
              key={row && tab.name !== "Overview" ? "entry-editor" : tab.name}
              role="tabpanel"
              id={`${tabId}-panel-${index}`}
              aria-labelledby={`${tabId}-tab-${index}`}
              hidden={selectedTab !== tab.name}
            >
              {row && tab.name === "Overview" && detail && (
                <EmployeeOverview
                  key={`${row.id}:${editingOverview}`}
                  values={draft}
                  fields={fields}
                  groups={context.groups}
                  today={context.today}
                  employeeId={row.id}
                  revision={context.revision}
                  canEdit={false}
                  onEdit={startEdit}
                />
              )}
              {row && tab.name === "Overview" && !detail && !error && (
                <FloatingNotification kind="loading">
                  Loading employee information…
                </FloatingNotification>
              )}
              <div hidden={!!row && tab.name === "Overview"}>
                {!(row && tab.name === "Overview") && (
                  <>
                    {groups
                      .filter((g) => tab.groups.includes(g.id))
                      .map((g) => (
                        <Fragment key={g.id}>
                          <fieldset disabled={busy}>
                            <legend>
                              {g.parent_group_id
                                ? `${context.groups.find((parent) => parent.id === g.parent_group_id)?.name} / ${g.name}`
                                : g.name}
                            </legend>
                            <div className="form-grid field-entry-grid">
                              {displayFields
                                .filter((f) => f.group_id === g.id)
                                .sort((a, b) => {
                                  if (
                                    !employmentDisplayOrder.includes(a.key) &&
                                    !employmentDisplayOrder.includes(b.key)
                                  )
                                    return 0;
                                  const rank = (key: string) =>
                                    employmentDisplayOrder.indexOf(key) < 0
                                      ? 999
                                      : employmentDisplayOrder.indexOf(key);
                                  return rank(a.key) - rank(b.key);
                                })
                                .map((f) => (
                                  <Fragment key={f.key}>
                                    <div
                                      key={f.key}
                                      className="field-slot"
                                      data-field={f.key}
                                      style={
                                        {
                                          "--field-width": valueWidth(
                                            f.key ===
                                              "client_employee_number" &&
                                              !row &&
                                              idConfig.mode === "manual"
                                              ? "short_text"
                                              : f.type,
                                            f.options,
                                            f.validation?.government_id_digits,
                                            f.key,
                                            f.validation?.input_width,
                                          ),
                                        } as CSSProperties
                                      }
                                    >
                                      {f.key === "client_employee_number" &&
                                      !row &&
                                      idConfig.mode === "manual" ? (
                                        <ManualClientId
                                          field={f}
                                          value={manualId}
                                          onChange={setManualId}
                                          required
                                          disabled={busy}
                                        />
                                      ) : f.key === "replaced_employee_id" &&
                                        editable.some(
                                          (entry) => entry.id === f.id,
                                        ) ? (
                                        <ReplacementEmployee
                                          creating={!row}
                                          disabled={busy}
                                          field={f}
                                          value={draft[f.key]}
                                          revision={context.revision}
                                          onChange={(value) =>
                                            setChanged((v) => ({
                                              ...v,
                                              [f.key]: value,
                                            }))
                                          }
                                        />
                                      ) : !editable.some(
                                          (entry) => entry.id === f.id,
                                        ) ? (
                                        <div className="field">
                                          <label
                                            htmlFor={`${tabId}-reference-${f.key}`}
                                          >
                                            {f.label}
                                          </label>
                                          <div className="read-only-control">
                                            <FieldTypeIcon type={f.type} />
                                            <output
                                              id={`${tabId}-reference-${f.key}`}
                                              className={fieldTextRole(f)}
                                            >
                                              {f.key ===
                                              "replaced_employee_id" ? (
                                                <ReplacementEmployee
                                                  value={draft[f.key]}
                                                  revision={context.revision}
                                                />
                                              ) : f.key === "status" ? (
                                                employmentStatus(draft.status)
                                              ) : (
                                                displayFieldValue(
                                                  f,
                                                  draft[f.key],
                                                )
                                              )}
                                            </output>
                                          </div>
                                        </div>
                                      ) : (
                                        <ValueEditor
                                          nameCase={
                                            nameCases[f.key] ??
                                            (row &&
                                            typeof values[f.key] === "string" &&
                                            values[f.key] !==
                                              String(
                                                values[f.key],
                                              ).toUpperCase()
                                              ? "user_defined"
                                              : "upper")
                                          }
                                          onNameCaseChange={(mode) =>
                                            setNameCases((current) => ({
                                              ...current,
                                              [f.key]: mode,
                                            }))
                                          }
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
                                                      [
                                                        "last_name",
                                                        "first_name",
                                                      ].includes(f.key),
                                                  }
                                                : f.key === "position"
                                                  ? {
                                                      ...f,
                                                      type: "short_text",
                                                      required: inactive,
                                                      help_text: "",
                                                      validation: {
                                                        max_length: 200,
                                                      },
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
                                          blind={
                                            !!row && !f.actions.includes("R")
                                          }
                                          clearable={
                                            !["position", "status"].includes(
                                              f.key,
                                            ) &&
                                            (!row || f.actions.includes("D"))
                                          }
                                          onChange={(value) =>
                                            setChanged((v) => ({
                                              ...v,
                                              [f.key]: value,
                                              ...(f.key ===
                                                "manpower_classification" &&
                                              value !== "Replacement" &&
                                              draft.replaced_employee_id
                                                ? { replaced_employee_id: null }
                                                : {}),
                                            }))
                                          }
                                        />
                                      )}
                                    </div>
                                    {f.key === "date_hired" && (
                                      <div
                                        className="field-slot"
                                        data-field="date_hired-duration"
                                        style={
                                          {
                                            "--field-width": "34ch",
                                          } as CSSProperties
                                        }
                                      >
                                        <div className="field">
                                          <label htmlFor={`${tabId}-service`}>
                                            Length of Service
                                          </label>
                                          <div className="read-only-control">
                                            <FieldTypeIcon type="date" />
                                            <output id={`${tabId}-service`}>
                                              {service}
                                            </output>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </Fragment>
                                ))}
                            </div>
                          </fieldset>
                          {addressPrefixes.map((prefix) => {
                            const access = addressAccess(fields, !!row, prefix);
                            for (const key of addressKeys) {
                              access[key].visible =
                                access[key].visible &&
                                formFields.some(
                                  (f) =>
                                    f.key === prefix + key &&
                                    f.group_id === g.id,
                                );
                            }
                            if (
                              !formFields.some(
                                (f) =>
                                  addressKeys.some(
                                    (key) => prefix + key === f.key,
                                  ) && f.group_id === g.id,
                              )
                            )
                              return null;
                            if (
                              !Object.values(access).some(
                                (right) => right.visible,
                              )
                            )
                              return null;
                            return (
                              <fieldset key={prefix || "home"}>
                                <legend>{addressLabels[prefix]}</legend>
                                <AddressFields
                                  value={addressValue(draft, prefix)}
                                  access={access}
                                  disabled={busy}
                                  onValidityChange={(valid) =>
                                    setAddressValid((old) =>
                                      old[prefix] === valid
                                        ? old
                                        : { ...old, [prefix]: valid },
                                    )
                                  }
                                  onChange={(_, patch) => {
                                    setChanged((old) => ({
                                      ...old,
                                      ...Object.fromEntries(
                                        Object.entries(patch).map(
                                          ([key, value]) => [
                                            prefix + key,
                                            value,
                                          ],
                                        ),
                                      ),
                                    }));
                                    setAddressErrors((old) => ({
                                      ...old,
                                      [prefix]: "",
                                    }));
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
                        </Fragment>
                      ))}
                  </>
                )}
              </div>
            </div>
          ))}
          {row && (
            <div
              role="tabpanel"
              id={`${tabId}-panel-${tabs.length}`}
              aria-labelledby={`${tabId}-tab-${tabs.length}`}
              hidden={selectedTab !== "Record history"}
            >
              {selectedTab === "Record history" &&
                !historyReady &&
                !historyError && (
                  <FloatingNotification kind="loading">
                    Loading employee history…
                  </FloatingNotification>
                )}
              {selectedTab === "Record history" &&
                !historyReady &&
                historyError && (
                  <div>
                    <FloatingNotification>{historyError}</FloatingNotification>
                    <button onClick={() => setHistoryRetry((n) => n + 1)}>
                      Retry history
                    </button>
                  </div>
                )}
              {selectedTab === "Record history" && historyReady && (
                <>
                  <h3>Assignments</h3>
                  {history.assignments?.length ? (
                    history.assignments.map((a: any) => (
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
                  {history.movements?.length ? (
                    history.movements.map((m: any) => (
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
                </>
              )}
            </div>
          )}
          {error && (
            <FloatingNotification onDismiss={() => setError("")}>
              <p>{error}</p>
              {error.toLowerCase().includes("conflict") && (
                <button
                  onClick={async () => {
                    const d = await query("employee", {
                      id: row!.id,
                      include_history: false,
                    });
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
        </div>
        <footer>
          {row && context.capabilities.includes("employee_delete") && (
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  if (
                    !(await confirmTransaction(
                      "Archive employee",
                      "Archive this employee? The identity and authoritative history are retained.",
                    ))
                  )
                    return;
                  await mutate(
                    "employee_delete",
                    {
                      id: row.id,
                      expected_version:
                        detail?.employee.row_version ?? row.row_version,
                    },
                    undefined,
                    true,
                  );
                  onSaved();
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Archive employee
            </button>
          )}
          <button disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              (!row && (!targetReady || !editable.length)) ||
              (!row && !!initialClient && !idConfig.mode) ||
              !Object.keys(changed).length ||
              Object.values(addressValid).includes(false)
            }
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
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
