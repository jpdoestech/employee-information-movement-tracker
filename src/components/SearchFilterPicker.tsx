import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Building2, Search, X, Check, ChevronDown } from "lucide-react";
import type { Option } from "../domain";
type Props = {
  mode: "single" | "multiple";
  label: string;
  options?: Option[];
  load?: (search: string) => Promise<Option[]>;
  value: string[];
  onChange: (value: string[], selected?: Option[]) => void;
  disabled?: boolean;
};
export function SearchFilterPicker({
  mode,
  label,
  options = [],
  load,
  value,
  onChange,
  disabled,
}: Props) {
  const id = useId(),
    anchor = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState(value),
    [remote, setRemote] = useState<Option[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [highlight, setHighlight] = useState(0),
    [position, setPosition] = useState<CSSProperties>({});
  const available = load ? remote : options;
  const visible = available.filter((o) =>
    `${o.label} ${o.context || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function close() {
    setOpen(false);
    anchor.current?.focus();
  }
  function start() {
    setDraft(value);
    setSearch("");
    setHighlight(0);
    setOpen(true);
  }
  function choose(id: string) {
    if (mode === "single") {
      onChange(
        [id],
        available.filter((o) => o.id === id),
      );
      close();
    } else
      setDraft((d) =>
        d.includes(id) ? d.filter((v) => v !== id) : [...d, id],
      );
  }
  useEffect(() => {
    if (!open) return;
    let active = true;
    if (load) {
      setLoading(true);
      setError("");
      const timer = setTimeout(() => {
        load(search)
          .then((r) => {
            if (active) setRemote(r);
          })
          .catch(() => {
            if (active) setError("Options could not be loaded. Try again.");
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      }, 180);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
  }, [open, search, load]);
  useEffect(() => {
    if (!open) return;
    function locate() {
      const r = anchor.current!.getBoundingClientRect(),
        vp = window.visualViewport,
        w = vp?.width || innerWidth,
        h = vp?.height || innerHeight,
        top = vp?.offsetTop || 0,
        left = vp?.offsetLeft || 0;
      const width = Math.min(Math.max(r.width, 300), w - 16),
        below = top + h - r.bottom - 12,
        above = r.top - top - 12,
        up = below < 220 && above > below;
      setPosition(
        w < 760 || h < 500
          ? {
              position: "fixed",
              width: w - 16,
              left: left + 8,
              top: top + 8,
              maxHeight: h - 16,
            }
          : {
              position: "fixed",
              width,
              left: Math.max(left + 8, Math.min(r.left, left + w - width - 8)),
              top: up ? undefined : Math.max(top + 8, r.bottom + 6),
              bottom: up ? innerHeight - r.top + 6 : undefined,
              maxHeight: Math.max(240, Math.min(420, up ? above : below)),
            },
      );
    }
    locate();
    input.current?.focus({ preventScroll: true });
    function outside(e: PointerEvent) {
      if (
        !panel.current?.contains(e.target as Node) &&
        !anchor.current?.contains(e.target as Node)
      )
        close();
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    window.visualViewport?.addEventListener("resize", locate);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
      window.visualViewport?.removeEventListener("resize", locate);
    };
  }, [open]);
  useEffect(() => {
    setHighlight(0);
  }, [search]);
  const selected = options.filter((o) => value.includes(o.id));
  return (
    <div className="picker">
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        className="picker-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : start())}
      >
        <Search size={16} aria-hidden />
        <span>
          {selected.length === 1
            ? selected[0].label
            : value.length
              ? `${label} · ${value.length}`
              : label}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {value.length > 0 && (
        <button
          type="button"
          className="picker-clear"
          aria-label={`Clear ${label}`}
          onClick={() => onChange([])}
        >
          <X size={14} />
        </button>
      )}
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={`${label} options`}
            className="picker-panel"
            style={position}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
              if (e.key === "Tab") {
                const focusable =
                  panel.current!.querySelectorAll<HTMLElement>("input,button");
                const first = focusable[0],
                  last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <div className="picker-search">
              <Search size={16} aria-hidden />
              <input
                ref={input}
                type="search"
                aria-label={`Search ${label}`}
                role="combobox"
                aria-autocomplete="list"
                aria-controls={`${id}-list`}
                aria-expanded="true"
                aria-activedescendant={
                  visible[highlight] ? `${id}-${highlight}` : undefined
                }
                placeholder={
                  label === "Search branch or client"
                    ? label
                    : `Search ${label.toLowerCase()}`
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight(
                      (h) =>
                        (h +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          visible.length) %
                        Math.max(visible.length, 1),
                    );
                  }
                  if (e.key === "Enter" && visible[highlight]) {
                    e.preventDefault();
                    choose(visible[highlight].id);
                  }
                }}
              />
            </div>
            <div
              className="picker-options"
              id={`${id}-list`}
              role="listbox"
              aria-multiselectable={mode === "multiple"}
              aria-label={label}
            >
              {loading ? (
                <p role="status">Loading authorized options…</p>
              ) : error ? (
                <p role="alert">{error}</p>
              ) : !visible.length ? (
                <p>No matching options.</p>
              ) : (
                visible.map((o, i) => (
                  <button
                    type="button"
                    id={`${id}-${i}`}
                    key={o.id}
                    role="option"
                    aria-selected={(mode === "multiple"
                      ? draft
                      : value
                    ).includes(o.id)}
                    className={i === highlight ? "highlight" : ""}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(o.id)}
                  >
                    {mode === "multiple" ? (
                      <span className="checkbox" aria-hidden>
                        {draft.includes(o.id) && <Check size={14} />}
                      </span>
                    ) : (
                      <Building2 size={18} aria-hidden />
                    )}
                    <span>
                      <strong>{o.label}</strong>
                      {o.context && <small>{o.context}</small>}
                    </span>
                    {mode === "single" && value.includes(o.id) && (
                      <Check size={16} />
                    )}
                  </button>
                ))
              )}
            </div>
            {mode === "multiple" ? (
              <div className="picker-actions">
                <small aria-live="polite">
                  {draft.length} selected · {visible.length} visible
                </small>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => [
                        ...new Set([...d, ...visible.map((o) => o.id)]),
                      ])
                    }
                  >
                    Select visible
                  </button>
                  <button type="button" onClick={() => setDraft([])}>
                    Clear
                  </button>
                </div>
                <div>
                  <button type="button" onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      onChange(draft);
                      close();
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="picker-dismiss" onClick={close}>
                Cancel
              </button>
            )}
          </div>,
          anchor.current?.closest("dialog") || document.body,
        )}
    </div>
  );
}
