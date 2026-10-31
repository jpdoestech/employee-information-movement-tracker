import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, CircleAlert, Info, LoaderCircle } from "lucide-react";

function notificationText(content: ReactNode): string {
  return Children.toArray(content)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? notificationText(child.props.children)
        : String(child),
    )
    .join("");
}

export function FloatingNotification({
  children,
  kind = "error",
  onDismiss,
}: {
  children: ReactNode;
  kind?: "error" | "notice" | "loading";
  onDismiss?: () => void;
}) {
  const message = kind + ":" + notificationText(children);
  const [dismissed, setDismissed] = useState(false);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    setDismissed(false);
    const timer = setTimeout(() => {
      setDismissed(true);
      dismiss.current?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [message]);
  if (dismissed) return null;
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
