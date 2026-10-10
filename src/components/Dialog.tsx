import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current!.showModal();
    return () => before?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <small>EMPLOYEE TRACKER</small>
          <h2>{title}</h2>
        </div>
        <button type="button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
