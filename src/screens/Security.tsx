import { UsersRound, ShieldCheck, Settings2, Plus, Pencil } from "lucide-react";
import { Dialog } from "../components/Dialog";
import { PermissionMatrix } from "../components/PermissionMatrix";
import { FloatingNotification } from "../components/FloatingNotification";
import { FieldTypeIcon } from "../components/FieldTypeIcon";
import { useEffect, useState } from "react";
import {
  query,
  mutate,
  createAccount,
  setAccountPassword,
  isDemo,
} from "../api";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import { requireConfirmation } from "../components/TransactionConfirmation";
import { grantStatus, scopeLabel } from "../accessReview";
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
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [duplicateThreshold, setDuplicateThreshold] = useState(
      String(context.register_settings.duplicate_name_threshold ?? 90),
    ),
    [newId, setNewId] = useState(""),
    [accountSource, setAccountSource] = useState("new"),
    [newEmail, setNewEmail] = useState(""),
    [initialPassword, setInitialPassword] = useState(""),
    [notice, setNotice] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [role, setRole] = useState("viewer"),
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
          <PermissionMatrix
            context={context}
            users={data?.users || []}
            initialUser={user}
            options={options}
            onSaved={onSaved}
          />
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
                      <p>
                        Manage permissions in Access rules. Movement correction
                        remains Superadmin-only.
                      </p>
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
