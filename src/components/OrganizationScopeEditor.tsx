import { useState } from "react";
import { Plus, X } from "lucide-react";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { accessPresets, grantStatus, scopeLabel } from "../accessReview";
import { scopeLocation, type ScopeGrant } from "../scopeDraft";
import type { Option } from "../domain";

const actionLabels = { R: "View", C: "Create", U: "Update", D: "Delete" };
export function OrganizationScopeEditor({
  value,
  options,
  today,
  disabled,
  onChange,
}: {
  value: ScopeGrant[];
  options: Option[];
  today: string;
  disabled: boolean;
  onChange: (value: ScopeGrant[]) => void;
}) {
  const [preset, setPreset] = useState("");
  function create(
    location: Option,
    actions = ["R"],
    descendants = false,
  ): ScopeGrant {
    return {
      id: crypto.randomUUID(),
      scope_type: location.kind!,
      scope_id: ["branch", "client"].includes(location.kind!)
        ? location.id
        : null,
      include_descendants: location.kind === "branch" && descendants,
      actions: [...actions],
      starts_on: today,
      ends_on: null,
      active: true,
    };
  }
  function edit(id: string, patch: Partial<ScopeGrant>) {
    onChange(
      value.map((grant) => (grant.id === id ? { ...grant, ...patch } : grant)),
    );
  }
  return (
    <div className="organization-scope-editor">
      <div className="form-grid">
        <div className="form-control">
          <span>Allowed locations</span>
          <SearchFilterPicker
            mode="multiple"
            label="Allowed locations"
            options={options}
            disabled={disabled}
            value={[...new Set(value.map(scopeLocation))]}
            onChange={(ids) =>
              onChange([
                ...value.filter((grant) => ids.includes(scopeLocation(grant))),
                ...ids
                  .filter(
                    (id) => !value.some((grant) => scopeLocation(grant) === id),
                  )
                  .flatMap((id) => {
                    const location = options.find((option) => option.id === id);
                    const selected = accessPresets.find(
                      (p) => p.id === preset && p.kind === location?.kind,
                    );
                    return location
                      ? [
                          create(
                            location,
                            selected?.actions,
                            selected?.descendants,
                          ),
                        ]
                      : [];
                  }),
              ])
            }
          />
        </div>
        <div className="form-control">
          <span>Access preset</span>
          <SearchFilterPicker
            mode="single"
            label="Access preset"
            disabled={disabled}
            value={preset ? [preset] : []}
            options={accessPresets.map((p) => ({ id: p.id, label: p.label }))}
            onChange={(ids) => {
              setPreset(ids[0] || "");
              const selected = accessPresets.find((p) => p.id === ids[0]);
              if (!selected) return;
              const location = options.find(
                (option) => option.kind === selected.kind,
              );
              const updated = value.map((grant) =>
                grant.scope_type === selected.kind
                  ? {
                      ...grant,
                      actions: [...selected.actions],
                      include_descendants: selected.descendants,
                    }
                  : grant,
              );
              if (
                location &&
                ["all", "head_office"].includes(selected.kind) &&
                !value.some((g) => g.scope_type === selected.kind)
              )
                updated.push(
                  create(location, selected.actions, selected.descendants),
                );
              onChange(updated);
            }}
          />
        </div>
      </div>
      <p className="muted">
        Select every location this user should have. Unselecting a location
        removes its grants when you save. Review actions and dates below.
      </p>
      <p className="muted">
        New locations start with View access unless a matching preset is
        selected. Module and field permissions still apply.
      </p>
      {value.some(
        (g) =>
          !g.actions.length ||
          !g.starts_on ||
          Boolean(g.ends_on && g.ends_on <= g.starts_on),
      ) && (
        <p role="alert">
          Each location needs at least one action and a start date. An end date
          must be after its start date.
        </p>
      )}
      {value.some(
        (grant) =>
          grant.scope_type === "all" && grantStatus(grant, today) === "Active",
      ) && (
        <p className="notice">
          All organization scopes is selected. Its actions apply across every
          branch and client. Remove it to restrict this user to selected
          locations.
        </p>
      )}
      {!value.length && (
        <p className="muted">
          No organization locations selected. This user will have no employee
          access through organization grants.
        </p>
      )}
      {value.map((grant) => (
        <div className="scope-grant-editor" key={grant.id}>
          <div className="scope-grant-heading">
            <strong>{scopeLabel(grant, options)}</strong>
            <span className="badge">{grantStatus(grant, today)}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${scopeLabel(grant, options)} grant`}
              onClick={() =>
                onChange(value.filter((item) => item.id !== grant.id))
              }
            >
              <X size={14} aria-hidden />
              Remove
            </button>
          </div>
          <div className="scope-grant-actions">
            {Object.entries(actionLabels).map(([action, label]) => (
              <label key={action}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={grant.actions.includes(action)}
                  onChange={(event) =>
                    edit(grant.id, {
                      actions: event.target.checked
                        ? [...grant.actions, action]
                        : grant.actions.filter((a) => a !== action),
                    })
                  }
                />
                {label}
              </label>
            ))}
            {grant.scope_type === "branch" && (
              <label>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={grant.include_descendants}
                  onChange={(event) =>
                    edit(grant.id, {
                      include_descendants: event.target.checked,
                    })
                  }
                />
                Include all branch clients
              </label>
            )}
          </div>
          <details>
            <summary>
              Dates and status · {grant.starts_on}
              {grant.ends_on
                ? ` to ${grant.ends_on} (exclusive)`
                : "; no end date"}
            </summary>
            <div className="form-grid scope-grant-dates">
              <label>
                Starts
                <input
                  aria-label={`Starts for ${scopeLabel(grant, options)}`}
                  type="date"
                  disabled={disabled}
                  value={grant.starts_on}
                  onChange={(event) =>
                    edit(grant.id, { starts_on: event.target.value })
                  }
                />
              </label>
              <label>
                Ends (exclusive)
                <input
                  aria-label={`Ends for ${scopeLabel(grant, options)}`}
                  type="date"
                  disabled={disabled}
                  value={grant.ends_on || ""}
                  onChange={(event) =>
                    edit(grant.id, { ends_on: event.target.value || null })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={grant.active !== false}
                  onChange={(event) =>
                    edit(grant.id, { active: event.target.checked })
                  }
                />
                Enabled
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange([...value, { ...grant, id: crypto.randomUUID() }])
                }
              >
                <Plus size={14} aria-hidden />
                Add another period
              </button>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
