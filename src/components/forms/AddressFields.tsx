import { LoadingProgress } from "../ui/LoadingProgress";
import { useEffect, useId, useRef, useState } from "react";
import { Search, MapPin } from "lucide-react";
import { cities, provinces, regions, searchBarangays } from "../../address/addressService";
import { DropdownSurface } from "../ui/DropdownSurface";

export type AddressValue = { address: string | null; barangay: string | null; city_municipality: string | null; province: string | null; postal_code: string | null };
type Props = { value: AddressValue; disabled?: boolean; onChange: (value: AddressValue) => void; onValidityChange?: (valid: boolean) => void };
type Option = { code: string; name: string; detail?: string; cityCode?: string };
const inputClass = "focus-ring mt-1.5 min-w-0 w-full max-w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink disabled:bg-line/20 disabled:text-ink/55";

function LocationSearch({ label, value, options, disabled, loading, error, onSearch, onSelect, onValidityChange, onInput }: {
  label: string; value: string; options: Option[]; disabled: boolean; loading?: boolean; error?: string;
  onSearch?: (query: string) => void; onSelect: (option: Option) => void; onValidityChange: (valid: boolean) => void;
  onInput?: (query: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const unresolved = useRef(false);
  const queryRef = useRef(value);
  const id = useId();
  useEffect(() => {
    if (value !== queryRef.current) unresolved.current = false;
    queryRef.current = value;
    setQuery(value);
    if (!unresolved.current) { setInvalid(false); input.current?.setCustomValidity(""); }
  }, [value]);
  const matches = onSearch ? options : options.filter((item) => `${item.name} ${item.detail ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 20);
  function select(option: Option) {
    unresolved.current = false; queryRef.current = option.name; onSelect(option); setQuery(option.name); setOpen(false); setInvalid(false);
    input.current?.setCustomValidity(""); onValidityChange(true);
  }
  return <div className="relative min-w-0" onBlur={(event) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false); setInvalid(unresolved.current);
  }}>
    <label htmlFor={id} className="block text-xs font-semibold text-ink/75">{label}</label>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 text-ink/35" />
      <input ref={input} id={id} className={`${inputClass} pl-8`} role="combobox" autoComplete="off" aria-expanded={open} aria-controls={`${id}-options`} aria-invalid={invalid} disabled={disabled} value={query} placeholder={`Search ${label.toLowerCase()}`} onClick={() => setOpen(true)} onFocus={() => { setOpen(true); onSearch?.(query); }}
        onChange={(event) => { const next = event.target.value; queryRef.current = next; setQuery(next); setOpen(true); setInvalid(false); onSearch?.(next); onInput?.(next);
          const valid = !next || next === value; unresolved.current = !valid; event.currentTarget.setCustomValidity(valid ? "" : `Choose a ${label.toLowerCase()} from the official list.`); onValidityChange(valid);
        }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && open) { event.preventDefault(); if (matches.length === 1) select(matches[0]); } }} />
    </div>
    {invalid ? <p className="mt-1 text-xs text-red-700">Choose a {label.toLowerCase()} from the official list.</p> : null}
    {open && !disabled ? <DropdownSurface id={`${id}-options`} role="listbox">
      {error || loading || !matches.length ? <div className="p-3 text-xs text-ink/60">{error || (loading ? <LoadingProgress label="Loading locations..." /> : query ? "No matching locations." : "Search locations")}</div> : matches.map((option) => <button key={option.code} type="button" role="option" aria-selected={option.name === value} className="flex w-full min-w-0 items-start gap-2 rounded px-2 py-2 text-left hover:bg-emerald-50 focus:bg-emerald-50" onMouseDown={(event) => event.preventDefault()} onClick={() => select(option)}>
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-moss" /><span className="min-w-0 break-words text-xs"><span className="block font-semibold">{option.name}</span>{option.detail ? <span className="block text-ink/55">{option.detail}</span> : null}</span>
      </button>)}
    </DropdownSurface> : null}
  </div>;
}

export function AddressFields({ value, disabled = false, onChange, onValidityChange }: Props) {
  const province = provinces.find((item) => item.name === value.province);
  const city = cities.find((item) => item.name === value.city_municipality && (!province || item.provinceCode === province.code));
  const [regionCode, setRegionCode] = useState(province?.regionCode ?? city?.regionCode ?? "");
  const region = regions.find((item) => item.code === (province?.regionCode ?? city?.regionCode ?? regionCode));
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const invalidFields = useRef(new Set<string>());
  function validity(field: string, valid: boolean) {
    if (valid) invalidFields.current.delete(field); else invalidFields.current.add(field);
    onValidityChange?.(invalidFields.current.size === 0);
  }
  function patch(next: Partial<AddressValue>) { onChange({ ...value, ...next }); }
  function clearValidity(...fields: string[]) { fields.forEach((field) => invalidFields.current.delete(field)); }
  useEffect(() => {
    let active = true;
    setOptions([]); setError("");
    if (!query.trim()) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      searchBarangays(query).then((items) => {
        if (!active) return;
        setOptions(items.map((item) => { const parentCity = cities.find((entry) => entry.code === item.cityCode); const parentProvince = provinces.find((entry) => entry.code === parentCity?.provinceCode);
          return { ...item, detail: [parentCity?.name, parentProvince?.name].filter(Boolean).join(", ") }; }));
      }).catch(() => { if (active) setError("Unable to load locations. Please try again."); }).finally(() => { if (active) setLoading(false); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  return <>
    <label className="block min-w-0 text-xs font-semibold text-ink/75 sm:col-span-2">Street / building<input className={inputClass} disabled={disabled} value={value.address ?? ""} onChange={(event) => patch({ address: event.target.value || null })} /></label>
    <LocationSearch label="Region" disabled={disabled} value={region?.name ?? ""} options={regions} onValidityChange={(valid) => validity("region", valid)} onSelect={(option) => { setRegionCode(option.code); patch({ province: null, city_municipality: null, barangay: null }); invalidFields.current.clear(); onValidityChange?.(true); }} />
    <LocationSearch label="Province" disabled={disabled} value={value.province ?? ""} options={provinces} onInput={(text) => { clearValidity("city", "barangay"); patch({ province: text || null, city_municipality: null, barangay: null }); }} onValidityChange={(valid) => validity("province", valid)} onSelect={(option) => { const parent = provinces.find((item) => item.code === option.code)!; setRegionCode(parent.regionCode); patch({ province: parent.name, city_municipality: null, barangay: null }); invalidFields.current.clear(); onValidityChange?.(true); }} />
    <LocationSearch label="City / municipality" disabled={disabled} value={value.city_municipality ?? ""} options={cities.map((item) => ({ ...item, detail: provinces.find((entry) => entry.code === item.provinceCode)?.name ?? regions.find((entry) => entry.code === item.regionCode)?.name }))} onInput={(text) => { clearValidity("barangay"); patch({ city_municipality: text || null, barangay: null }); }} onValidityChange={(valid) => validity("city", valid)} onSelect={(option) => { const parent = cities.find((item) => item.code === option.code)!; setRegionCode(parent.regionCode); patch({ province: provinces.find((item) => item.code === parent.provinceCode)?.name ?? null, city_municipality: parent.name, barangay: null }); invalidFields.current.clear(); onValidityChange?.(true); }} />
    <LocationSearch label="Barangay" disabled={disabled} value={value.barangay ?? ""} options={options} loading={loading} error={error} onInput={(text) => patch({ barangay: text || null })} onSearch={setQuery} onValidityChange={(valid) => validity("barangay", valid)} onSelect={(option) => {
      const parent = cities.find((item) => item.code === option.cityCode)!; setRegionCode(parent.regionCode);
      patch({ province: provinces.find((item) => item.code === parent.provinceCode)?.name ?? null, city_municipality: parent.name, barangay: option.name });
      invalidFields.current.clear(); onValidityChange?.(true);
    }} />
    <label className="block min-w-0 text-xs font-semibold text-ink/75">Postal code<input className={inputClass} disabled={disabled} value={value.postal_code ?? ""} onChange={(event) => patch({ postal_code: event.target.value || null })} /></label>
  </>;
}
