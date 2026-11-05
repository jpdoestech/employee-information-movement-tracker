import { FloatingNotification } from "../FloatingNotification";

// Compatibility for the locally supplied address form; use shared feedback.
export function LoadingProgress({ label }: { label: string }) {
  return <FloatingNotification kind="loading">{label}</FloatingNotification>;
}
