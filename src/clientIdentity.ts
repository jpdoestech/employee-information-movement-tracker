import { useEffect, useState } from "react";
import { query } from "./api";
export type ClientIdMode = "automatic" | "manual";
export function normalizeClientId(value: string) {
  return value.trim().toUpperCase();
}
export function clientIdError(value: string) {
  return /^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(normalizeClientId(value))
    ? undefined
    : "Enter 1–64 letters, digits, hyphens, underscores, dots or slashes.";
}
export function useClientIdMode(clientId?: string, revision?: number) {
  const [state, setState] = useState<{
    client?: string;
    mode?: ClientIdMode;
    error?: string;
  }>({});
  useEffect(() => {
    let active = true;
    setState({ client: clientId });
    if (clientId)
      query<{ id_mode: ClientIdMode }>("client_settings", {
        client_id: clientId,
      })
        .then((result) => {
          if (active)
            setState({ client: clientId, mode: result.id_mode || "automatic" });
        })
        .catch((error) => {
          if (active) setState({ client: clientId, error: error.message });
        });
    return () => {
      active = false;
    };
  }, [clientId, revision]);
  return state.client === clientId ? state : { client: clientId };
}
