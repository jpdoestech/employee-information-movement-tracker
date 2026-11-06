import { useEffect, useState } from "react";
import type { Context } from "../domain";
import { mutate, query } from "../api";
import { Dialog } from "./Dialog";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { FloatingNotification } from "./FloatingNotification";

type Settings = { row_version: number; filter_keys: string[] | null };
function QuickFilterEditor({
  user,
  context,
  onClose,
  onSaved,
}: {
  user: { id: string; display_name: string };
  context: Context;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [initial, setInitial] = useState<Settings>(),
    [keys, setKeys] = useState<string[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    query<Settings>("quick_filter_settings", { user_id: user.id })
      .then((s) => {
        if (active) {
          setInitial(s);
          setKeys(s.filter_keys);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  const dirty =
    !!initial && JSON.stringify(keys) !== JSON.stringify(initial.filter_keys);
  return (
    <Dialog
      title="User quick filters"
      onClose={onClose}
      isDirty={dirty}
      closeDisabled={busy}
    >
      <div className="dialog-body">
        <p>{user.display_name}</p>
        <p>
          Assign up to five quick filters in addition to Branches and Clients.
          Only fields the user can read appear; these settings do not grant
          access.
        </p>
        <fieldset disabled={busy || !initial}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={keys === null}
              onChange={(e) => setKeys(e.target.checked ? null : ["status"])}
            />
            Use client/default quick filters
          </label>
          {keys !== null && (
            <SearchFilterPicker
              mode="multiple"
              label="Quick filter fields"
              value={keys}
              onChange={setKeys}
              options={context.fields
                .filter(
                  (f) =>
                    f.active &&
                    f.list_eligible &&
                    f.actions.includes("R") &&
                    !["branch", "client"].includes(f.key),
                )
                .map((f) => ({
                  id: f.key,
                  label: f.label,
                  context: f.group_name,
                }))}
            />
          )}
        </fieldset>
        {keys !== null && (
          <p className={keys.length > 5 ? "error" : "muted"}>
            {keys.length} of 5 selected. An empty selection hides custom quick
            filters.
          </p>
        )}
        <small>
          User assignments replace client quick-filter shortcuts. Client entry
          defaults and saved filters remain available.
        </small>
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={busy || !dirty || (keys?.length ?? 0) > 5}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await mutate("quick_filters", {
                user_id: user.id,
                filter_keys: keys,
                expected_version: initial!.row_version,
                reason: "Assign user employee quick filters",
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
          Save quick filters
        </button>
      </footer>
    </Dialog>
  );
}
export function UserQuickFilters({
  context,
  users,
  onSaved,
}: {
  context: Context;
  users: { id: string; display_name: string }[];
  onSaved: () => void;
}) {
  const [account, setAccount] = useState(""),
    [open, setOpen] = useState(false);
  const user = users.find((u) => u.id === account);
  if (context.profile.role !== "superadmin") return null;
  return (
    <section>
      <h3>User quick filters</h3>
      <p>
        Choose an account to assign Department, Position, or other list fields.
        Maximum five per user.
      </p>
      <div className="managed-view-heading">
        <SearchFilterPicker
          mode="single"
          label="Quick filter account"
          value={account ? [account] : []}
          onChange={(v) => setAccount(v[0] || "")}
          options={users.map((u) => ({ id: u.id, label: u.display_name }))}
        />
        <button disabled={!user} onClick={() => setOpen(true)}>
          Configure quick filters
        </button>
      </div>
      {open && user && (
        <QuickFilterEditor
          user={user}
          context={context}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
