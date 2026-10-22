import { FloatingNotification } from "../components/FloatingNotification";
import { FieldTypeIcon } from "../components/FieldTypeIcon";
import { useEffect, useState } from "react";
import { query, mutate, createAccount, reviewAccessChange } from "../api";
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
    [tab, setTab] = useState("rules"),
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
        {[
          ["rules", "Access rules"],
          ["accounts", "Accounts & capabilities"],
          ["register", "Register settings"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="admin-scroll-region">
        {tab === "rules" && (
          <div className="security-grid">
            <div className="panel security-form">
              <h3>Organization access</h3>
              <div className="form-grid">
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
                Head Office covers Head Office employees only. Company-wide
                access requires All organization scopes. Presets fill this
                draft; they do not save grants.
              </p>
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
                    {a} —{" "}
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
              <hr />
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
                  Inherit allowed access to new normal fields in this group
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
                          target?.kind === "client" ? target.id : undefined,
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
                        <th>C</th>
                        <th>R</th>
                        <th>U</th>
                        <th>D</th>
                        <th>Explanation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p: any) => (
                        <tr key={p.key}>
                          <td>{p.label}</td>
                          {["C", "R", "U", "D"].map((a) => (
                            <td key={a}>
                              {p.actions.includes(a) ? "Allowed" : "Denied"}
                            </td>
                          ))}
                          <td>
                            {["C", "R", "U", "D"].map((a) => (
                              <small key={a}>
                                {a}: {permissionExplanation(p, a, account)}
                              </small>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {error && (
                <FloatingNotification onDismiss={() => setError("")}>
                  {error}
                </FloatingNotification>
              )}
            </div>
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
              {![...(data?.scopes || []), ...(data?.policies || [])].some(
                (p: any) =>
                  user && (p.user_id === user || p.role === account?.role),
              ) && (
                <p>
                  No explicit policies for this selection. Ordinary accounts
                  require scope and field grants; Superadmin retains its trusted
                  override.
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
                      {p.action || p.actions.join("/")} · {p.effect || "grant"}
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
          </div>
        )}
        {tab === "accounts" && (
          <div className="panel account-form">
            <h3>User accounts</h3>
            <p>
              Create a sign-in account here. Admin and viewer accounts need
              organization and field permissions before accessing employee data.
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
                        onChange={(event) => setNewEmail(event.target.value)}
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
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <button
              disabled={
                !reason.trim() ||
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
                      reason: reason.trim(),
                    });
                    setNewEmail("");
                    setInitialPassword("");
                    setDisplayName("");
                    setRole("viewer");
                    setUser(account.id);
                    setNotice(
                      "User account created. Configure its access rules as needed.",
                    );
                    return;
                  }
                  await mutate("profile", {
                    id: newId,
                    display_name: displayName,
                    role,
                    active: true,
                    reason,
                  });
                  setNotice("User account enrolled.");
                })
              }
            >
              {accountSource === "new" ? "Create user" : "Enroll account"}
            </button>
            <hr />
            <div className="form-control">
              <span>Manage account</span>
              <SearchFilterPicker
                mode="single"
                label="Manage account"
                options={(data?.users || []).map((account: any) => ({
                  id: account.id,
                  label: account.display_name,
                  context: account.role,
                }))}
                value={user ? [user] : []}
                onChange={(value) => setUser(value[0] || "")}
              />
            </div>
            {(data?.users || [])
              .filter((u: any) => u.id === user)
              .map((u: any) => (
                <div key={u.id}>
                  <p>
                    {u.display_name} · {u.role} ·{" "}
                    {u.active ? "Active" : "Inactive"}
                  </p>
                  <button
                    disabled={!reason || busy}
                    onClick={() =>
                      run(() =>
                        mutate("profile", { ...u, active: !u.active, reason }),
                      )
                    }
                  >
                    {u.active ? "Deactivate account" : "Reactivate account"}
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
                          disabled={!reason || busy}
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
                                  reason,
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
          </div>
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
        {error && tab !== "rules" && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
        {notice && (
          <FloatingNotification kind="notice" onDismiss={() => setNotice("")}>
            {notice}
          </FloatingNotification>
        )}
      </div>
    </section>
  );
}
