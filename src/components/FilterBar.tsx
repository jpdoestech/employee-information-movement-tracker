import { useCallback, type ReactNode } from "react";
import {
  RotateCcw,
  Search,
  Building2,
  BriefcaseBusiness,
  CircleDot,
  ListFilter,
} from "lucide-react";
import { Popover } from "./Popover";
import { SearchFilterPicker } from "./SearchFilterPicker";
import { query } from "../api";
import { defaultFilter, statuses, type Filter, type Option } from "../domain";
export function FilterBar({
  filter,
  setFilter,
  options,
  children,
  filters,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  options: Option[];
  children?: ReactNode;
  filters?: ReactNode;
}) {
  const count =
    filter.branches.length +
    filter.clients.length +
    filter.statuses.length +
    (filter.quick ? 1 : 0) +
    filter.predicates.length;
  const set = (patch: Partial<Filter>) =>
    setFilter({ ...filter, ...patch, offset: 0 });
  const load = useCallback(
    (search: string) => query<Option[]>("options", { search }),
    [],
  );
  return (
    <>
      <div className="filterbar">
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
        <div className="toolbar-status">
          <SearchFilterPicker
            mode="multiple"
            label="Status"
            icon={CircleDot}
            options={statuses}
            value={filter.statuses}
            onChange={(statuses) => set({ statuses })}
          />
        </div>
        <div className="toolbar-views">{children}</div>
        <Popover label="More filters" icon={ListFilter} count={count}>
          <div className="scope-editor">
            <div className="filter-section-heading">Assignment</div>
            <SearchFilterPicker
              mode="single"
              label="Search branch or client"
              displayLabel="Placement"
              icon={Search}
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
              onChange={(clients) => set({ clients })}
            />
            <div className="scope-mobile-status">
              <SearchFilterPicker
                mode="multiple"
                label="Status"
                icon={CircleDot}
                options={statuses}
                value={filter.statuses}
                onChange={(statuses) => set({ statuses })}
              />
            </div>
            <div className="filter-section-heading filter-rule-heading">
              Column rules
            </div>
            {filters}
          </div>
        </Popover>
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
    </>
  );
}
