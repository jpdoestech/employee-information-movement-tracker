import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { confirmTransaction } from "./TransactionConfirmation";

export type EmployeeLeaveGuard = { current: (() => Promise<boolean>) | null };

export function EmployeeWorkspace({
  title,
  label,
  children,
  onClose,
  dirty,
  busy,
  leaveGuard,
}: {
  title: string;
  label: string;
  children: ReactNode;
  onClose: () => void;
  dirty: boolean;
  busy: boolean;
  leaveGuard?: EmployeeLeaveGuard;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const state = useRef({ dirty, busy });
  state.current = { dirty, busy };
  const checking = useRef(false);
  async function canLeave() {
    if (state.current.busy || checking.current) return false;
    checking.current = true;
    try {
      return (
        !state.current.dirty ||
        (await confirmTransaction(
          "Discard unsaved changes?",
          "Your changes have not been saved. Discard them to leave, or continue editing.",
          "Discard changes",
          "Continue editing",
        ))
      );
    } finally {
      checking.current = false;
    }
  }
  async function close() {
    if (await canLeave()) onClose();
  }
  useEffect(() => {
    heading.current?.focus();
    if (leaveGuard) leaveGuard.current = canLeave;
    const unload = (event: BeforeUnloadEvent) => {
      if (!state.current.dirty && !state.current.busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      if (leaveGuard) leaveGuard.current = null;
      window.removeEventListener("beforeunload", unload);
    };
  }, [leaveGuard]);
  return (
    <section
      className="employee-dialog employee-edit-dialog employee-workspace"
      role="region"
      aria-label={label}
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest("button")?.textContent?.trim() === "Cancel" &&
          !target.closest(".picker-panel")
        ) {
          event.preventDefault();
          event.stopPropagation();
          void close();
        }
      }}
    >
      <header className="employee-workspace-heading">
        <button
          type="button"
          disabled={busy}
          onClick={() => void close()}
          aria-label="Back to Employees"
        >
          <ArrowLeft size={16} aria-hidden />
          <span>
            Back<span className="employee-back-long"> to Employees</span>
          </span>
        </button>
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}
