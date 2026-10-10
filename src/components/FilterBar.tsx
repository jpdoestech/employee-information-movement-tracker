import { useCallback } from "react";
import { RotateCcw, Search } from "lucide-react";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { query } from "../api";
import { defaultFilter, statuses, type Filter, type Option } from "../domain";
export function FilterBar({
  filter,
  setFilter,
  options,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  options: Option[];
}) {
  const set = (patch: Partial<Filter>) =>
    setFilter({ ...filter, ...patch, offset: 0 });
  const load = useCallback(
    (search: string) => query<Option[]>("options", { search }),
    [],
  );
  const quick = options.find((o) => o.id === filter.quick?.id);
  return (
    <>
      <div className="filterbar">
        <label className="search-control">
          <Search size={16} aria-hidden />
          <input
            type="search"
            aria-label="Search employees"
            placeholder="Search authorized employee fields"
            value={filter.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>
        <SearchFilterPicker
          mode="single"
          label="Search branch or client"
          options={options}
          load={load}
          value={filter.quick ? [filter.quick.id] : []}
          onChange={(v, selected) => {
            const o = selected?.[0] || options.find((o) => o.id === v[0]);
            set({ quick: o ? { id: o.id, kind: o.kind! } : null });
          }}
        />
        <SearchFilterPicker
          mode="multiple"
          label="Branches"
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
            })
          }
        />
        <SearchFilterPicker
          mode="multiple"
          label="Clients"
          options={options.filter(
            (o) =>
              o.kind === "client" &&
              (!filter.branches.length ||
                filter.branches.includes(o.branch_id!)),
          )}
          value={filter.clients}
          onChange={(clients) => set({ clients })}
        />
        <SearchFilterPicker
          mode="multiple"
          label="Status"
          options={statuses}
          value={filter.statuses}
          onChange={(statuses) => set({ statuses })}
        />
        <button type="button" onClick={() => setFilter({ ...defaultFilter })}>
          <RotateCcw size={16} />
          Reset
        </button>
      </div>
      <div className="chips">
        {filter.quick && (
          <button onClick={() => set({ quick: null })}>
            {quick?.label || "Selected organization"} ×
          </button>
        )}
        {[...filter.branches, ...filter.clients, ...filter.statuses].map(
          (id) => (
            <button
              key={id}
              onClick={() =>
                set({
                  branches: filter.branches.filter((x) => x !== id),
                  clients: filter.clients.filter((x) => x !== id),
                  statuses: filter.statuses.filter((x) => x !== id),
                })
              }
            >
              {options.find((o) => o.id === id)?.label || id} ×
            </button>
          ),
        )}
      </div>
    </>
  );
}
