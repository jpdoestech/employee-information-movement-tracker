import { useEffect, useRef, useState } from "react";
import { ArrowLeft, TriangleAlert, Trash2, X } from "lucide-react";

type Request = {
  title: string;
  message: string;
  action: string;
  cancelLabel: string;
  resolve: (confirmed: boolean) => void;
};
let publish: ((request: Request) => void) | undefined;
const queue: Request[] = [];
export function confirmTransaction(
  title: string,
  message: string,
  action = "Continue",
  cancelLabel = "Cancel",
): Promise<boolean> {
  return new Promise((resolve) => {
    const request = { title, message, action, cancelLabel, resolve };
    if (publish) publish(request);
    else queue.push(request);
  });
}
export async function requireConfirmation(title: string, message: string) {
  if (!(await confirmTransaction(title, message))) throw new Error("");
}
export function TransactionConfirmation() {
  const [requests, setRequests] = useState<Request[]>([]),
    ref = useRef<HTMLDialogElement>(null);
  const request = requests[0];
  const discard = request?.action === "Discard changes";
  useEffect(() => {
    publish = (r) => setRequests((items) => [...items, r]);
    queue.splice(0).forEach(publish);
    return () => {
      publish = undefined;
    };
  }, []);
  useEffect(() => {
    if (!request) return;
    const before = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      if (before?.isConnected) before.focus();
    };
  }, [request]);
  function finish(value: boolean) {
    request.resolve(value);
    setRequests((items) => items.slice(1));
  }
  return request ? (
    <dialog
      ref={ref}
      className={`transaction-confirmation${discard ? " discard-confirmation" : ""}`}
      aria-label={request.title}
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
    >
      <header>
        {discard && (
          <TriangleAlert
            size={18}
            className="confirmation-warning"
            aria-hidden
          />
        )}
        <h2>{request.title}</h2>
        <button aria-label="Close confirmation" onClick={() => finish(false)}>
          <X size={18} />
        </button>
      </header>
      <div className="dialog-body">
        <p>{request.message}</p>
      </div>
      <footer>
        <button autoFocus onClick={() => finish(false)}>
          {discard && <ArrowLeft size={16} aria-hidden />}
          {request.cancelLabel}
        </button>
        <button
          className={discard ? "danger" : "primary"}
          onClick={() => finish(true)}
        >
          {discard && <Trash2 size={16} aria-hidden />}
          {request.action}
        </button>
      </footer>
    </dialog>
  ) : null;
}
