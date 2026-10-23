import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Eye, Plus } from "lucide-react";
import { isDemo, mutate, query, reviewAccessChange } from "../api";
import type { Context, Option } from "../domain";
import { accessPresets, grantStatus, scopeLabel } from "../accessReview";
import { Dialog } from "./Dialog";
import { AccessChangeReview } from "./AccessChangeReview";
import { trackTransaction } from "../transactions";
import { FloatingNotification } from "./FloatingNotification";
import { SearchFilterPicker } from "./SearchFilterPicker";
import {
  confirmTransaction,
  requireConfirmation,
} from "./TransactionConfirmation";

type Module = { code: string; name: string; actions: string[] };
type Rule = {
  mode: string;
  employee_id?: string | null;
  departments: string[];
  assigned: string[];
};
type Configuration = {
  modules: Module[];
  roles: { code: string; name: string }[];
  memberships: string[];
  overrides: any[];
  role_permissions: any[];
  policies: any[];
  scopes: any[];
  record_rule: Rule;
  reporting: string[];
  departments: string[];
  revision: number;
  today: string;
};
const actions = [
  "view",
  "create",
  "update",
  "delete",
  "export",
  "approve",
  "manage",
];
const fieldActions = ["R", "C", "U", "D"];
const fieldLabels: Record<string, string> = {
  R: "View",
  C: "Create",
  U: "Update",
  D: "Clear value",
};
const emptyRule: Rule = { mode: "organization", departments: [], assigned: [] };
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function PermissionMatrix({
  context,
  users,
  initialUser,
  options,
  onSaved,
}: {
  context: Context;
  users: any[];
  initialUser: string;
  options: Option[];
  onSaved: () => void;
}) {
  const [user, setUser] = useState(initialUser),
    [role, setRole] = useState(""),
    [section, setSection] = useState("modules"),
    [config, setConfig] = useState<Configuration>(),
    [edits, setEdits] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(""),
    [scope, setScope] = useState("all"),
    [descendants, setDescendants] = useState(false),
    [preset, setPreset] = useState(""),
    [grantActions, setGrantActions] = useState(["R"]),
    [grant, setGrant] = useState(false),
    [starts, setStarts] = useState(context.today),
    [ends, setEnds] = useState(""),
    [memberships, setMemberships] = useState<string[] | null>(null),
    [recordRule, setRecordRule] = useState<Rule | null>(null),
    [reports, setReports] = useState<string[] | null>(null),
    [revoked, setRevoked] = useState<string[]>([]),
    [expanded, setExpanded] = useState<string[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [effective, setEffective] = useState<any>(),
    [inspect, setInspect] = useState(false),
    [inspectEmployee, setInspectEmployee] = useState<string[]>([]),
    [newRole, setNewRole] = useState(false),
    [roleName, setRoleName] = useState(""),
    [roleCode, setRoleCode] = useState("");
  const dirty =
    Object.keys(edits).length > 0 ||
    memberships !== null ||
    recordRule !== null ||
    reports !== null ||
    grant ||
    revoked.length > 0;
  const account = users.find((u) => u.id === user);
  const scopes: Option[] = [
    { id: "all", label: "All organization scopes", kind: "all" },
    { id: "head_office", label: "Head Office", kind: "head_office" },
    { id: "unassigned", label: "Unassigned employees", kind: "unassigned" },
    ...options.filter((o) => o.kind !== "head_office"),
  ];
  const target = scopes.find((o) => o.id === scope);
  const scopeData = {
    scope_type: target?.kind || "all",
    scope_id:
      target && ["branch", "client"].includes(target.kind || "")
        ? target.id
        : null,
    include_descendants: target?.kind === "branch" && descendants,
  };
  const rule = recordRule || config?.record_rule || emptyRule;
  function resetDraft() {
    setEdits({});
    setMemberships(null);
    setRecordRule(null);
    setReports(null);
    setGrant(false);
    setRevoked([]);
    setReason("");
    setPreset("");
  }
  async function changeSubject(nextUser: string, nextRole: string) {
    if (nextUser === user && nextRole === role) return;
    if (
      dirty &&
      !(await confirmTransaction(
        "Discard unsaved changes?",
        "The permission changes have not been saved.",
        "Discard changes",
        "Continue editing",
      ))
    )
      return;
    resetDraft();
    setUser(nextUser);
    setRole(nextRole);
    setConfig(undefined);
    setError("");
  }
  useEffect(() => {
    let active = true;
    query<Configuration>("access_configuration", { user_id: user || null })
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user, role, context.revision]);
  const loadEmployees = async (search: string): Promise<Option[]> => {
    const result = await query("employees", {
      search,
      limit: 100,
      offset: 0,
      sort: "name",
    });
    return result.items.map((e: any) => ({
      id: e.id,
      label: e.values.name || e.values.employee_number || e.id,
      context: e.values.branch,
    }));
  };
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function fieldEffect(id: string, action: string) {
    const matches =
      config?.policies.filter(
        (p) =>
          (role ? p.role === role : p.user_id === user) &&
          (p.group_id || p.field_id) === id &&
          p.action === action &&
          p.scope_type === scopeData.scope_type &&
          (p.scope_id || null) === scopeData.scope_id,
      ) || [];
    return matches.some((p) => p.effect === "deny")
      ? "deny"
      : matches[0]?.effect || "inherit";
  }
  function cell(key: string, original: string, label: string) {
    return (
      <select
        aria-label={label}
        value={edits[key] ?? original}
        disabled={busy || (!user && !role)}
        className={`permission-cell ${edits[key] ?? original}`}
        onChange={(e) =>
          setEdits((old) => {
            const next = { ...old };
            if (e.target.value === original) delete next[key];
            else next[key] = e.target.value;
            return next;
          })
        }
      >
        <option value="inherit">Inherit</option>
        <option value="allow">Allow</option>
        <option value="deny">Deny</option>
      </select>
    );
  }
  async function save() {
    const modules = Object.entries(edits)
      .filter(([k]) => k.startsWith("m:"))
      .map(([k, effect]) => {
        const [, module, action] = k.split(":");
        return { module, action, effect };
      });
    const fields = Object.entries(edits)
      .filter(([k]) => k.startsWith("f:") || k.startsWith("g:"))
      .map(([k, effect]) => {
        const [type, id, action] = k.split(":");
        return {
          [type === "g" ? "group_id" : "field_id"]: id,
          action,
          effect,
          inherit_new: true,
        };
      });
    const payload = {
      ...(role ? { role_id: role } : { user_id: user }),
      modules,
      fields,
      ...scopeData,
      reason,
      ...(memberships !== null ? { memberships } : {}),
      ...(recordRule !== null ? { record_rule: recordRule } : {}),
      ...(reports !== null ? { reports, record_rule: rule } : {}),
      ...(grant
        ? {
            scope_grant: {
              ...scopeData,
              actions: grantActions,
              starts_on: starts,
              ends_on: ends || null,
            },
          }
        : {}),
      revoke_scopes: revoked,
    };
    const review = await reviewAccessChange("access_matrix", payload);
    await requireConfirmation(
      "Save access changes",
      <div className="matrix-review">
        <p>
          <strong>
            {role
              ? config?.roles.find((r) => r.code === role)?.name
              : account?.display_name}
          </strong>
        </p>
        <p>
          {modules.length} module changes · {fields.length} field changes.
          Explicit denies override ordinary grants. Scope and field requirements
          still apply.
        </p>
        {modules.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Action</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={`${m.module}.${m.action}`}>
                  <td>
                    {config?.modules.find((x) => x.code === m.module)?.name}
                  </td>
                  <td>{title(m.action)}</td>
                  <td>{title(m.effect)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {fields.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Field / group</th>
                <th>Action</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f: any) => (
                <tr key={`${f.group_id || f.field_id}.${f.action}`}>
                  <td>
                    {context.groups.find((g) => g.id === f.group_id)?.name ||
                      context.fields.find((x) => x.id === f.field_id)?.label}
                  </td>
                  <td>{fieldLabels[f.action]}</td>
                  <td>{title(f.effect)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {recordRule !== null && (
          <p>
            Record scope: {rule.mode.replaceAll("_", " ")}.{" "}
            {rule.departments.length} departments; {rule.assigned.length}{" "}
            assigned records.
          </p>
        )}
        {memberships !== null && (
          <p>
            Additional roles:{" "}
            {memberships
              .map((code) => config?.roles.find((r) => r.code === code)?.name)
              .join(", ") || "None"}
            .
          </p>
        )}
        {reports !== null && <p>{reports.length} direct reports.</p>}
        {grant && (
          <p>
            Add {grantActions.join("/")} organization grant at{" "}
            {scopeLabel(scopeData, options)}, starting {starts}
            {ends ? ` until ${ends} (exclusive)` : " with no end date"}.
          </p>
        )}
        {revoked.length > 0 && (
          <p>Revoke {revoked.length} organization grants.</p>
        )}
        <AccessChangeReview
          impact={{
            ...review,
            targets: review.targets || [],
            changes: review.changes || [],
          }}
          summary="Effective permission changes for affected accounts"
        />
        <p>Reason: {reason}</p>
      </div>,
    );
    await mutate(
      "access_matrix",
      {
        ...payload,
        review_revision: review.revision,
        review_date: review.today,
      },
      undefined,
      true,
    );
    resetDraft();
    setNotice("Access changes saved.");
    onSaved();
  }
  async function inspectAccess() {
    setEffective(
      await trackTransaction("Inspecting effective access", () =>
        query("effective_access", {
          user_id: user,
          target_level: target?.kind,
          branch_id: target?.kind === "branch" ? target.id : target?.branch_id,
          client_id: target?.kind === "client" ? target.id : null,
          employee_id: inspectEmployee[0] || null,
        }),
      ),
    );
  }
  return (
    <div className="permission-workspace">
      <div className="permission-toolbar">
        <SearchFilterPicker
          mode="single"
          label="User"
          options={users.map((u) => ({
            id: u.id,
            label: u.display_name,
            context: u.role,
          }))}
          value={user ? [user] : []}
          onChange={(v) => void changeSubject(v[0] || "", "")}
        />
        <SearchFilterPicker
          mode="single"
          label="Role template"
          options={(config?.roles || [])
            .filter((r) => r.code !== "superadmin")
            .map((r) => ({ id: r.code, label: r.name }))}
          value={role ? [role] : []}
          onChange={(v) => void changeSubject("", v[0] || "")}
        />
        <button onClick={() => setNewRole(true)} disabled={busy}>
          <Plus size={14} aria-hidden />
          New role
        </button>
        <button
          disabled={!user || busy}
          onClick={() => {
            setInspect(true);
            setEffective(undefined);
            void run(inspectAccess);
          }}
        >
          <Eye size={14} aria-hidden />
          View Effective Access
        </button>
      </div>
      <nav className="access-section-tabs" aria-label="User access sections">
        {[
          ["modules", "Permission matrix"],
          ["fields", "Field permissions"],
          ["scope", "Scope & assignments"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={section === id ? "page" : undefined}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="permission-body data-scroll-region">
        {!user && !role && (
          <p>Select a user or role template to edit permissions.</p>
        )}
        {isDemo() && (
          <p className="muted">
            Synthetic preview. Live access is evaluated by the server.
          </p>
        )}
        {section === "modules" && (
          <>
            <p className="muted">
              Inherit uses roles and existing grants. Allow grants only this
              action. Deny overrides ordinary grants. Record scopes and field
              policies still apply.
            </p>
            <div className="permission-table-scroll">
              <table className="permission-matrix">
                <caption className="sr-only">Module permission matrix</caption>
                <thead>
                  <tr>
                    <th>Module</th>
                    {actions.map((a) => (
                      <th key={a}>{title(a)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {config?.modules.map((m) => (
                    <tr key={m.code}>
                      <th scope="row">{m.name}</th>
                      {actions.map((a) => (
                        <td key={a}>
                          {m.actions.includes(a) ? (
                            cell(
                              `m:${m.code}:${a}`,
                              (role
                                ? config.role_permissions.filter(
                                    (p) => p.role === role,
                                  )
                                : config.overrides
                              ).find(
                                (p) => p.module === m.code && p.action === a,
                              )?.effect || "inherit",
                              `${m.name} ${title(a)}`,
                            )
                          ) : (
                            <span aria-label="Not applicable">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {user && (
              <div className="form-control">
                <span>Additional roles</span>
                <SearchFilterPicker
                  mode="multiple"
                  label="Additional roles"
                  options={(config?.roles || [])
                    .filter(
                      (r) =>
                        !["superadmin", "admin", "viewer"].includes(r.code),
                    )
                    .map((r) => ({ id: r.code, label: r.name }))}
                  value={memberships || config?.memberships || []}
                  onChange={setMemberships}
                />
              </div>
            )}
            {account?.role === "superadmin" && (
              <p>
                Superadmin retains the trusted override. Ordinary role or user
                denies do not remove that trusted access.
              </p>
            )}
          </>
        )}
        {section === "fields" && (
          <>
            <div className="permission-toolbar">
              <SearchFilterPicker
                mode="single"
                label="Organization scope"
                options={scopes}
                value={[scope]}
                onChange={(v) => {
                  if (dirty) {
                    setError(
                      "Save or discard your draft before changing its organization scope.",
                    );
                    return;
                  }
                  setScope(v[0] || "all");
                }}
              />
              <label>
                <input
                  type="checkbox"
                  checked={descendants}
                  disabled={target?.kind !== "branch" || dirty}
                  onChange={(e) => setDescendants(e.target.checked)}
                />
                Include branch clients
              </label>
            </div>
            <p className="muted">
              Edit any number of groups together. Expand a group for individual
              fields. Group allows cover normal fields; restricted fields
              require an individual allow. Clear value does not archive an
              employee.
            </p>
            <div className="permission-table-scroll">
              <table className="permission-matrix">
                <thead>
                  <tr>
                    <th>Field group / field</th>
                    {fieldActions.map((a) => (
                      <th key={a}>{fieldLabels[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {context.groups
                    .filter((g) => g.active)
                    .map((g) => (
                      <GroupRows
                        key={g.id}
                        group={g}
                        fields={context.fields.filter(
                          (f) => f.group_id === g.id && f.active,
                        )}
                        expanded={expanded.includes(g.id)}
                        toggle={() =>
                          setExpanded((old) =>
                            old.includes(g.id)
                              ? old.filter((id) => id !== g.id)
                              : [...old, g.id],
                          )
                        }
                        cell={cell}
                        effect={fieldEffect}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {section === "scope" && (
          <>
            {role ? (
              <p>
                Organization and record scopes belong to user accounts. Role
                templates supply module and field permissions.
              </p>
            ) : (
              <>
                <div className="form-grid">
                  <div className="form-control">
                    <span>Access preset</span>
                    <SearchFilterPicker
                      mode="single"
                      label="Access preset"
                      value={preset ? [preset] : []}
                      options={accessPresets.map((p) => ({
                        id: p.id,
                        label: p.label,
                      }))}
                      onChange={(v) => {
                        if (
                          Object.keys(edits).some((k) => !k.startsWith("m:"))
                        ) {
                          setError(
                            "Save field changes before applying another scope preset.",
                          );
                          return;
                        }
                        const p = accessPresets.find((p) => p.id === v[0]);
                        if (!p) {
                          setPreset("");
                          return;
                        }
                        setPreset(p.id);
                        setGrantActions([...p.actions]);
                        setDescendants(p.descendants);
                        setGrant(true);
                        setScope(
                          ["all", "head_office"].includes(p.kind)
                            ? p.kind
                            : target?.kind === p.kind
                              ? scope
                              : "",
                        );
                      }}
                    />
                  </div>
                  <div className="form-control">
                    <span>Organization scope</span>
                    <SearchFilterPicker
                      mode="single"
                      label="Organization scope"
                      options={scopes}
                      value={scope ? [scope] : []}
                      onChange={(v) => {
                        if (
                          Object.keys(edits).some((k) => !k.startsWith("m:"))
                        ) {
                          setError(
                            "Save field changes before changing their scope.",
                          );
                          return;
                        }
                        setScope(v[0] || "");
                        setPreset("");
                      }}
                    />
                  </div>
                </div>
                <p className="muted">
                  Presets prepare an organization grant. Module and field
                  permissions remain separate matrix choices in the same save.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={grant}
                    onChange={(e) => setGrant(e.target.checked)}
                  />
                  Add an organization grant with this save
                </label>
                {grant && (
                  <>
                    <div className="checks">
                      {fieldActions.map((a) => (
                        <label key={a}>
                          <input
                            type="checkbox"
                            checked={grantActions.includes(a)}
                            onChange={(e) => {
                              setPreset("");
                              setGrantActions((old) =>
                                e.target.checked
                                  ? [...old, a]
                                  : old.filter((x) => x !== a),
                              );
                            }}
                          />
                          {fieldLabels[a]}
                        </label>
                      ))}
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={descendants}
                        disabled={target?.kind !== "branch"}
                        onChange={(e) => {
                          setDescendants(e.target.checked);
                          setPreset("");
                        }}
                      />
                      Include branch clients
                    </label>
                    <div className="form-grid">
                      <label>
                        Starts
                        <input
                          type="date"
                          value={starts}
                          onChange={(e) => setStarts(e.target.value)}
                        />
                      </label>
                      <label>
                        Ends (exclusive)
                        <input
                          type="date"
                          value={ends}
                          onChange={(e) => setEnds(e.target.value)}
                        />
                      </label>
                    </div>
                  </>
                )}
                <table>
                  <thead>
                    <tr>
                      <th>Existing organization scope</th>
                      <th>Actions</th>
                      <th>Status</th>
                      <th>Remove on save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config?.scopes.map((g) => (
                      <tr key={g.id}>
                        <td>{scopeLabel(g, options)}</td>
                        <td>{g.actions.join(" / ")}</td>
                        <td>{grantStatus(g, context.today)}</td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Revoke ${scopeLabel(g, options)}`}
                            checked={revoked.includes(g.id)}
                            onChange={(e) =>
                              setRevoked((old) =>
                                e.target.checked
                                  ? [...old, g.id]
                                  : old.filter((id) => id !== g.id),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3>Record restrictions</h3>
                <p className="muted">
                  These restrict organization grants further. They never grant
                  access to another branch or to denied fields.
                </p>
                <div className="form-grid">
                  <div className="form-control">
                    <span>Record scope</span>
                    <SearchFilterPicker
                      mode="single"
                      label="Record scope"
                      options={[
                        ["organization", "Organization grants"],
                        ["self", "Own employee record"],
                        ["direct_reports", "Direct reports"],
                        ["department", "Selected departments"],
                        ["assigned", "Assigned records"],
                      ].map(([id, label]) => ({ id, label }))}
                      value={[rule.mode]}
                      onChange={(v) =>
                        setRecordRule({ ...rule, mode: v[0] || "self" })
                      }
                    />
                  </div>
                  <div className="form-control">
                    <span>Linked employee</span>
                    <SearchFilterPicker
                      mode="single"
                      label="Linked employee"
                      load={loadEmployees}
                      value={rule.employee_id ? [rule.employee_id] : []}
                      onChange={(v) => {
                        setRecordRule({ ...rule, employee_id: v[0] || null });
                        setReports(null);
                      }}
                    />
                  </div>
                </div>
                {rule.mode === "department" && (
                  <SearchFilterPicker
                    mode="multiple"
                    label="Departments"
                    options={(config?.departments || []).map((d) => ({
                      id: d,
                      label: d,
                    }))}
                    value={rule.departments}
                    onChange={(v) => setRecordRule({ ...rule, departments: v })}
                  />
                )}
                {rule.mode === "assigned" && (
                  <SearchFilterPicker
                    mode="multiple"
                    label="Assigned employee records"
                    load={loadEmployees}
                    value={rule.assigned}
                    onChange={(v) => setRecordRule({ ...rule, assigned: v })}
                  />
                )}
                {rule.mode === "direct_reports" && (
                  <SearchFilterPicker
                    mode="multiple"
                    label="Direct reports"
                    load={loadEmployees}
                    value={reports || config?.reporting || []}
                    disabled={!rule.employee_id}
                    onChange={setReports}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="permission-save-bar">
        <label>
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for access changes"
          />
        </label>
        <button
          disabled={busy || !dirty}
          onClick={async () => {
            if (
              await confirmTransaction(
                "Discard unsaved changes?",
                "Discard the permission draft?",
                "Discard changes",
                "Continue editing",
              )
            )
              resetDraft();
          }}
        >
          Discard draft
        </button>
        <button
          className="primary"
          disabled={
            busy ||
            !dirty ||
            !reason.trim() ||
            (!user && !role) ||
            !config ||
            (grant &&
              (!scope ||
                !grantActions.length ||
                !starts ||
                Boolean(ends && ends <= starts))) ||
            (["self", "direct_reports"].includes(rule.mode) &&
              !rule.employee_id)
          }
          onClick={() => void run(save)}
        >
          Save
        </button>
      </div>
      {(error || notice) && !inspect && !newRole && (
        <FloatingNotification
          kind={error ? "error" : "notice"}
          onDismiss={() => {
            setError("");
            setNotice("");
          }}
        >
          {error || notice}
        </FloatingNotification>
      )}
      {inspect && (
        <Dialog
          title="View Effective Access"
          wide
          className="effective-access-dialog"
          isDirty={false}
          onClose={() => setInspect(false)}
        >
          <div className="dialog-scroll">
            {error && (
              <FloatingNotification onDismiss={() => setError("")}>
                {error}
              </FloatingNotification>
            )}
            <p>
              <strong>{account?.display_name}</strong> · Saved access. Unsaved
              matrix changes are excluded.
            </p>
            <div className="permission-toolbar">
              <SearchFilterPicker
                mode="single"
                label="Employee record to inspect"
                load={loadEmployees}
                value={inspectEmployee}
                onChange={setInspectEmployee}
              />
              <button disabled={busy} onClick={() => void run(inspectAccess)}>
                Inspect
              </button>
            </div>
            {effective && (
              <>
                <p>
                  <strong>Roles:</strong> {effective.roles.join(", ")}
                </p>
                <p>
                  <strong>Record scope:</strong>{" "}
                  {effective.record_rule.mode.replaceAll("_", " ")}
                  {effective.record_rule.employee_id
                    ? ` · linked employee ${effective.record_rule.employee_id}`
                    : ""}
                </p>
                {effective.record_rule.departments.length > 0 && (
                  <p>
                    <strong>Departments:</strong>{" "}
                    {effective.record_rule.departments.join(", ")}
                  </p>
                )}
                <p>
                  <strong>Assignments:</strong>{" "}
                  {effective.record_rule.assigned.length} assigned records;{" "}
                  {effective.reporting.length} direct reports.
                </p>
                <p>
                  <strong>Organization grants:</strong>{" "}
                  {effective.scopes
                    .map(
                      (g: any) =>
                        `${scopeLabel(g, options)} (${g.actions.join("/")}; ${grantStatus(g, context.today)})`,
                    )
                    .join("; ") || "None"}
                </p>
                {effective.record_allowed !== null && (
                  <p>
                    <strong>Final record view:</strong>{" "}
                    {effective.record_allowed ? "Allowed" : "Denied"}
                  </p>
                )}
                <p className="muted">
                  Scroll the table horizontally to see decisions and sources.
                </p>
                <div
                  className="permission-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Effective module access"
                >
                  <table className="effective-access-table">
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Action</th>
                        <th>Module access</th>
                        <th>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effective.modules.map((p: any) => (
                        <tr key={`${p.module}.${p.action}`}>
                          <td>
                            {
                              config?.modules.find((m) => m.code === p.module)
                                ?.name
                            }
                          </td>
                          <td>{title(p.action)}</td>
                          <td>{p.decision.allowed ? "Allowed" : "Denied"}</td>
                          <td>
                            {p.decision.reason}
                            {p.decision.sources?.map((s: any, i: number) => (
                              <small key={i}>
                                {s.source === "role"
                                  ? `Role ${s.role}`
                                  : s.source === "direct"
                                    ? "Direct override"
                                    : `Existing capability ${s.capability}`}
                                : {s.effect}
                              </small>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3>Effective field access</h3>
                <p className="muted">
                  Final field decisions combine module action, organization
                  scope, field policies, applicability and the selected record
                  restriction. Without a record selection, this previews the
                  selected organization scope only.
                </p>
                {effective.fields.length === 0 ? (
                  <p>
                    Select an employee record, or a specific organization scope
                    in Field permissions, to inspect its field decisions.
                  </p>
                ) : (
                  <div
                    className="permission-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Effective field access"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Field</th>
                          {fieldActions.map((a) => (
                            <th key={a}>{fieldLabels[a]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {effective.fields.map((f: any) => (
                          <tr key={f.key}>
                            <th scope="row">{f.label}</th>
                            {fieldActions.map((a) => (
                              <td key={a}>
                                {f.actions[a].allowed ? "Allowed" : "Denied"}
                                <small>{f.actions[a].reason}</small>
                                {f.actions[a].policy && (
                                  <small>
                                    {f.actions[a].policy.role
                                      ? `Role ${f.actions[a].policy.role}`
                                      : "Direct user policy"}
                                    : {f.actions[a].policy.effect}
                                  </small>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
          <footer>
            <button onClick={() => setInspect(false)}>Close</button>
          </footer>
        </Dialog>
      )}
      {newRole && (
        <Dialog title="New role" onClose={() => setNewRole(false)}>
          {error && (
            <FloatingNotification onDismiss={() => setError("")}>
              {error}
            </FloatingNotification>
          )}
          <div className="dialog-scroll">
            <label>
              Name
              <input
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />
            </label>
            <label>
              Code
              <input
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                pattern="[a-z][a-z0-9_]{0,63}"
              />
            </label>
            <p>
              New roles start with no permissions. Assign module and field
              permissions before use.
            </p>
            <label>
              Reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <footer>
            <button onClick={() => setNewRole(false)}>Cancel</button>
            <button
              className="primary"
              disabled={
                busy ||
                !roleName.trim() ||
                !/^[a-z][a-z0-9_]{0,63}$/.test(roleCode) ||
                !reason.trim()
              }
              onClick={() =>
                void run(async () => {
                  await mutate("access_role", {
                    code: roleCode,
                    name: roleName,
                    reason,
                  });
                  setNewRole(false);
                  setRoleName("");
                  setRoleCode("");
                  onSaved();
                })
              }
            >
              Save
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}

function GroupRows({
  group,
  fields,
  expanded,
  toggle,
  cell,
  effect,
}: {
  group: Context["groups"][number];
  fields: Context["fields"];
  expanded: boolean;
  toggle: () => void;
  cell: (key: string, original: string, label: string) => React.ReactNode;
  effect: (id: string, action: string) => string;
}) {
  return (
    <>
      <tr className="permission-group-row">
        <th scope="row">
          <button aria-expanded={expanded} onClick={toggle}>
            {expanded ? (
              <ChevronDown size={14} aria-hidden />
            ) : (
              <ChevronRight size={14} aria-hidden />
            )}
            {group.name}
          </button>
        </th>
        {fieldActions.map((a) => (
          <td key={a}>
            {cell(
              `g:${group.id}:${a}`,
              effect(group.id, a),
              `${group.name} ${fieldLabels[a]}`,
            )}
          </td>
        ))}
      </tr>
      {expanded &&
        fields.map((f) => (
          <tr key={f.id}>
            <th scope="row" className="permission-field-name">
              {f.label}
              {f.sensitivity === "restricted" && <small>Restricted</small>}
            </th>
            {fieldActions.map((a) => (
              <td key={a}>
                {cell(
                  `f:${f.id}:${a}`,
                  effect(f.id, a),
                  `${f.label} ${fieldLabels[a]}`,
                )}
              </td>
            ))}
          </tr>
        ))}
    </>
  );
}
