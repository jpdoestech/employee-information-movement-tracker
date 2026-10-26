import { useState } from "react";
import { mutate } from "../api";
import {
  defaultFilter,
  type Context,
  type Option,
  type RegisterView,
} from "../domain";
import { managedDefaultColumns } from "../registerViews";
import { ColumnDesigner } from "./ColumnDesigner";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { FloatingNotification } from "./FloatingNotification";

type Account = { id: string; display_name: string };

function ViewEditor({
  rule,
  context,
  options,
  users,
  onClose,
  onSaved,
}: {
  rule: RegisterView;
  context: Context;
  options: Option[];
  users: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [user, setUser] = useState(rule.user_id || "all");
  const [scope, setScope] = useState(rule.scope_id || rule.scope_type);
  const target = options.find((o) => o.id === scope);
  return (
    <ColumnDesigner
      title="Managed column view"
      initialName={rule.name}
      defaultColumnKeys={managedDefaultColumns}
      fields={context.fields}
      layout={{ ...rule.config, filter: defaultFilter }}
      rowNumbersAllowed={context.register_settings.row_numbers_allowed}
      extraDirty={
        user !== (rule.user_id || "all") ||
        scope !== (rule.scope_id || rule.scope_type)
      }
      onClose={onClose}
      onApply={async (layout, name) => {
        await mutate("register_view", {
          id: rule.id,
          name,
          user_id: user === "all" ? null : user,
          scope_type:
            scope === "all" || scope === "head_office" ? scope : target?.kind,
          scope_id: target && target.kind !== "head_office" ? target.id : null,
          config: {
            columns: layout.columns,
            pinned: layout.pinned,
            showRowNumbers: layout.showRowNumbers !== false,
          },
          expected_version: context.register_settings.row_version,
          reason: "Configure managed employee column view",
        });
        onSaved();
      }}
    >
      <div className="managed-view-targets">
        <SearchFilterPicker
          mode="single"
          label="Accounts"
          value={[user]}
          options={[
            { id: "all", label: "All accounts" },
            ...users.map((u) => ({ id: u.id, label: u.display_name })),
          ]}
          onChange={(v) => setUser(v[0] || "all")}
        />
        <SearchFilterPicker
          mode="single"
          label="Applies to"
          value={[scope]}
          options={[
            { id: "all", label: "All branches and clients" },
            ...options.filter((o) =>
              ["branch", "client", "head_office"].includes(o.kind || ""),
            ),
          ]}
          onChange={(v) => setScope(v[0] || "all")}
        />
      </div>
      <small>
        Overrides personal columns. Client rules take priority over branch
        rules, then all locations. At the same location, the selected account
        takes priority over all accounts. Field permissions still apply.
      </small>
    </ColumnDesigner>
  );
}

export function ManagedRegisterViews({
  context,
  options,
  users,
  onSaved,
}: {
  context: Context;
  options: Option[];
  users: Account[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<RegisterView>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rules = context.register_settings.managed_views || [];
  const superadmin = context.profile.role === "superadmin";
  return (
    <section
      className="managed-register-views"
      aria-label="Managed column views"
    >
      <div className="managed-view-heading">
        <h3>Managed column views</h3>
        {superadmin && (
          <button
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                name: "Employee register",
                user_id: null,
                scope_type: "all",
                scope_id: null,
                config: {
                  columns: managedDefaultColumns,
                  pinned: ["employee_number", "name"],
                  showRowNumbers: true,
                },
              })
            }
          >
            Add column view
          </button>
        )}
      </div>
      <p>
        Set column order, visibility and pinned columns for everyone or a
        selected account, branch or client. Matching rules override personal
        views without granting field access. Mixed locations use the
        account-wide or global view.
      </p>
      <div
        className="data-scroll-region managed-view-table"
        role="region"
        aria-label="Managed column view rules"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>View</th>
              <th>Accounts</th>
              <th>Location</th>
              <th>Columns</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <th scope="row">{rule.name}</th>
                <td>
                  {rule.user_id
                    ? users.find((u) => u.id === rule.user_id)?.display_name ||
                      "Selected account"
                    : "All accounts"}
                </td>
                <td>
                  {rule.scope_type === "all"
                    ? "All branches and clients"
                    : rule.scope_type === "head_office"
                      ? "Head Office"
                      : options.find((o) => o.id === rule.scope_id)?.label ||
                        "Unavailable location"}
                </td>
                <td>{rule.config.columns.length}</td>
                <td>
                  {superadmin && (
                    <div className="security-row-actions">
                      <button
                        disabled={busy}
                        onClick={() => setEditing(rule)}
                        aria-label={`Edit column view ${rule.name}`}
                      >
                        Edit
                      </button>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await mutate("register_view", {
                              id: rule.id,
                              remove: true,
                              expected_version:
                                context.register_settings.row_version,
                              reason: "Remove managed employee column view",
                            });
                            onSaved();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        aria-label={`Remove column view ${rule.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rules.length && (
          <p>No managed views. Personal column settings apply.</p>
        )}
      </div>
      <small>
        Only a superadmin can manage these views. Removing a rule restores the
        next matching rule or the user’s personal columns.
      </small>
      {editing && (
        <ViewEditor
          key={editing.id}
          rule={editing}
          context={context}
          options={options}
          users={users}
          onClose={() => setEditing(undefined)}
          onSaved={onSaved}
        />
      )}
      {error && (
        <FloatingNotification onDismiss={() => setError("")}>
          {error}
        </FloatingNotification>
      )}
    </section>
  );
}
