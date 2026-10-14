import { useEffect, useState } from "react";
import type { Context, Field, Option } from "../domain";
import { query, mutate } from "../api";
import { Dialog } from "./Dialog";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { ValueEditor } from "./ValueEditor";
import { FloatingNotification } from "./FloatingNotification";
export function ClientSettings({
  context,
  options,
  initialClient,
  onClose,
  onSaved,
}: {
  context: Context;
  options: Option[];
  initialClient?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [client, setClient] = useState(initialClient ?? ""),
    [fields, setFields] = useState<Field[]>([]),
    [settings, setSettings] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setSettings(undefined);
    setFields([]);
    setError("");
    const o = options.find((o) => o.id === client);
    if (o)
      Promise.all([
        query("client_settings", { client_id: client }),
        query<Field[]>("target_fields", {
          target_level: "client",
          branch_id: o.branch_id,
          client_id: client,
        }),
      ])
        .then(([s, f]) => {
          if (active) {
            setSettings(s);
            setFields(f);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [client, context.revision]);
  const defaultFields = fields.filter(
    (f) =>
      f.type !== "system" &&
      !f.validation?.government_id_digits &&
      f.actions.includes("C"),
  );
  return (
    <Dialog title="Client entry settings" onClose={onClose} wide>
      <div className="dialog-body client-settings-body">
        <div className="form-control">
          <span>Client</span>
          <SearchFilterPicker
            mode="single"
            label="Client settings scope"
            options={options.filter((o) => o.kind === "client" && o.active)}
            value={client ? [client] : []}
            onChange={(v) => setClient(v[0] ?? "")}
          />
        </div>
        {settings && (
          <>
            {context.profile.role === "superadmin" && (
              <fieldset>
                <legend>ID allocation</legend>
                <SearchFilterPicker
                  mode="single"
                  label="ID allocation"
                  options={[
                    { id: "automatic", label: "Automatic" },
                    { id: "manual", label: "Manual" },
                  ]}
                  value={[settings.id_mode || "automatic"]}
                  onChange={(ids) =>
                    setSettings({ ...settings, id_mode: ids[0] || "automatic" })
                  }
                />
                <p className="help-text">
                  IDs are unique within this client. Existing IDs are retained
                  when the mode changes.
                </p>
              </fieldset>
            )}
            <fieldset>
              <legend>Direct employee filters</legend>
              <p className="muted">
                Choose up to eight columns for this client. Each user sees only
                filters and values they can read.
              </p>
              <SearchFilterPicker
                mode="multiple"
                label="Direct filter columns"
                options={fields
                  .filter((f) => f.list_eligible && f.actions.includes("R"))
                  .map((f) => ({
                    id: f.key,
                    label: f.label,
                    field_type: f.type,
                    context: f.group_name,
                  }))}
                value={settings.filter_keys}
                onChange={(filter_keys) =>
                  setSettings({ ...settings, filter_keys })
                }
              />
            </fieldset>
            {context.profile.role === "superadmin" && (
              <fieldset>
                <legend>Defaults for new client employees</legend>
                <p className="muted">
                  Client defaults override shared defaults. Existing records and
                  transfers retain their values.
                </p>
                <SearchFilterPicker
                  mode="multiple"
                  label="Client default fields"
                  options={defaultFields.map((f) => ({
                    id: f.key,
                    label: f.label,
                    context: f.group_name,
                    field_type: f.type,
                  }))}
                  value={Object.keys(settings.default_values)}
                  onChange={(keys) =>
                    setSettings({
                      ...settings,
                      default_values: Object.fromEntries(
                        keys.map((k) => [
                          k,
                          Object.hasOwn(settings.default_values, k)
                            ? settings.default_values[k]
                            : (fields.find((f) => f.key === k)?.default_value ??
                              (fields.find((f) => f.key === k)?.type ===
                              "checkbox"
                                ? false
                                : "")),
                        ]),
                      ),
                    })
                  }
                />
                <div className="form-grid">
                  {defaultFields
                    .filter((f) =>
                      Object.hasOwn(settings.default_values, f.key),
                    )
                    .map((f) => (
                      <ValueEditor
                        key={f.key}
                        field={{ ...f, required: false }}
                        value={settings.default_values[f.key]}
                        onChange={(v) =>
                          setSettings({
                            ...settings,
                            default_values: {
                              ...settings.default_values,
                              [f.key]: v,
                            },
                          })
                        }
                      />
                    ))}
                </div>
              </fieldset>
            )}
          </>
        )}
        {error && (
          <FloatingNotification onDismiss={() => setError("")}>
            {error}
          </FloatingNotification>
        )}
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={!settings || busy || settings.filter_keys.length > 8}
          onClick={async () => {
            setBusy(true);
            try {
              await mutate("client_settings", {
                client_id: client,
                expected_version: settings.row_version,
                filter_keys: settings.filter_keys,
                ...(context.profile.role === "superadmin"
                  ? {
                      default_values: settings.default_values,
                      id_mode: settings.id_mode || "automatic",
                    }
                  : {}),
                reason: "Configure client entry defaults and direct filters",
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
          Save client settings
        </button>
      </footer>
    </Dialog>
  );
}
