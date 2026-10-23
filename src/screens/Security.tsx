import {
  UsersRound,
  ShieldCheck,
  Settings2,
  Plus,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import { Dialog } from "../components/Dialog";
import { FloatingNotification } from "../components/FloatingNotification";
import { FieldTypeIcon } from "../components/FieldTypeIcon";
import { useEffect, useState } from "react";
import {
  query,
  mutate,
  createAccount,
  reviewAccessChange,
  setAccountPassword,
  isDemo,
} from "../api";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import { AccessChangeReview } from "../components/AccessChangeReview";
import { requireConfirmation } from "../components/TransactionConfirmation";
import {
  accessPresets,
  grantStatus,
  permissionExplanation,
  scopeLabel,
} from "../accessReview";
import type { Context, Option } from "../domain";
export function Security({
  context,
  options,
  onSaved,
}: {
  context: Context;
  options: Option[];
  onSaved: () => void;
}) {
  const [data, setData] = useState<any>(),
    [tab, setTab] = useState("accounts"),
    [ruleSection, setRuleSection] = useState("scope"),
    [accountDialog, setAccountDialog] = useState<"new" | "manage" | null>(null),
    [accountReason, setAccountReason] = useState(""),
    [passwordTarget, setPasswordTarget] = useState<{
      id: string;
      name: string;
    } | null>(null),
    [newPassword, setNewPassword] = useState(""),
    [repeatPassword, setRepeatPassword] = useState(""),
    [passwordReason, setPasswordReason] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [user, setUser] = useState(""),
    [scope, setScope] = useState(""),
    [subject, setSubject] = useState(""),
    [isGroup, setIsGroup] = useState(true),
    [effect, setEffect] = useState("allow"),
    [actions, setActions] = useState(["R"]),
    [reason, setReason] = useState(""),
    [inherit, setInherit] = useState(true),
    [descendants, setDescendants] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [duplicateThreshold, setDuplicateThreshold] = useState(
      String(context.register_settings.duplicate_name_threshold ?? 90),
    ),
    [preview, setPreview] = useState<any>(),
    [newId, setNewId] = useState(""),
    [accountSource, setAccountSource] = useState("new"),
    [newEmail, setNewEmail] = useState(""),
    [initialPassword, setInitialPassword] = useState(""),
    [notice, setNotice] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [role, setRole] = useState("viewer"),
    [startsOn, setStartsOn] = useState(context.today),
    [endsOn, setEndsOn] = useState("");
  useEffect(() => {
    query("security")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [context.revision]);
  useEffect(() => {
    setDuplicateThreshold(
      String(context.register_settings.duplicate_name_threshold ?? 90),
    );
  }, [context.register_settings.row_version]);
  const account = data?.users?.find((u: any) => u.id === user);
  const scopes = [
    { id: "all", label: "All organization scopes", kind: "all" },
    { id: "head_office", label: "Head Office", kind: "head_office" },
    { id: "unassigned", label: "Unassigned employees", kind: "unassigned" },
    ...options.filter((o) => o.kind !== "head_office"),
  ];
  const target = scopes.find((o) => o.id === scope);
  const scopePayload = () => {
    const o = scopes.find((o) => o.id === scope)!;
    return {
      scope_type: o.kind!,
      scope_id: ["all", "head_office", "unassigned"].includes(o.kind!)
        ? null
        : o.id,
      include_descendants: o.kind === "branch" && descendants,
    };
  };
  function closePassword() {
    setPasswordTarget(null);
    setNewPassword("");
    setRepeatPassword("");
    setPasswordReason("");
    setShowPassword(false);
  }
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveAccess(
    operation: string,
    payload: Record<string, unknown>,
    summary: string,
  ) {
    const impact = await reviewAccessChange(operation, payload);
    await requireConfirmation(
      operation === "scope" ? "Change access scope" : "Change access policy",
      <AccessChangeReview impact={impact} summary={summary} />,
    );
    await mutate(
      operation,
      {
        ...payload,
        ...(impact.revision === null
          ? {}
          : { review_revision: impact.revision, review_date: impact.today }),
      },
      undefined,
      true,
    );
    setPreview(undefined);
  }
  useEffect(() => {
    setPreview(undefined);
  }, [user, scope, context.revision]);
  return (
    <section className="admin-workspace security-workspace data-panel">
      <nav className="admin-tabs" aria-label="Access configuration">
        {(
          [
            ["accounts", "Users", UsersRound],
            ["rules", "Access rules", ShieldCheck],
            ["register", "Register settings", Settings2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      {tab === "accounts" && (
        <>
          <div className="security-users-heading">
            <span>
              {data
                ? `${data.users.length} ${data.users.length === 1 ? "user" : "users"}`
                : "Loading users..."}
            </span>
            <button
              className="primary"
              disabled={busy || !data}
              onClick={() => {
                setError("");
                setAccountReason("");
                setAccountDialog("new");
              }}
            >
              <Plus size={15} aria-hidden />
              Add user
            </button>
          </div>
        </>
      )}
      <div className="admin-scroll-region data-scroll-region">
        {tab === "rules" && (
          <div className="security-access-layout">
            <div className="security-access-heading">
              <button onClick={() => setTab("accounts")}>
                <ArrowLeft size={15} aria-hidden />
                Users
              </button>
              <div className="form-control">
                <span>User</span>
                <SearchFilterPicker
                  mode="single"
                  label="User"
                  options={(data?.users || []).map((u: any) => ({
                    id: u.id,
                    label: u.display_name,
                    context: u.role,
                  }))}
                  value={user ? [user] : []}
                  onChange={(v) => {
                    setUser(v[0] || "");
                    setPreview(undefined);
                  }}
                />
              </div>
              {account && (
                <span className="muted">
                  {account.role} / {account.active ? "Active" : "Inactive"}
                </span>
              )}
            </div>
            <nav
              className="access-section-tabs"
              aria-label="User access sections"
            >
              {[
                ["scope", "Scope & assignments"],
                ["fields", "Field permissions"],
                ["current", "Current access"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-current={ruleSection === id ? "page" : undefined}
                  onClick={() => setRuleSection(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {ruleSection !== "current" && (
              <div className="panel security-form">
                <h3>
                  {ruleSection === "scope"
                    ? "Organization access"
                    : "Field permissions"}
                </h3>

                <div className="form-grid">
                  <div className="form-control">
                    <span>Organization scope</span>
                    <SearchFilterPicker
                      mode="single"
                      label="Organization scope"
                      options={scopes}
                      value={scope ? [scope] : []}
                      onChange={(v) => setScope(v[0] || "")}
                    />
                  </div>
                </div>
                {ruleSection === "scope" && (
                  <>
                    <div className="form-control">
                      <span>Access preset</span>
                      <SearchFilterPicker
                        mode="single"
                        label="Access preset"
                        value={[]}
                        disabled={busy}
                        options={accessPresets.map((p) => ({
                          id: p.id,
                          label: p.label,
                        }))}
                        onChange={(values) => {
                          const preset = accessPresets.find(
                            (p) => p.id === values[0],
                          );
                          if (!preset) return;
                          setActions([...preset.actions]);
                          setDescendants(preset.descendants);
                          setEffect("allow");
                          setIsGroup(true);
                          setSubject("");
                          setInherit(true);
                          setStartsOn(context.today);
                          setEndsOn("");
                          setScope(
                            ["all", "head_office"].includes(preset.kind)
                              ? preset.kind
                              : target?.kind === preset.kind
                                ? scope
                                : "",
                          );
                          setNotice(
                            `${preset.label} draft ready. Choose its scope and access group, then review and save each rule. Roles and capabilities are not changed.`,
                          );
                        }}
                      />
                    </div>
                    <p>
                      Head Office covers Head Office employees only.
                      Company-wide access requires All organization scopes.
                      Presets fill this draft; they do not save grants.
                    </p>
                  </>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={target?.kind === "branch" && descendants}
                    disabled={target?.kind !== "branch" || busy}
                    onChange={(e) => setDescendants(e.target.checked)}
                  />
                  Include branch clients explicitly
                </label>
                <div className="checks">
                  {["C", "R", "U", "D"].map((a) => (
                    <label key={a}>
                      <input
                        type="checkbox"
                        checked={actions.includes(a)}
                        onChange={(e) =>
                          setActions(
                            e.target.checked
                              ? [...actions, a]
                              : actions.filter((x) => x !== a),
                          )
                        }
                      />
                      {
                        {
                          C: "Create values",
                          R: "Read values",
                          U: "Update values",
                          D: "Clear values",
                        }[a]
                      }
                    </label>
                  ))}
                </div>
                <label>
                  Reason for policy change
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {ruleSection === "scope" && (
                  <>
                    <div className="form-grid">
                      <label>
                        Grant starts
                        <input
                          type="date"
                          value={startsOn}
                          onChange={(e) => setStartsOn(e.target.value)}
                        />
                      </label>
                      <label>
                        Grant ends (exclusive, optional)
                        <input
                          type="date"
                          value={endsOn}
                          onChange={(e) => setEndsOn(e.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      disabled={
                        busy ||
                        !user ||
                        !scope ||
                        !reason.trim() ||
                        !actions.length ||
                        !startsOn ||
                        Boolean(endsOn && endsOn <= startsOn)
                      }
                      onClick={() =>
                        run(() =>
                          saveAccess(
                            "scope",
                            {
                              user_id: user,
                              ...scopePayload(),
                              actions,
                              starts_on: startsOn,
                              ends_on: endsOn || null,
                              reason,
                            },
                            `${account?.display_name}: grant ${actions.join("/")} at ${scopeLabel(scopePayload(), options)} from ${startsOn}${endsOn ? ` until ${endsOn} (exclusive)` : " with no end date"}. Field grants and separate capabilities are still required.`,
                          ),
                        )
                      }
                    >
                      Grant organization actions
                    </button>
                  </>
                )}
                {ruleSection === "fields" && (
                  <>
                    <h3>Field access policy</h3>
                    <div className="form-grid">
                      <div className="form-control">
                        <span>Policy level</span>
                        <SearchFilterPicker
                          mode="single"
                          label="Policy level"
                          options={[
                            { id: "group", label: "Field group" },
                            { id: "field", label: "Individual field" },
                          ]}
                          value={[isGroup ? "group" : "field"]}
                          onChange={(v) => {
                            setIsGroup(v[0] === "group");
                            setSubject("");
                          }}
                        />
                      </div>
                      <div className="form-control">
                        <span>{isGroup ? "Group" : "Field"}</span>
                        <SearchFilterPicker
                          mode="single"
                          label={isGroup ? "Group" : "Field"}
                          options={
                            isGroup
                              ? context.groups.map((g) => ({
                                  id: g.id,
                                  label: g.name,
                                }))
                              : context.fields.map((f) => ({
                                  id: f.id,
                                  label: f.label,
                                  context: f.group_name,
                                }))
                          }
                          value={subject ? [subject] : []}
                          onChange={(v) => setSubject(v[0] || "")}
                        />
                      </div>
                      <div className="form-control">
                        <span>Effect</span>
                        <SearchFilterPicker
                          mode="single"
                          label="Effect"
                          options={[
                            { id: "allow", label: "Allow" },
                            { id: "deny", label: "Explicit deny" },
                          ]}
                          value={[effect]}
                          onChange={(v) => setEffect(v[0] || "deny")}
                        />
                      </div>
                    </div>
                    {isGroup && (
                      <label>
                        <input
                          type="checkbox"
                          checked={inherit}
                          onChange={(e) => setInherit(e.target.checked)}
                        />
                        Inherit allowed access to new normal fields in this
                        group
                      </label>
                    )}
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !user ||
                        !scope ||
                        !subject ||
                        !actions.length ||
                        !reason
                      }
                      onClick={() =>
                        run(() =>
                          saveAccess(
                            "policy_batch",
                            {
                              user_id: user,
                              [isGroup ? "group_id" : "field_id"]: subject,
                              actions,
                              effect,
                              inherit_new: isGroup && inherit,
                              ...scopePayload(),
                              reason,
                            },
                            `${account?.display_name}: ${effect} ${actions.join("/")} on ${isGroup ? context.groups.find((g) => g.id === subject)?.name : context.fields.find((f) => f.id === subject)?.label} at ${scopeLabel(scopePayload(), options)}. ${effect === "deny" ? "A group deny can be overridden by an explicit field allow; a direct field deny takes precedence." : isGroup && inherit ? "Normal fields inherit dynamically; restricted fields still need explicit field allows." : "No new group inheritance is added."}`,
                          ),
                        )
                      }
                    >
                      Save field policy
                    </button>
                    <button
                      disabled={busy || !user || !scope || scope === "all"}
                      onClick={() =>
                        run(async () =>
                          setPreview(
                            await query("effective_permissions", {
                              user_id: user,
                              target_level: target?.kind || "unassigned",
                              branch_id:
                                target?.kind === "branch"
                                  ? target.id
                                  : target?.branch_id,
                              client_id:
                                target?.kind === "client"
                                  ? target.id
                                  : undefined,
                            }),
                          ),
                        )
                      }
                    >
                      Preview effective permissions
                    </button>
                    {preview && (
                      <div className="table-region">
                        <table>
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Create</th>
                              <th>Read</th>
                              <th>Update</th>
                              <th>Clear</th>
                              <th>Explanation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.map((p: any) => (
                              <tr key={p.key}>
                                <td>{p.label}</td>
                                {["C", "R", "U", "D"].map((a) => (
                                  <td key={a}>
                                    {p.actions.includes(a)
                                      ? "Allowed"
                                      : "Denied"}
                                  </td>
                                ))}
                                <td>
                                  {["C", "R", "U", "D"].map((a) => (
                                    <small key={a}>
                                      {a}:{" "}
                                      {permissionExplanation(p, a, account)}
                                    </small>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {ruleSection === "current" && (
              <div className="panel">
                <h3>Access overview</h3>
                {account ? (
                  <>
                    <p>
                      <strong>{account.display_name}</strong> · {account.role} ·{" "}
                      {account.active
                        ? "Active account"
                        : "Inactive account — employee access is denied"}
                    </p>
                    <p>
                      {account.role === "superadmin"
                        ? "Trusted Superadmin override within active field applicability. A missing ordinary grant does not remove this override."
                        : account.role === "viewer"
                          ? "Read-only employee access. Mutation capabilities and C/U/D grants cannot override the Viewer role."
                          : "No blanket data access. Scope, field permissions and any required capability must all allow the action."}
                    </p>
                    <p>
                      <strong>Capabilities:</strong>{" "}
                      {(data?.capabilities || [])
                        .filter((c: any) => c.user_id === user)
                        .map((c: any) => c.capability.replaceAll("_", " "))
                        .join(", ") || "No explicit capability grants"}
                      . Permission administration and movement correction remain
                      Superadmin-only.
                    </p>
                  </>
                ) : (
                  <p>
                    Select a user to review their scopes, field exceptions and
                    capabilities.
                  </p>
                )}
                <h3>Current scope and field policies</h3>
                <label>
                  Reason for policy change
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {![...(data?.scopes || []), ...(data?.policies || [])].some(
                  (p: any) =>
                    user && (p.user_id === user || p.role === account?.role),
                ) && (
                  <p>
                    No explicit policies for this selection. Ordinary accounts
                    require scope and field grants; Superadmin retains its
                    trusted override.
                  </p>
                )}
                {[
                  ...(data?.scopes || []).map((p: any) => ({
                    ...p,
                    kind: "scope",
                  })),
                  ...(data?.policies || []).map((p: any) => ({
                    ...p,
                    kind: "policy",
                  })),
                ]
                  .filter(
                    (p) =>
                      user && (p.user_id === user || p.role === account?.role),
                  )
                  .map((p: any) => (
                    <div className="field-row" key={p.id}>
                      <span>
                        {p.kind} · {scopeLabel(p, options)} ·{" "}
                        {p.action || p.actions.join("/")} ·{" "}
                        {p.effect || "grant"}
                        <small>
                          {p.role
                            ? `Role policy (${p.role}) · `
                            : "User policy · "}
                          {p.field_id
                            ? context.fields.find((f) => f.id === p.field_id)
                                ?.label
                            : context.groups.find((g) => g.id === p.group_id)
                                ?.name}
                        </small>
                        {p.kind === "scope" ? (
                          <small>
                            {grantStatus(p, context.today)} · {p.starts_on} →{" "}
                            {p.ends_on
                              ? `${p.ends_on} (exclusive)`
                              : "No end date"}
                          </small>
                        ) : (
                          <small>
                            {p.group_id
                              ? p.effect === "deny"
                                ? "Group deny; an explicit field allow can override it."
                                : p.inherit_new
                                  ? "Normal fields inherit this group allow; restricted fields require explicit allows."
                                  : "Group allow does not inherit to new fields."
                              : "Individual field exception"}
                          </small>
                        )}
                      </span>
                      <button
                        className="danger"
                        disabled={!reason.trim() || busy}
                        onClick={() =>
                          run(() =>
                            saveAccess(
                              p.kind,
                              { id: p.id, remove: true, reason },
                              `${p.role ? `All ${p.role} accounts` : account?.display_name}: revoke this ${p.kind} at ${scopeLabel(p, options)}. Overlapping grants may retain access; revoking a deny may restore access.`,
                            ),
                          )
                        }
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
        {tab === "accounts" && (
          <>
            <div
              className="security-users-table"
              role="region"
              aria-label="System users"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Assigned scopes</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.users || []).map((u: any) => {
                    const grants = (data.scopes || []).filter(
                      (g: any) =>
                        g.user_id === u.id &&
                        grantStatus(g, context.today) === "Active",
                    );
                    return (
                      <tr key={u.id}>
                        <td>
                          <button
                            className="security-user-name"
                            aria-label={`Open access for ${u.display_name}`}
                            onClick={() => {
                              setUser(u.id);
                              setTab("rules");
                              setRuleSection("scope");
                            }}
                          >
                            {u.display_name}
                          </button>
                        </td>
                        <td>
                          {u.role === "superadmin"
                            ? "Superadmin"
                            : u.role === "admin"
                              ? "Admin"
                              : "Viewer"}
                        </td>
                        <td>
                          {u.role === "superadmin"
                            ? "All applicable scopes"
                            : grants
                                .map((g: any) => scopeLabel(g, options))
                                .join(", ") || "No active scope grants"}
                        </td>
                        <td>
                          <span
                            className={`access-account-status ${u.active ? "active" : "inactive"}`}
                          >
                            {u.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="security-row-actions">
                            <button
                              aria-label={`Edit access for ${u.display_name}`}
                              onClick={() => {
                                setUser(u.id);
                                setTab("rules");
                                setRuleSection("scope");
                              }}
                            >
                              <ShieldCheck size={15} aria-hidden />
                              Edit access
                            </button>
                            <button
                              aria-label={`Manage account for ${u.display_name}`}
                              onClick={() => {
                                setUser(u.id);
                                setAccountReason("");
                                setAccountDialog("manage");
                                setError("");
                              }}
                            >
                              <Pencil size={15} aria-hidden />
                              Account
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === "register" && (
          <div className="panel register-policy">
            <h3>Employee register</h3>
            <p>
              Allow row numbers in the fixed first column. Users can hide them
              in their personal views.
            </p>
            <label>
              <input
                type="checkbox"
                checked={context.register_settings.row_numbers_allowed}
                disabled={busy || context.profile.role !== "superadmin"}
                onChange={(e) => {
                  const allowed = e.target.checked;
                  void run(() =>
                    mutate("register_settings", {
                      row_numbers_allowed: allowed,
                      expected_version: context.register_settings.row_version,
                      reason: "Change employee register row-number visibility",
                    }),
                  );
                }}
              />
              Allow users to display row numbers
            </label>
            <div className="duplicate-policy">
              <h3>Possible duplicate employees</h3>
              <p>
                Compare full names globally when birthdays match exactly. Only
                authorized records and assignment details appear in the
                confirmation.
              </p>
              <label className="field">
                Name similarity threshold (%)
                <span className="value-control has-type-icon">
                  <span className="value-type-icon">
                    <FieldTypeIcon type="integer" />
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={duplicateThreshold}
                    disabled={busy || context.profile.role !== "superadmin"}
                    onChange={(e) => setDuplicateThreshold(e.target.value)}
                  />
                </span>
              </label>
              <button
                disabled={
                  busy ||
                  context.profile.role !== "superadmin" ||
                  duplicateThreshold.trim() === "" ||
                  !Number.isInteger(Number(duplicateThreshold)) ||
                  Number(duplicateThreshold) < 0 ||
                  Number(duplicateThreshold) > 100 ||
                  Number(duplicateThreshold) ===
                    (context.register_settings.duplicate_name_threshold ?? 90)
                }
                onClick={() =>
                  void run(() =>
                    mutate("register_settings", {
                      row_numbers_allowed:
                        context.register_settings.row_numbers_allowed,
                      duplicate_name_threshold: Number(duplicateThreshold),
                      expected_version: context.register_settings.row_version,
                      reason: "Change global employee duplicate name threshold",
                    }),
                  )
                }
              >
                Save duplicate check settings
              </button>
            </div>
            <small>
              Only a superadmin can change this setting. Row numbers follow the
              current sort and filter; System IDs remain permanent.
            </small>
          </div>
        )}
        {error && !accountDialog && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
        {notice && !accountDialog && (
          <FloatingNotification kind="notice" onDismiss={() => setNotice("")}>
            {notice}
          </FloatingNotification>
        )}
      </div>
      {accountDialog && (
        <Dialog
          title={accountDialog === "new" ? "Add user" : "Manage account"}
          className="security-account-dialog"
          wide
          onClose={() => {
            if (busy) return;
            setAccountDialog(null);
            setNewEmail("");
            setInitialPassword("");
            setDisplayName("");
            setNewId("");
            setAccountSource("new");
            setRole("viewer");
          }}
        >
          <div className="dialog-body account-form">
            {accountDialog === "new" ? (
              <>
                <p>
                  Create a sign-in account here. Admin and viewer accounts need
                  organization and field permissions before accessing employee
                  data.
                </p>
                <div className="form-grid">
                  <div className="form-control">
                    <span>Account source</span>
                    <SearchFilterPicker
                      mode="single"
                      label="Account source"
                      disabled={busy}
                      options={[
                        { id: "new", label: "Create new user" },
                        { id: "existing", label: "Enroll existing account" },
                      ]}
                      value={[accountSource]}
                      onChange={(value) => setAccountSource(value[0] || "new")}
                    />
                  </div>
                  {accountSource === "existing" ? (
                    <label>
                      Auth user UUID
                      <input
                        value={newId}
                        disabled={busy}
                        onChange={(e) => setNewId(e.target.value)}
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        Email address
                        <span className="value-control has-type-icon">
                          <span className="value-type-icon">
                            <FieldTypeIcon type="email" />
                          </span>
                          <input
                            type="email"
                            autoComplete="off"
                            maxLength={254}
                            value={newEmail}
                            onChange={(event) =>
                              setNewEmail(event.target.value)
                            }
                            disabled={busy}
                          />
                        </span>
                      </label>
                      <label>
                        Initial password
                        <input
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={256}
                          value={initialPassword}
                          onChange={(event) =>
                            setInitialPassword(event.target.value)
                          }
                          disabled={busy}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    Display name
                    <input
                      value={displayName}
                      maxLength={120}
                      disabled={busy}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </label>
                  <div className="form-control">
                    <span>Role template</span>
                    <SearchFilterPicker
                      mode="single"
                      label="Role template"
                      disabled={busy}
                      options={["admin", "viewer", "superadmin"].map((id) => ({
                        id,
                        label: id,
                      }))}
                      value={[role]}
                      onChange={(v) => setRole(v[0] || "viewer")}
                    />
                  </div>
                  <label>
                    Reason for account change
                    <input
                      value={accountReason}
                      maxLength={500}
                      onChange={(event) => setAccountReason(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <label>
                  Reason for account change
                  <input
                    value={accountReason}
                    maxLength={500}
                    disabled={busy}
                    onChange={(e) => setAccountReason(e.target.value)}
                  />
                </label>
                {(data?.users || [])
                  .filter((u: any) => u.id === user)
                  .map((u: any) => (
                    <div key={u.id}>
                      <p>
                        {u.display_name} · {u.role} ·{" "}
                        {u.active ? "Active" : "Inactive"}
                      </p>
                      <button
                        disabled={!accountReason || busy}
                        onClick={() =>
                          run(() =>
                            mutate("profile", {
                              ...u,
                              active: !u.active,
                              reason: accountReason,
                            }),
                          )
                        }
                      >
                        {u.active ? "Deactivate account" : "Reactivate account"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          closePassword();
                          setError("");
                          setPasswordTarget({ id: u.id, name: u.display_name });
                        }}
                      >
                        Set password
                      </button>
                      <div className="checks">
                        {[
                          "employee_create",
                          "employee_delete",
                          "organization_manage",
                          "schema_manage",
                          "movement_create",
                          "movement_correct",
                          "bulk_update",
                          "audit_read",
                          "sync_manage",
                        ].map((cap) => (
                          <label key={cap}>
                            <input
                              type="checkbox"
                              disabled={!accountReason || busy}
                              checked={(data?.capabilities || []).some(
                                (c: any) =>
                                  c.user_id === user && c.capability === cap,
                              )}
                              onChange={(e) => {
                                const remove = !e.target.checked;
                                void run(async () => {
                                  await requireConfirmation(
                                    "Change user capability",
                                    `${u.display_name}: ${remove ? "revoke" : "grant"} ${cap.replaceAll("_", " ")}. ${u.role === "admin" ? "Scope and field permissions remain required. Movement correction remains Superadmin-only." : u.role === "viewer" ? "Viewer accounts cannot use employee mutation capabilities." : "Superadmin already has a trusted capability override."}`,
                                  );
                                  await mutate(
                                    "capability",
                                    {
                                      user_id: user,
                                      capability: cap,
                                      remove,
                                      reason: accountReason,
                                    },
                                    undefined,
                                    true,
                                  );
                                });
                              }}
                            />
                            {cap.replaceAll("_", " ")}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
              </>
            )}
            {error && !passwordTarget && (
              <FloatingNotification onDismiss={() => setError("")}>
                {error}
              </FloatingNotification>
            )}
          </div>
          {notice && !passwordTarget && (
            <FloatingNotification kind="notice" onDismiss={() => setNotice("")}>
              {notice}
            </FloatingNotification>
          )}
          <footer>
            <button disabled={busy}>Cancel</button>
            {accountDialog === "new" && (
              <>
                <button
                  disabled={
                    !accountReason.trim() ||
                    !displayName.trim() ||
                    busy ||
                    (accountSource === "existing"
                      ? !newId
                      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) ||
                        initialPassword.length < 8)
                  }
                  onClick={() =>
                    run(async () => {
                      if (accountSource === "new") {
                        const account = await createAccount({
                          email: newEmail.trim(),
                          password: initialPassword,
                          display_name: displayName.trim(),
                          role,
                          reason: accountReason.trim(),
                        });
                        setNewEmail("");
                        setInitialPassword("");
                        setDisplayName("");
                        setRole("viewer");
                        setUser(account.id);
                        setNotice(
                          "User account created. Configure its access rules as needed.",
                        );
                        setAccountDialog(null);
                        return;
                      }
                      await mutate("profile", {
                        id: newId,
                        display_name: displayName,
                        role,
                        active: true,
                        reason: accountReason,
                      });
                      setNotice("User account enrolled.");
                      setAccountDialog(null);
                    })
                  }
                >
                  {accountSource === "new" ? "Create user" : "Enroll account"}
                </button>
              </>
            )}
          </footer>
        </Dialog>
      )}
      {passwordTarget && (
        <Dialog
          title="Set password"
          className="security-account-dialog"
          isDirty={Boolean(newPassword || repeatPassword || passwordReason)}
          onClose={() => {
            if (!busy) closePassword();
          }}
        >
          <div className="dialog-body">
            <p>
              Choose a new password for <strong>{passwordTarget.name}</strong>.
              Use at least 8 characters.
            </p>
            <label>
              New password
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={256}
                disabled={busy}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm password
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                maxLength={256}
                disabled={busy}
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
              />
            </label>
            {repeatPassword && repeatPassword !== newPassword && (
              <p role="alert">Passwords must match.</p>
            )}
            <label>
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show password
            </label>
            <label>
              Reason for password change
              <input
                value={passwordReason}
                maxLength={500}
                disabled={busy}
                onChange={(e) => setPasswordReason(e.target.value)}
              />
            </label>
            {error && (
              <FloatingNotification onDismiss={() => setError("")}>
                {error}
              </FloatingNotification>
            )}
          </div>
          <footer>
            <button disabled={busy}>Cancel</button>
            <button
              className="primary"
              disabled={
                busy ||
                newPassword.length < 8 ||
                newPassword.length > 256 ||
                newPassword !== repeatPassword ||
                !passwordReason.trim()
              }
              onClick={() =>
                void run(async () => {
                  await setAccountPassword(
                    {
                      user_id: passwordTarget.id,
                      password: newPassword,
                      reason: passwordReason.trim(),
                    },
                    passwordTarget.name,
                  );
                  setNotice(
                    isDemo()
                      ? "Demo only: no sign-in password was changed."
                      : `Password updated for ${passwordTarget.name}. Use the new password to sign in.`,
                  );
                  closePassword();
                })
              }
            >
              Set password
            </button>
          </footer>
        </Dialog>
      )}
    </section>
  );
}
