import { useEffect, useState, type ReactNode } from "react";
import {
  RotateCcw,
  Search,
  Building2,
  BriefcaseBusiness,
  CircleDot,
  SlidersHorizontal,
} from "lucide-react";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { fieldTypeIcons } from "./FieldTypeIcon";
import { ClientSettings } from "./ClientSettings";
import { query } from "../api";
import {
  defaultFilter,
  statuses,
  type Context,
  type Field,
  type Filter,
  type Option,
} from "../domain";
function DirectFilter({
  field,
  clientId,
  filter,
  setFilter,
}: {
  field: Field;
  clientId?: string;
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const predicate = filter.predicates.find((p) => p.key === field.key);
  const values =
    predicate?.op === "in"
      ? (predicate.value as unknown[]).map((v) => JSON.stringify(v))
      : predicate?.op === "eq"
        ? [JSON.stringify(predicate.value)]
        : [];
  return (
    <SearchFilterPicker
      mode="multiple"
      label={field.label}
      icon={fieldTypeIcons[field.type]}
      load={(search) =>
        query<Option[]>("filter_values", {
          key: field.key,
          client_id: clientId,
          search,
        })
      }
      value={values}
      options={values.map((id) => ({ id, label: String(JSON.parse(id)) }))}
      onChange={(ids) =>
        setFilter({
          ...filter,
          offset: 0,
          predicates: [
            ...filter.predicates.filter((p) => p.key !== field.key),
            ...(ids.length
              ? [
                  {
                    key: field.key,
                    op: "in",
                    value: ids.map((id) => JSON.parse(id)),
                  },
                ]
              : []),
          ],
        })
      }
    />
  );
}
export function FilterBar({
  filter,
  setFilter,
  options,
  children,
  context,
  onSaved,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  options: Option[];
  children?: ReactNode;
  context: Context;
  onSaved: () => void;
}) {
  const clientId =
    filter.clients.length === 1
      ? filter.clients[0]
      : filter.quick?.kind === "client"
        ? filter.quick.id
        : undefined;
  const [keys, setKeys] = useState<string[]>(["status"]),
    [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setKeys(["status"]);
    if (clientId)
      query("client_settings", { client_id: clientId })
        .then((s) => {
          if (active) setKeys(s.filter_keys);
        })
        .catch(() => {
          if (active) setKeys([]);
        });
    return () => {
      active = false;
    };
  }, [clientId, context.revision]);
  const set = (patch: Partial<Filter>) =>
    setFilter({ ...filter, ...patch, offset: 0 });
  return (
    <>
      <div className="filterbar direct-filterbar">
        <label className="search-control">
          <Search size={16} aria-hidden />
          <input
            type="search"
            aria-label="Search employees"
            placeholder="Search…"
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>
        <div className="toolbar-placement">
          <SearchFilterPicker
            mode="multiple"
            label="Branches"
            icon={Building2}
            options={options.filter((o) => o.kind === "branch")}
            value={filter.branches}
            onChange={(branches) =>
              set({
                branches,
                clients: filter.clients.filter((id) =>
                  options.some(
                    (o) =>
                      o.id === id &&
                      (!branches.length || branches.includes(o.branch_id!)),
                  ),
                ),
                predicates: [],
              })
            }
          />
          <SearchFilterPicker
            mode="multiple"
            label="Clients"
            icon={BriefcaseBusiness}
            options={options.filter(
              (o) =>
                o.kind === "client" &&
                (!filter.branches.length ||
                  filter.branches.includes(o.branch_id!)),
            )}
            value={filter.clients}
            onChange={(clients) =>
              set({ clients, predicates: [], quick: null })
            }
          />
        </div>
        {keys.map((key) => {
          const field = context.fields.find(
            (f) =>
              f.key === key &&
              f.active &&
              f.list_eligible &&
              f.actions.includes("R"),
          );
          if (!field) return null;
          return key === "status" ? (
            <SearchFilterPicker
              key={key}
              mode="multiple"
              label="Status"
              icon={CircleDot}
              options={statuses}
              value={filter.statuses}
              onChange={(statuses) => set({ statuses })}
            />
          ) : (
            <DirectFilter
              key={`${clientId}:${key}`}
              field={field}
              clientId={clientId}
              filter={filter}
              setFilter={setFilter}
            />
          );
        })}
        <div className="toolbar-views">{children}</div>
        {context.capabilities.includes("schema_manage") && (
          <button
            type="button"
            className="icon-button"
            aria-label="Configure client filters and defaults"
            title="Client entry settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal size={16} aria-hidden />
          </button>
        )}
        <button
          className="filter-reset"
          type="button"
          aria-label="Reset filters"
          title="Reset filters"
          onClick={() => setFilter({ ...defaultFilter })}
        >
          <RotateCcw size={16} aria-hidden />
          <span>Reset</span>
        </button>
      </div>
      {settingsOpen && (
        <ClientSettings
          context={context}
          options={options}
          initialClient={clientId}
          onClose={() => setSettingsOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
