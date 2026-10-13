import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { confirmTransaction } from "./TransactionConfirmation";
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  className = "",
  isDirty,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  isDirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false),
    closing = useRef(false);
  async function close() {
    if (closing.current) return;
    closing.current = true;
    if (
      !(isDirty ?? dirty.current) ||
      (await confirmTransaction(
        "Discard unsaved changes?",
        "Your changes have not been saved. Discard them to leave, or continue editing.",
        "Discard changes",
        "Continue editing",
      ))
    )
      onClose();
    closing.current = false;
  }
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current!.showModal();
    return () => before?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={["app-dialog", wide ? "wide" : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      onChangeCapture={() => {
        dirty.current = true;
      }}
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[role="option"]')) dirty.current = true;
        const button = target.closest("button");
        if (
          button &&
          (/^(Move |Pin |Clear )/.test(
            button.getAttribute("aria-label") || "",
          ) ||
            button.textContent?.trim() === "Reset")
        )
          dirty.current = true;
        if (
          button?.textContent?.trim() === "Cancel" &&
          !target.closest(".picker-panel")
        ) {
          e.preventDefault();
          e.stopPropagation();
          void close();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        void close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={() => void close()}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
