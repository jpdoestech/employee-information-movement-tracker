import {
  useEffect,
  useCallback,
  useMemo,
  useId,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, X, type LucideIcon } from "lucide-react";
import { PickerSurface } from "./PickerSurface";

/** A bounded toolbar panel that leaves the data layout in place. */
export function Popover({
  label,
  icon: Icon,
  count = 0,
  children,
}: {
  label: string;
  icon: LucideIcon;
  count?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const id = useId(),
    anchor = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState<CSSProperties>({});
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<{
    title: string;
    back: () => void;
  } | null>(null);
  const activate = useCallback(
    (title: string, back: () => void) => setSelection({ title, back }),
    [],
  );
  const deactivate = useCallback(() => setSelection(null), []);
  const surface = useMemo(
    () => ({ target, activate, deactivate }),
    [target, activate, deactivate],
  );
  useEffect(() => {
    if (selection)
      target
        ?.querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
  }, [selection, target]);
  function close() {
    setOpen(false);
    setSelection(null);
    anchor.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    function locate() {
      const r = anchor.current!.getBoundingClientRect(),
        vp = window.visualViewport;
      const w = vp?.width || innerWidth,
        h = vp?.height || innerHeight,
        left = vp?.offsetLeft || 0,
        top = vp?.offsetTop || 0;
      const width = Math.min(460, w - 24);
      setPosition({
        position: "fixed",
        width,
        left: left + (w - width) / 2,
        top: top + h / 2,
        transform: "translateY(-50%)",
        maxHeight: h - 24,
      });
    }
    locate();
    panel.current
      ?.querySelector<HTMLElement>("button,input")
      ?.focus({ preventScroll: true });
    function outside(e: PointerEvent) {
      const target = e.target as HTMLElement;
      // Shared picker panels are portaled independently, but belong to this editor.
      if (
        !panel.current?.contains(target) &&
        !anchor.current?.contains(target) &&
        !target.closest(".picker-panel,.floating-notification")
      )
        close();
    }
    document.addEventListener("pointerdown", outside);
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    }
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    window.visualViewport?.addEventListener("resize", locate);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
      window.visualViewport?.removeEventListener("resize", locate);
    };
  }, [open]);
  return (
    <>
      <button
        ref={anchor}
        className="column-filter-toggle more-filter-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon size={15} aria-hidden />
        <span className="popover-label">{label}</span>
        {count > 0 && <span className="badge">{count}</span>}
        <ChevronDown size={13} aria-hidden />
      </button>
      {open &&
        createPortal(
          <>
            <div
              className="filter-modal-backdrop"
              aria-hidden="true"
              onClick={close}
            />
            <div
              ref={panel}
              id={id}
              role="dialog"
              aria-label={label}
              aria-modal="true"
              className="toolbar-popover filter-modal"
              style={position}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  close();
                }
                if (e.key === "Tab") {
                  const items = panel.current!.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input:not(:disabled)",
                  );
                  const visible = Array.from(items).filter(
                      (item) => item.getClientRects().length,
                    ),
                    first = visible[0],
                    last = visible[visible.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                  }
                }
              }}
            >
              <header>
                <div className="popover-heading">
                  {selection && (
                    <button
                      aria-label="Back to filters"
                      onClick={selection.back}
                    >
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  <strong>{selection?.title || label}</strong>
                </div>
                <button aria-label={`Close ${label}`} onClick={close}>
                  <X size={16} />
                </button>
              </header>
              <PickerSurface.Provider value={surface}>
                <div className="popover-root" hidden={!!selection}>
                  {typeof children === "function" ? children(close) : children}
                </div>
                <div
                  className="popover-selection"
                  ref={setTarget}
                  hidden={!selection}
                />
              </PickerSurface.Provider>
            </div>
          </>,
          anchor.current?.closest("dialog") || document.body,
        )}
    </>
  );
}
