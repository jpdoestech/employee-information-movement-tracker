import { FloatingNotification } from "../components/FloatingNotification";
import { useEffect, useState } from "react";
import { query, mutate } from "../api";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
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
    [preview, setPreview] = useState<any>(),
    [newId, setNewId] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [role, setRole] = useState("viewer"),
    [startsOn, setStartsOn] = useState(context.today),
    [endsOn, setEndsOn] = useState("");
  useEffect(() => {
    query("security")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [context.revision]);
  const target = options.find((o) => o.id === scope);
  const scopes = [
    { id: "all", label: "All organization scopes", kind: "all" },
    { id: "unassigned", label: "Unassigned employees", kind: "unassigned" },
    ...options,
  ];
  const scopePayload = () => {
    const o = scopes.find((o) => o.id === scope)!;
    return {
      scope_type: o.kind,
      scope_id: ["all", "head_office", "unassigned"].includes(o.kind!)
        ? null
        : o.id,
      include_descendants: descendants,
    };
  };
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-workspace security-workspace data-panel">
      <div className="record-heading">
        <div>
          <h2>Access rules</h2>
          <span>Organization, field groups and column permissions</span>
        </div>
      </div>
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
              <label>
                <input
                  type="checkbox"
                  checked={descendants}
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
                disabled={busy || !user || !scope || !reason}
                onClick={() =>
                  run(() =>
                    mutate("scope", {
                      user_id: user,
                      ...scopePayload(),
                      actions,
                      starts_on: startsOn,
                      ends_on: endsOn || null,
                      reason,
                    }),
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
                  run(async () => {
                    for (const action of actions)
                      await mutate("policy", {
                        user_id: user,
                        [isGroup ? "group_id" : "field_id"]: subject,
                        action,
                        effect,
                        inherit_new: isGroup && inherit,
                        ...scopePayload(),
                        reason,
                      });
                  })
                }
              >
                Save field policy
              </button>
              <button
                disabled={!user || !scope || scope === "all"}
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
                          <td>{p.explanation}</td>
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
              <h3>Current scope and field policies</h3>
              {![...(data?.scopes || []), ...(data?.policies || [])].some(
                (p: any) => !user || p.user_id === user,
              ) && (
                <p>
                  No policies for this selection. Access is denied until
                  explicitly granted.
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
                .filter((p) => !user || p.user_id === user)
                .map((p: any) => (
                  <div className="field-row" key={p.id}>
                    <span>
                      {p.kind} · {p.scope_type} ·{" "}
                      {p.action || p.actions.join("/")} · {p.effect || "grant"}
                      <small>
                        {p.field_id
                          ? context.fields.find((f) => f.id === p.field_id)
                              ?.label
                          : context.groups.find((g) => g.id === p.group_id)
                              ?.name}
                      </small>
                    </span>
                    <button
                      className="danger"
                      disabled={!reason || busy}
                      onClick={() =>
                        run(() =>
                          mutate(p.kind, { id: p.id, remove: true, reason }),
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
            <h3>Account and capabilities</h3>
            <p>
              Create the Auth account through trusted Supabase administration,
              then enroll its UUID here. New accounts have no data access until
              granted.
            </p>
            <div className="form-grid">
              <label>
                Auth user UUID
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                />
              </label>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
              <div className="form-control">
                <span>Role template</span>
                <SearchFilterPicker
                  mode="single"
                  label="Role template"
                  options={["admin", "viewer", "superadmin"].map((id) => ({
                    id,
                    label: id,
                  }))}
                  value={[role]}
                  onChange={(v) => setRole(v[0] || "viewer")}
                />
              </div>
            </div>
            <button
              disabled={!reason || !newId || !displayName || busy}
              onClick={() =>
                run(() =>
                  mutate("profile", {
                    id: newId,
                    display_name: displayName,
                    role,
                    active: true,
                    reason,
                  }),
                )
              }
            >
              Enroll account
            </button>
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
                          onChange={(e) =>
                            run(() =>
                              mutate("capability", {
                                user_id: user,
                                capability: cap,
                                remove: !e.target.checked,
                                reason,
                              }),
                            )
                          }
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
      </div>
    </section>
  );
}
