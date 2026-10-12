import { RecordExplorer } from "../components/RecordExplorer";
import { FormTabEditor } from "../components/FormTabEditor";
import { FloatingNotification } from "../components/FloatingNotification";
import { Fragment, useEffect, useState } from "react";
import { Plus, Search, FolderPlus } from "lucide-react";
import { query, mutate } from "../api";
import { Dialog } from "../components/Dialog";
import { confirmTransaction } from "../components/TransactionConfirmation";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import { ValueEditor } from "../components/ValueEditor";
import type { Context, Field, Option } from "../domain";
export function Organization({
  options,
  canManage,
  onSaved,
  revision,
}: {
  revision: number;
  options: Option[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <RecordExplorer
        kind="organization"
        revision={revision}
        options={options}
        onCreate={
          canManage
            ? () =>
                setDraft({ kind: "branch", name: "", code: "", active: true })
            : undefined
        }
        onEdit={
          canManage
            ? (row) =>
                setDraft({
                  ...row,
                  name: row.label,
                  expected_version: row.row_version,
                })
            : undefined
        }
      />
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
              {draft.kind === "client" ? "Client code / ID prefix" : "Code"}
              <input
                value={draft.code}
                pattern={
                  draft.kind === "client"
                    ? "[A-Za-z][A-Za-z0-9_-]{0,19}"
                    : undefined
                }
                maxLength={draft.kind === "client" ? 20 : undefined}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
              {draft.kind === "client" && (
                <small>
                  Used for client-based IDs, for example COM-00001. Locked after
                  IDs are issued.
                </small>
              )}
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
    [editingTabs, setEditingTabs] = useState(false),
    [draft, setDraft] = useState<any>(),
    [group, setGroup] = useState<any>(),
    [search, setSearch] = useState(""),
    [groupFilter, setGroupFilter] = useState<string[]>([]),
    [stateFilter, setStateFilter] = useState<string[]>([]),
    [targets, setTargets] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sample, setSample] = useState<unknown>(""),
    [resolution, setResolution] = useState<any>(),
    [previewAttempt, setPreviewAttempt] = useState(0);
  useEffect(() => {
    query("schema")
      .then(setSchema)
      .catch((e) => setError(e.message));
  }, [context.revision]);
  const fields: Field[] = schema?.fields || context.fields;
  const groups = schema?.groups || context.groups;
  // Advisory matching only; the database's Unicode case-folded unique indexes remain authoritative.
  const normalize = (s: string) =>
    s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const duplicate =
    draft &&
    fields.find(
      (f) =>
        f.id !== draft.id &&
        ((draft.key && f.key === draft.key) ||
          (draft.label && normalize(f.label) === normalize(draft.label))),
    );
  useEffect(() => {
    setResolution(undefined);
    if (!draft) return;
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
    previewAttempt,
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
      <section className="admin-workspace field-workspace panel data-panel">
        <div className="record-heading">
          <div>
            <h2>Field definitions</h2>
            <span>{fields.length} definitions</span>
          </div>
          <div className="actions">
            {context.profile.role === "superadmin" && (
              <button onClick={() => setEditingTabs(true)}>Form tabs</button>
            )}
            <button
              onClick={() =>
                setGroup({ name: "", description: "", active: true })
              }
            >
              <FolderPlus size={15} aria-hidden />
              New group
            </button>
            <button className="primary" onClick={() => edit()}>
              <Plus size={15} aria-hidden />
              New field
            </button>
          </div>
        </div>
        <div className="filterbar">
          <label className="search-control">
            <Search size={16} aria-hidden />
            <input
              type="search"
              aria-label="Search fields"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search definitions�"
            />
          </label>
          <SearchFilterPicker
            mode="multiple"
            label="Field groups"
            options={groups.map((g: any) => ({ id: g.id, label: g.name }))}
            value={groupFilter}
            onChange={setGroupFilter}
          />
          <SearchFilterPicker
            mode="multiple"
            label="Definition status"
            options={[
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
            ]}
            value={stateFilter}
            onChange={setStateFilter}
          />
        </div>
        <div
          className="data-scroll-region definition-list"
          role="region"
          aria-label="Field definitions"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Machine key</th>
                <th>Type</th>
                <th>Applicability</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups
                .filter(
                  (g: any) => !groupFilter.length || groupFilter.includes(g.id),
                )
                .map((g: any) => {
                  const matching = fields.filter(
                    (f) =>
                      f.group_id === g.id &&
                      `${f.label} ${f.key} ${f.help_text || ""}`
                        .toLowerCase()
                        .includes(search.toLowerCase()) &&
                      (!stateFilter.length ||
                        stateFilter.includes(f.active ? "active" : "inactive")),
                  );
                  if (!matching.length && (search || stateFilter.length))
                    return null;
                  return (
                    <Fragment key={g.id}>
                      <tr className="definition-group">
                        <th colSpan={6}>
                          <div>
                            <strong>{g.name}</strong>
                            <small>
                              {matching.length} fields
                              {!g.active ? " � Inactive group" : ""}
                            </small>
                            <button
                              onClick={() =>
                                setGroup({
                                  ...g,
                                  expected_version: g.row_version,
                                })
                              }
                              aria-label={`Edit group ${g.name}`}
                            >
                              Edit group
                            </button>
                          </div>
                        </th>
                      </tr>
                      {matching.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <strong>{f.label}</strong>
                            {f.sensitivity === "restricted" && (
                              <small>Explicit field grant</small>
                            )}
                          </td>
                          <td>
                            <code>{f.key}</code>
                          </td>
                          <td>{f.type.replaceAll("_", " ")}</td>
                          <td>
                            {f.scope_mode === "all"
                              ? "All authorized targets"
                              : "Selected targets"}
                          </td>
                          <td>
                            <span
                              className={`badge ${f.active ? "success" : ""}`}
                            >
                              {f.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            {f.type !== "system" && (
                              <button
                                onClick={() => edit(f)}
                                aria-label={`Edit field ${f.label}`}
                              >
                                Edit field
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="admin-panel-footer">
          New fields follow configured inheritance; restricted fields require
          explicit grants.
        </div>
      </section>
      {draft && (
        <Dialog
          title={draft.id ? "Edit field definition" : "Create field definition"}
          onClose={() => setDraft(undefined)}
          wide
        >
          <div className="dialog-body definition-editor">
            <p className="form-note">
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
              <div className="form-control">
                <span>Field group</span>
                <SearchFilterPicker
                  mode="single"
                  label="Field group"
                  options={groups.map((g: any) => ({
                    id: g.id,
                    label: g.name,
                  }))}
                  value={[draft.group_id]}
                  onChange={(v) => setDraft({ ...draft, group_id: v[0] })}
                />
              </div>
              <div className="form-control">
                <span>Field type</span>
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
            </div>
            {duplicate && (
              <div
                className="notice"
                role="status"
                aria-label="Matching field definition"
              >
                <strong>{duplicate.label}</strong>
                <p>
                  {duplicate.group_name} ·{" "}
                  {duplicate.active ? "Active" : "Inactive"}. A matching
                  definition already exists.
                </p>
                {duplicate.type !== "system" ? (
                  <button
                    onClick={async () => {
                      if (
                        await confirmTransaction(
                          "Discard unsaved changes?",
                          "Discard this draft to open the existing definition, or continue editing.",
                          "Discard changes",
                          "Continue editing",
                        )
                      )
                        edit(
                          duplicate.active
                            ? duplicate
                            : { ...duplicate, active: true },
                        );
                    }}
                  >
                    {duplicate.active
                      ? "Reuse / expand applicability"
                      : "Reactivate existing field"}
                  </button>
                ) : (
                  <p>
                    This is a system-managed field. Use its existing column and
                    permissions.
                  </p>
                )}
              </div>
            )}
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
              <p role="status" aria-live="polite">
                {resolution?.unavailable
                  ? "Resolution preview unavailable; reload before changing scope."
                  : resolution
                    ? `${resolution.resolved_targets} resolved authorized targets. ${resolution.scoped_employee_count} readable employees in scope.${draft.id ? ` ${resolution.affected_visible_values} existing visible values will be retained outside the proposed scope.` : ""}`
                    : "Checking authorized applicability..."}
              </p>
              {!!resolution?.samples?.length && (
                <ul
                  className="scope-samples"
                  aria-label="Authorized employee sample"
                >
                  {resolution.samples.map((s: any, i: number) => (
                    <li key={i}>
                      {s.employee_number && <span>{s.employee_number}</span>}
                      {s.name && <span>{s.name}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {resolution?.unavailable && (
                <button onClick={() => setPreviewAttempt((n) => n + 1)}>
                  Retry preview
                </button>
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
                !!duplicate ||
                !resolution ||
                resolution.unavailable ||
                (draft.scope_mode === "selected" && targets.length === 0)
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
      {editingTabs && (
        <FormTabEditor
          groups={groups}
          onClose={() => setEditingTabs(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
