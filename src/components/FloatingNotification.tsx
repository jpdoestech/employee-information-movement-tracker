import type { ReactNode } from "react";
import { X, CircleAlert, Info, LoaderCircle } from "lucide-react";

export function FloatingNotification({
  children,
  kind = "error",
  onDismiss,
}: {
  children: ReactNode;
  kind?: "error" | "notice" | "loading";
  onDismiss?: () => void;
}) {
  const Icon =
    kind === "error" ? CircleAlert : kind === "loading" ? LoaderCircle : Info;
  return (
    <div
      className={`floating-notification ${kind}${kind === "loading" ? " loading-line" : ""}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon
        className={kind === "loading" ? "notification-spinner" : ""}
        size={18}
        aria-hidden
      />
      <div className="notification-content">{children}</div>
      {onDismiss && (
        <button aria-label={`Dismiss ${kind}`} onClick={onDismiss}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
