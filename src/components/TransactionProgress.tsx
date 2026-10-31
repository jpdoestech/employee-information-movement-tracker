import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { pendingTransactions, subscribeTransactions } from "../transactions";
import { FloatingNotification } from "./FloatingNotification";

export function TransactionProgress() {
  const [pending, setPending] = useState(pendingTransactions),
    [now, setNow] = useState(Date.now);
  useEffect(() => subscribeTransactions(setPending), []);
  useEffect(() => {
    if (!pending.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [pending.length]);
  if (!pending.length || now - pending[0].startedAt < 600) return null;
  const dialogs = Array.from(
    document.querySelectorAll<HTMLDialogElement>(
      "dialog[open]:not(.transaction-confirmation)",
    ),
  );
  const host = dialogs.at(-1) || document.body;
  return createPortal(
    <FloatingNotification kind="loading">
      <strong>
        {pending.length > 1
          ? `Processing ${pending.length} transactions…`
          : `${pending[0].label}…`}
      </strong>
      {now - pending[0].startedAt >= 8000 && (
        <small>
          Still processing. Keep this window open; no additional submission is
          needed.
        </small>
      )}
    </FloatingNotification>,
    host,
  );
}
