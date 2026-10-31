import { Search, MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { normalizeText } from "../../inputNormalization";
import {
  cities,
  provinces,
  regions,
  searchBarangays,
  normalizeLocation,
} from "../../address/addressService";
import {
  addressKeys,
  type AddressKey,
  type AddressValue,
} from "../../address/addressFields";
export type { AddressValue } from "../../address/addressFields";
type Access = Record<
  AddressKey,
  { visible: boolean; write: boolean; clear: boolean; required: boolean }
>;
type Option = {
  code: string;
  name: string;
  detail?: string;
  cityCode?: string;
  disabled?: boolean;
};
const provinceByCode = new Map(provinces.map((p) => [p.code, p]));
const cityByCode = new Map(cities.map((c) => [c.code, c]));
const cityOptions = cities.map((c) => ({
  ...c,
  detail:
    provinceByCode.get(c.provinceCode ?? "")?.name ??
    regions.find((r) => r.code === c.regionCode)?.name,
}));
function LocationSearch({
  label,
  value,
  options,
  disabled,
  required,
  clearable = true,
  remote,
  loading,
  error,
  retry,
  reset,
  onSearch,
  onSelect,
  onClear,
  validity,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled: boolean;
  required?: boolean;
  clearable?: boolean;
  remote?: boolean;
  loading?: boolean;
  error?: string;
  retry?: () => void;
  reset: number;
  onSearch?: (query: string) => void;
  onSelect: (option: Option) => void;
  onClear: () => void;
  validity: (valid: boolean) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null),
    unresolved = useRef(false);
  const [query, setQuery] = useState(value),
    [open, setOpen] = useState(false),
    [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 250,
  });
  useEffect(() => {
    setQuery(value);
    unresolved.current = false;
    setInvalid(false);
    input.current?.setCustomValidity("");
  }, [value, reset]);
  const matches = remote
    ? options
    : options
        .filter((o) =>
          `${o.name} ${o.detail ?? ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 20);
  useEffect(() => {
    if (!open || disabled) return;
    const place = () => {
      const box = input.current!.getBoundingClientRect(),
        viewport = window.visualViewport,
        viewportWidth = viewport?.width || innerWidth,
        viewportHeight = viewport?.height || innerHeight,
        viewportLeft = viewport?.offsetLeft || 0,
        viewportTop = viewport?.offsetTop || 0,
        width = Math.min(Math.max(box.width, 280), viewportWidth - 24);
      const below = viewportTop + viewportHeight - box.bottom - 12,
        above = box.top - viewportTop - 12;
      const down = below >= 180 || below >= above,
        maxHeight = Math.max(0, Math.min(300, down ? below : above));
      setPosition({
        left: Math.min(
          Math.max(viewportLeft + 12, box.left),
          viewportLeft + viewportWidth - width - 12,
        ),
        top: down ? box.bottom + 4 : undefined,
        bottom: down ? undefined : innerHeight - box.top + 4,
        width,
        maxHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    const outside = (event: PointerEvent) => {
      if (
        !input.current?.contains(event.target as Node) &&
        !list.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, disabled]);
  function select(option: Option) {
    setQuery(option.name);
    unresolved.current = false;
    setOpen(false);
    setInvalid(false);
    input.current?.setCustomValidity("");
    onSelect(option);
    validity(true);
    input.current?.focus();
    setOpen(false);
  }
  const help = `Choose a ${label.toLowerCase()} from the official list.`;
  return (
    <div className="address-control">
      <label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      <div className="address-search-input">
        <Search size={16} aria-hidden />
        <input
          ref={input}
          id={id}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open && !disabled}
          aria-controls={`${id}-list`}
          aria-describedby={invalid ? `${id}-error` : undefined}
          aria-invalid={invalid}
          required={required}
          disabled={disabled}
          value={query}
          placeholder={`Search ${label.toLowerCase()}`}
          onFocus={() => {
            setOpen(true);
            onSearch?.(query);
          }}
          onClick={() => {
            setOpen(true);
            onSearch?.(query);
          }}
          onChange={(e) => {
            const next = e.target.value;
            if (!next && !clearable) {
              unresolved.current = false;
              e.currentTarget.setCustomValidity("");
              setQuery(value);
              setInvalid(false);
              validity(true);
              return;
            }
            setQuery(next);
            setOpen(true);
            onSearch?.(next);
            const valid = !next || next === value;
            unresolved.current = !valid;
            setInvalid(false);
            e.currentTarget.setCustomValidity(valid ? "" : help);
            validity(valid);
            if (!next) onClear();
          }}
          onBlur={(e) => {
            if (!list.current?.contains(e.relatedTarget as Node | null)) {
              setInvalid(unresolved.current);
              setOpen(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (
                !loading &&
                !error &&
                matches.length === 1 &&
                !matches[0].disabled
              )
                select(matches[0]);
            }
            if (e.key === "ArrowDown" && open) {
              e.preventDefault();
              list.current
                ?.querySelector<HTMLButtonElement>("[role=option]")
                ?.focus();
            }
          }}
        />
      </div>
      {invalid && (
        <p id={`${id}-error`} className="address-error">
          {help}
        </p>
      )}
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="address-suggestions"
            style={position}
            onMouseDown={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                input.current?.focus();
                setOpen(false);
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const buttons = [
                    ...list.current!.querySelectorAll<HTMLButtonElement>(
                      "[role=option]",
                    ),
                  ],
                  index = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                buttons[
                  (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            {loading ? (
              <p role="status">Loading locations...</p>
            ) : error ? (
              <div role="alert">
                <p>{error}</p>
                <button type="button" onClick={retry}>
                  Retry loading locations
                </button>
              </div>
            ) : !matches.length ? (
              <p role="status">
                {query ? "No matching locations." : "Search locations"}
              </p>
            ) : (
              matches.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  disabled={option.disabled}
                  aria-selected={
                    normalizeLocation(option.name) === normalizeLocation(value)
                  }
                  onClick={() => select(option)}
                >
                  <MapPin
                    size={16}
                    aria-hidden
                    className="address-option-icon"
                  />
                  <span className="address-option-label">
                    <span>{option.name}</span>
                    {option.detail && <small>{option.detail}</small>}
                  </span>
                  {option.disabled && (
                    <small>
                      Requires permission to change dependent fields.
                    </small>
                  )}
                </button>
              ))
            )}
          </div>,
          input.current?.closest("dialog") ?? document.body,
        )}
    </div>
  );
}
export function AddressFields({
  value,
  disabled = false,
  access,
  onChange,
  onValidityChange,
}: {
  value: AddressValue;
  disabled?: boolean;
  access?: Access;
  onChange: (value: AddressValue, patch: Partial<AddressValue>) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const rights =
    access ??
    (Object.fromEntries(
      addressKeys.map((k) => [
        k,
        { visible: true, write: true, clear: true, required: false },
      ]),
    ) as Access);
  const province = provinces.find(
    (p) => normalizeLocation(p.name) === normalizeLocation(value.province),
  );
  const city = cities.find(
    (c) =>
      normalizeLocation(c.name) ===
        normalizeLocation(value.city_municipality) &&
      c.provinceCode === (province?.code ?? null),
  );
  const [regionCode, setRegionCode] = useState(""),
    [query, setQuery] = useState(""),
    [options, setOptions] = useState<Option[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [resets, setResets] = useState<Record<string, number>>({});
  const invalid = useRef(new Set<string>());
  const region = regions.find(
    (r) => r.code === (province?.regionCode ?? city?.regionCode ?? regionCode),
  );
  function validity(key: string, valid: boolean) {
    if (valid) invalid.current.delete(key);
    else invalid.current.add(key);
    onValidityChange?.(!invalid.current.size);
  }
  function patch(next: Partial<AddressValue>, reset: string[] = []) {
    // Never write a hidden or unauthorized column as a side effect of hierarchy resolution.
    if (!canPatch(next)) return;
    const writes = Object.fromEntries(
      Object.entries(next).filter(
        ([key, nextValue]) => nextValue !== value[key as AddressKey],
      ),
    );
    onChange({ ...value, ...next }, writes);
    reset.forEach((k) => invalid.current.delete(k));
    setResets((old) =>
      Object.fromEntries(
        [...new Set([...Object.keys(old), ...reset])].map((k) => [
          k,
          (old[k] ?? 0) + (reset.includes(k) ? 1 : 0),
        ]),
      ),
    );
    onValidityChange?.(!invalid.current.size);
  }
  function canPatch(next: Partial<AddressValue>) {
    return Object.entries(next).every(
      ([key, nextValue]) =>
        nextValue === value[key as AddressKey] ||
        (nextValue === null
          ? rights[key as AddressKey].clear
          : rights[key as AddressKey].write),
    );
  }
  function cityPatch(
    code: string,
    barangay: string | null = null,
  ): Partial<AddressValue> {
    const c = cityByCode.get(code)!;
    return {
      province: provinceByCode.get(c.provinceCode ?? "")?.name ?? null,
      city_municipality: c.name,
      barangay,
    };
  }
  const canClear = (...keys: AddressKey[]) =>
    keys.every((k) => rights[k].clear || value[k] === null);
  const canWrite = (...keys: AddressKey[]) =>
    keys.every((k) => rights[k].write);
  useEffect(() => {
    let active = true;
    setOptions([]);
    setError("");
    setLoading(!!query.trim());
    if (!query.trim()) return;
    const timer = setTimeout(
      () =>
        searchBarangays(query)
          .then((items) => {
            if (active)
              setOptions(
                items.map((item) => {
                  const c = cityByCode.get(item.cityCode);
                  return {
                    ...item,
                    detail: [
                      c?.name,
                      provinceByCode.get(c?.provinceCode ?? "")?.name ??
                        regions.find((r) => r.code === c?.regionCode)?.name,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  };
                }),
              );
          })
          .catch(() => {
            if (active) setError("Unable to load locations. Try again.");
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, retry]);
  const common = (key: AddressKey) => ({
    value: value[key] ?? "",
    required: rights[key].required,
    clearable: rights[key].clear || !value[key],
    reset: resets[key] ?? 0,
    validity: (valid: boolean) => validity(key, valid),
  });
  return (
    <div className="address-grid">
      {rights.address.visible && (
        <label className="address-street">
          Street / building{rights.address.required ? " *" : ""}
          <input
            disabled={disabled || !rights.address.write}
            required={rights.address.required}
            value={value.address ?? ""}
            onChange={(e) => patch({ address: e.target.value || null })}
            onBlur={(e) =>
              patch({ address: normalizeText(e.target.value) || null })
            }
          />
        </label>
      )}
      {(rights.province.visible || rights.city_municipality.visible) && (
        <LocationSearch
          label="Region"
          value={region?.name ?? ""}
          reset={resets.region ?? 0}
          options={regions}
          disabled={
            disabled ||
            !canWrite("province", "city_municipality", "barangay") ||
            !canClear("province", "city_municipality", "barangay")
          }
          validity={(valid) => validity("region", valid)}
          onClear={() => {
            setRegionCode("");
            patch({ province: null, city_municipality: null, barangay: null }, [
              "region",
              "province",
              "city_municipality",
              "barangay",
            ]);
          }}
          onSelect={(o) => {
            setRegionCode(o.code);
            patch({ province: null, city_municipality: null, barangay: null }, [
              "region",
              "province",
              "city_municipality",
              "barangay",
            ]);
          }}
        />
      )}
      {rights.province.visible && (
        <LocationSearch
          label="Province"
          {...common("province")}
          clearable={canPatch({
            province: null,
            city_municipality: null,
            barangay: null,
          })}
          options={provinces.map((p) => ({
            ...p,
            disabled: !canPatch({
              province: p.name,
              city_municipality: null,
              barangay: null,
            }),
          }))}
          disabled={disabled || !rights.province.write}
          onClear={() =>
            patch({ province: null, city_municipality: null, barangay: null }, [
              "province",
              "city_municipality",
              "barangay",
            ])
          }
          onSelect={(o) => {
            setRegionCode(provinceByCode.get(o.code)!.regionCode);
            patch(
              { province: o.name, city_municipality: null, barangay: null },
              ["region", "province", "city_municipality", "barangay"],
            );
          }}
        />
      )}
      {rights.city_municipality.visible && (
        <LocationSearch
          label="City / municipality"
          {...common("city_municipality")}
          clearable={canPatch({ city_municipality: null, barangay: null })}
          options={cityOptions.map((c) => ({
            ...c,
            disabled: !canPatch(cityPatch(c.code)),
          }))}
          disabled={disabled || !rights.city_municipality.write}
          onClear={() =>
            patch({ city_municipality: null, barangay: null }, [
              "city_municipality",
              "barangay",
            ])
          }
          onSelect={(o) => {
            const c = cityByCode.get(o.code)!;
            setRegionCode(c.regionCode);
            patch(
              {
                province:
                  provinceByCode.get(c.provinceCode ?? "")?.name ?? null,
                city_municipality: c.name,
                barangay: null,
              },
              ["region", "province", "city_municipality", "barangay"],
            );
          }}
        />
      )}
      {rights.barangay.visible && (
        <LocationSearch
          label="Barangay"
          {...common("barangay")}
          options={options.map((b) => ({
            ...b,
            disabled: !canPatch(cityPatch(b.cityCode!, b.name)),
          }))}
          remote
          loading={loading}
          error={error}
          retry={() => setRetry((v) => v + 1)}
          onSearch={setQuery}
          disabled={disabled || !rights.barangay.write}
          onClear={() => patch({ barangay: null }, ["barangay"])}
          onSelect={(o) => {
            const c = cityByCode.get(o.cityCode!)!;
            setRegionCode(c.regionCode);
            patch(
              {
                province:
                  provinceByCode.get(c.provinceCode ?? "")?.name ?? null,
                city_municipality: c.name,
                barangay: o.name,
              },
              ["region", "province", "city_municipality", "barangay"],
            );
          }}
        />
      )}
      {rights.postal_code.visible && (
        <label className="address-postal">
          Postal code{rights.postal_code.required ? " *" : ""}
          <input
            disabled={disabled || !rights.postal_code.write}
            required={rights.postal_code.required}
            inputMode="numeric"
            value={value.postal_code ?? ""}
            onChange={(e) => patch({ postal_code: e.target.value || null })}
            onBlur={(e) =>
              patch({ postal_code: normalizeText(e.target.value) || null })
            }
          />
        </label>
      )}
    </div>
  );
}
