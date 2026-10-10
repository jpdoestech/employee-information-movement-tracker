import { FloatingNotification } from "../components/FloatingNotification";
import { useEffect, useState } from "react";
import { Plus, Edit3 } from "lucide-react";
import { query, mutate } from "../api";
import { Dialog } from "../components/Dialog";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import { ValueEditor } from "../components/ValueEditor";
import type { Context, Field, Option } from "../domain";
export function Organization({
  options,
  canManage,
  onSaved,
}: {
  options: Option[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<any>(),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [branches, setBranches] = useState<string[]>([]);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Branches and clients</h2>
          <p>Head Office, branches and branch-owned clients.</p>
        </div>
        {canManage && (
          <button
            className="primary"
            onClick={() =>
              setDraft({ kind: "branch", name: "", code: "", active: true })
            }
          >
            <Plus size={16} />
            Add organization
          </button>
        )}
      </div>
      <div className="filterbar">
        <label>
          Search organization
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <SearchFilterPicker
          mode="multiple"
          label="Branches"
          options={options.filter((o) => o.kind === "branch")}
          value={branches}
          onChange={setBranches}
        />
      </div>
      <div className="organization-grid">
        {options
          .filter(
            (o) =>
              o.label.toLowerCase().includes(search.toLowerCase()) &&
              (!branches.length ||
                branches.includes(o.id) ||
                branches.includes(o.branch_id || "")),
          )
          .map((o) => (
            <article className="panel org-card" key={o.id}>
              <span className="eyebrow">{o.kind?.replace("_", " ")}</span>
              <h3>{o.label}</h3>
              <p>{o.context}</p>
              <span className="badge">{o.active ? "Active" : "Inactive"}</span>
              {canManage && o.kind !== "head_office" && (
                <button
                  aria-label={`Edit ${o.label}`}
                  onClick={() =>
                    setDraft({
                      ...o,
                      name: o.label,
                      expected_version: o.row_version,
                    })
                  }
                >
                  <Edit3 size={16} />
                  Edit
                </button>
              )}
            </article>
          ))}
      </div>
      {draft && (
        <Dialog
          title={draft.id ? "Edit organization" : "Add organization"}
          onClose={() => setDraft(undefined)}
        >
          <div className="dialog-body">
            <SearchFilterPicker
              mode="single"
              label="Organization type"
              options={[
                { id: "branch", label: "Branch" },
                { id: "client", label: "Client" },
              ]}
              value={[draft.kind]}
              disabled={!!draft.id}
              onChange={(v) => setDraft({ ...draft, kind: v[0] })}
            />
            {draft.kind === "client" && (
              <SearchFilterPicker
                mode="single"
                label="Parent branch"
                options={options.filter((o) => o.kind === "branch" && o.active)}
                value={draft.branch_id ? [draft.branch_id] : []}
                disabled={!!draft.id}
                onChange={(v) => setDraft({ ...draft, branch_id: v[0] })}
              />
            )}
            <label>
              Code
              <input
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>
            <label>
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              Active for new placements
            </label>
            {error && (
              <FloatingNotification onDismiss={() => setError("")}>
                {error}
              </FloatingNotification>
            )}
          </div>
          <footer>
            <button onClick={() => setDraft(undefined)}>Cancel</button>
            <button
              className="primary"
              disabled={busy || !draft.name || !draft.code}
              onClick={async () => {
                setBusy(true);
                try {
                  await mutate("organization", draft);
                  onSaved();
                  setDraft(undefined);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save organization
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
export function FieldBuilder({
  context,
  options,
  onSaved,
}: {
  context: Context;
  options: Option[];
  onSaved: () => void;
}) {
  const [schema, setSchema] = useState<any>(),
    [draft, setDraft] = useState<any>(),
    [group, setGroup] = useState<any>(),
    [search, setSearch] = useState(""),
    [targets, setTargets] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sample, setSample] = useState<unknown>(""),
    [resolution, setResolution] = useState<any>();
  useEffect(() => {
    query("schema")
      .then(setSchema)
      .catch((e) => setError(e.message));
  }, [context.revision]);
  const fields: Field[] = schema?.fields || context.fields;
  const groups = schema?.groups || context.groups;
  useEffect(() => {
    setResolution(undefined);
    if (!draft?.id) return;
    let active = true;
    const timer = setTimeout(
      () =>
        query("field_scope_preview", {
          id: draft.id,
          scope_mode: draft.scope_mode,
          targets: targets.map((id) => {
            const o = options.find((o) => o.id === id);
            return {
              scope_type: o?.kind,
              scope_id: o?.kind === "head_office" ? null : id,
              include_descendants: !!draft.include_descendants,
            };
          }),
        })
          .then((r) => {
            if (active) setResolution(r);
          })
          .catch(() => {
            if (active) setResolution({ unavailable: true });
          }),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    draft?.id,
    draft?.scope_mode,
    draft?.include_descendants,
    JSON.stringify(targets),
    context.revision,
  ]);
  function edit(f?: Field) {
    setError("");
    setSample("");
    setDraft(
      f
        ? {
            ...f,
            expected_version: f.row_version,
            include_descendants: (schema?.targets || []).some(
              (t: any) => t.field_id === f.id && t.include_descendants,
            ),
          }
        : {
            key: "",
            label: "",
            type: "short_text",
            group_id: groups[0]?.id,
            required: false,
            active: true,
            sensitivity: "normal",
            scope_mode: "all",
            options: [],
            validation: {},
            help_text: "",
            display_order: 0,
            list_eligible: true,
          },
    );
    setTargets(
      f
        ? (schema?.targets || [])
            .filter((t: any) => t.field_id === f.id)
            .map((t: any) =>
              t.scope_type === "head_office" ? "head_office" : t.scope_id,
            )
        : [],
    );
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Field definitions</h2>
          <p>
            Configure fields once. Authorized forms and column choosers update
            automatically.
          </p>
        </div>
        <div className="actions">
          <button
            onClick={() =>
              setGroup({ name: "", description: "", active: true })
            }
          >
            New group
          </button>
          <button className="primary" onClick={() => edit()}>
            <Plus size={16} />
            New field
          </button>
        </div>
      </div>
      <label className="search-control">
        Search fields
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search active and inactive definitions"
        />
      </label>
      {groups.map((g: any) => (
        <section className="panel field-group" key={g.id}>
          <div className="section-heading">
            <div>
              <h3>{g.name}</h3>
              <p>
                {g.description ||
                  "Group permissions can inherit to new fields."}
              </p>
            </div>
            <button
              onClick={() =>
                setGroup({ ...g, expected_version: g.row_version })
              }
            >
              Edit group
            </button>
          </div>
          {fields
            .filter(
              (f) =>
                f.group_id === g.id &&
                f.label.toLowerCase().includes(search.toLowerCase()),
            )
            .map((f) => (
              <div className="field-row" key={f.id}>
                <div>
                  <strong>{f.label}</strong>
                  <small>
                    {f.key} · {f.type} ·{" "}
                    {f.scope_mode === "all"
                      ? "All authorized targets"
                      : "Selected targets"}
                  </small>
                </div>
                <span className="badge">
                  {f.sensitivity === "restricted"
                    ? "Explicit grant required"
                    : f.active
                      ? "Active"
                      : "Inactive"}
                </span>
                {f.type !== "system" && (
                  <button onClick={() => edit(f)}>Edit field</button>
                )}
              </div>
            ))}
        </section>
      ))}
      {draft && (
        <Dialog
          title={draft.id ? "Edit field definition" : "Create field definition"}
          onClose={() => setDraft(undefined)}
          wide
        >
          <div className="dialog-body">
            <p>
              Existing active and inactive names are checked by the database.
              Reuse or expand a matching field rather than duplicating it.
            </p>
            <div className="form-grid">
              <label>
                Label
                <input
                  value={draft.label}
                  onChange={(e) =>
                    setDraft({ ...draft, label: e.target.value })
                  }
                />
              </label>
              <label>
                Immutable machine key
                <input
                  value={draft.key}
                  disabled={!!draft.id}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  pattern="[a-z][a-z0-9_]*"
                />
              </label>
              <SearchFilterPicker
                mode="single"
                label="Field group"
                options={groups.map((g: any) => ({ id: g.id, label: g.name }))}
                value={[draft.group_id]}
                onChange={(v) => setDraft({ ...draft, group_id: v[0] })}
              />
              <SearchFilterPicker
                mode="single"
                label="Field type"
                options={[
                  "short_text",
                  "long_text",
                  "integer",
                  "decimal",
                  "date",
                  "checkbox",
                  "select",
                  "email",
                  "phone",
                ].map((id) => ({ id, label: id.replace("_", " ") }))}
                value={[draft.type]}
                onChange={(v) => setDraft({ ...draft, type: v[0] })}
              />
            </div>
            <label>
              Help text
              <input
                value={draft.help_text}
                onChange={(e) =>
                  setDraft({ ...draft, help_text: e.target.value })
                }
              />
            </label>
            {draft.type === "select" && (
              <label>
                Dropdown choices (one per line)
                <textarea
                  value={draft.options.join("\n")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </label>
            )}
            <div className="form-grid">
              {["min", "max", "max_length"].map((k) => (
                <label key={k}>
                  {k.replace("_", " ")}
                  <input
                    type="number"
                    value={draft.validation?.[k] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        validation: {
                          ...draft.validation,
                          [k]:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Display order
                <input
                  type="number"
                  value={draft.display_order || 0}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      display_order: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <div className="checks">
              <label>
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) =>
                    setDraft({ ...draft, required: e.target.checked })
                  }
                />
                Required
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) =>
                    setDraft({ ...draft, active: e.target.checked })
                  }
                />
                Active
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.list_eligible}
                  onChange={(e) =>
                    setDraft({ ...draft, list_eligible: e.target.checked })
                  }
                />
                Eligible table column
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.sensitivity === "restricted"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sensitivity: e.target.checked ? "restricted" : "normal",
                    })
                  }
                />
                Restricted: explicit field grants only
              </label>
            </div>
            <SearchFilterPicker
              mode="single"
              label="Applicability"
              options={[
                { id: "all", label: "All branches and clients" },
                {
                  id: "selected",
                  label: "Selected branches / clients / Head Office",
                },
              ]}
              value={[draft.scope_mode]}
              onChange={(v) => setDraft({ ...draft, scope_mode: v[0] })}
            />
            {draft.scope_mode === "selected" && (
              <>
                <SearchFilterPicker
                  mode="multiple"
                  label="Applicable organizations"
                  options={options}
                  value={targets}
                  onChange={setTargets}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={!!draft.include_descendants}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        include_descendants: e.target.checked,
                      })
                    }
                  />
                  Include clients under selected branches
                </label>
              </>
            )}
            <div className="notice">
              <strong>Applicability preview</strong>
              {draft.id && (
                <p>
                  {resolution?.unavailable
                    ? "Resolution preview unavailable; reload before changing scope."
                    : resolution
                      ? `${resolution.resolved_targets} resolved authorized targets. ${resolution.affected_visible_values} existing visible values will be retained outside the proposed scope.`
                      : "Checking existing values and resolved targets..."}
                </p>
              )}
              <p>
                {draft.scope_mode === "all"
                  ? "All present and future organizations"
                  : `${targets.length} explicit targets: ${targets.map((id) => options.find((o) => o.id === id)?.label).join(", ")}`}
              </p>
              <p>
                Permission and applicability must both pass. Existing
                nonapplicable values are retained and hidden in ordinary entry.
                Scope changes refresh workbook projections.
              </p>
            </div>
            <h3>Form preview</h3>
            <label>
              <input
                type="checkbox"
                checked={
                  draft.default_value !== undefined &&
                  draft.default_value !== null
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    default_value: e.target.checked ? sample : undefined,
                  })
                }
              />
              Use the preview value as the default
            </label>
            <ValueEditor
              field={draft}
              value={sample}
              onChange={(v) => {
                setSample(v);
                if (draft.default_value !== undefined)
                  setDraft({ ...draft, default_value: v });
              }}
            />
            {error && (
              <FloatingNotification onDismiss={() => setError("")}>
                {error}
              </FloatingNotification>
            )}
          </div>
          <footer>
            <button onClick={() => setDraft(undefined)}>Cancel</button>
            <button
              className="primary"
              disabled={
                busy ||
                !draft.key ||
                !draft.label ||
                (!!draft.id && (!resolution || resolution.unavailable))
              }
              onClick={async () => {
                setBusy(true);
                try {
                  await mutate("field", {
                    ...draft,
                    targets: targets.map((id) => {
                      const o = options.find((o) => o.id === id)!;
                      return {
                        scope_type: o.kind,
                        scope_id: o.kind === "head_office" ? null : o.id,
                        include_descendants: !!draft.include_descendants,
                      };
                    }),
                  });
                  onSaved();
                  setDraft(undefined);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save definition
            </button>
          </footer>
        </Dialog>
      )}
      {group && (
        <Dialog title="Field group" onClose={() => setGroup(undefined)}>
          <div className="dialog-body">
            <label>
              Name
              <input
                value={group.name}
                onChange={(e) => setGroup({ ...group, name: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={group.description || ""}
                onChange={(e) =>
                  setGroup({ ...group, description: e.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={group.active}
                onChange={(e) =>
                  setGroup({ ...group, active: e.target.checked })
                }
              />
              Active
            </label>
            {error && (
              <FloatingNotification onDismiss={() => setError("")}>
                {error}
              </FloatingNotification>
            )}
          </div>
          <footer>
            <button onClick={() => setGroup(undefined)}>Cancel</button>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await mutate("group", group);
                  onSaved();
                  setGroup(undefined);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save group
            </button>
          </footer>
        </Dialog>
      )}
    </>
  );
}
