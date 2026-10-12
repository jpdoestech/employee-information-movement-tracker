import { useState } from "react";
import { mutate } from "../api";
import type { Context } from "../domain";
import { Dialog } from "./Dialog";
import { FloatingNotification } from "./FloatingNotification";

export function FormTabEditor({
  groups,
  onClose,
  onSaved,
}: {
  groups: Context["groups"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      active: g.active,
      expected_version: g.row_version,
      tab_name: g.tab_name || g.name,
      tab_order: g.tab_order ?? 0,
    })),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog title="Employee form tabs" onClose={onClose} wide>
      <div className="dialog-body">
        <p className="muted">
          Assign groups to the same tab name to merge their entry sections.
          Lower orders appear first. Field permissions remain attached to each
          group.
        </p>
        <div className="form-tab-settings">
          {draft.map((group) => (
            <div className="form-tab-setting" key={group.id}>
              <strong>
                {group.name}
                {!group.active && <small>Inactive group</small>}
              </strong>
              <label>
                Tab name
                <input
                  aria-label={`Tab name for ${group.name}`}
                  maxLength={60}
                  value={group.tab_name}
                  onChange={(e) =>
                    setDraft((old) =>
                      old.map((g) =>
                        g.id === group.id
                          ? {
                              ...g,
                              tab_name: e.target.value,
                              tab_order:
                                old.find(
                                  (t) =>
                                    t.id !== g.id &&
                                    t.tab_name === e.target.value,
                                )?.tab_order ?? g.tab_order,
                            }
                          : g,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Order
                <input
                  aria-label={`Tab order for ${group.name}`}
                  type="number"
                  min={0}
                  max={999}
                  value={group.tab_order}
                  onChange={(e) =>
                    setDraft((old) =>
                      old.map((g) =>
                        g.tab_name === group.tab_name
                          ? { ...g, tab_order: Number(e.target.value) }
                          : g,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={
            busy ||
            !draft.length ||
            draft.some(
              (g) =>
                !g.tab_name.trim() ||
                !Number.isInteger(g.tab_order) ||
                g.tab_order < 0 ||
                g.tab_order > 999,
            )
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await mutate("form_layout", {
                groups: draft.map(({ name, active, ...g }) => ({
                  ...g,
                  tab_name: g.tab_name.trim(),
                })),
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
          Save tabs
        </button>
      </footer>
    </Dialog>
  );
}
