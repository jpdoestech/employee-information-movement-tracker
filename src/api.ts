import { createClient } from "@supabase/supabase-js";
import { demoQuery, demoMutate } from "./demo";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const elevatedKey = key?.startsWith("eyJ")
  ? (() => {
      try {
        return JSON.parse(atob(key.split(".")[1])).role === "service_role";
      } catch {
        return false;
      }
    })()
  : false;
if (elevatedKey || (key && /service_role|sb_secret_/.test(key)))
  throw new Error("A public publishable key is required");
export const supabase = url && key ? createClient(url, key) : null;
let demo = import.meta.env.VITE_DEMO_MODE === "true";
export const isDemo = () => demo;
export const enableDemo = () => {
  demo = true;
};
export async function query<T = any>(
  operation: string,
  q: unknown = {},
): Promise<T> {
  if (demo) return demoQuery(operation, q) as T;
  if (!supabase)
    throw new Error("Configure this application’s Supabase connection.");
  const special =
    operation === "effective_permissions"
      ? "permission_preview"
      : operation === "export"
        ? "export_employees"
        : operation === "field_scope_preview"
          ? "field_scope_preview"
          : operation === "target_fields"
            ? "target_fields"
            : null;
  const { data, error } = await supabase.rpc(
    special || "tracker_query",
    special ? { q } : { operation, q },
  );
  if (error) throw new Error(error.message);
  return data as T;
}
export async function preview(operation: string, p: unknown) {
  if (demo) return { valid: true };
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("transaction_preview", {
    operation,
    p,
  });
  if (error) throw new Error(error.message);
  return data;
}
const pendingRequests = new Map<string, string>();
export async function mutate<T = any>(
  operation: string,
  p: unknown,
  requestId?: string,
): Promise<T> {
  if (demo) return demoMutate(operation, p) as T;
  if (!supabase) throw new Error("Supabase is not configured.");
  const fingerprint = operation + JSON.stringify(p);
  const id =
    requestId || pendingRequests.get(fingerprint) || crypto.randomUUID();
  pendingRequests.set(fingerprint, id);
  const { data, error } = await supabase.rpc("tracker_mutate", {
    operation,
    p,
    request_id: id,
  });
  if (error)
    throw new Error(
      error.code === "23505"
        ? operation === "field" || operation === "group"
          ? "This name or machine key already exists, including inactive definitions. Reuse, expand applicability or reactivate the existing definition."
          : "This code or name is already in use. Review existing records."
        : error.message,
    );
  setTimeout(() => {
    if (pendingRequests.get(fingerprint) === id)
      pendingRequests.delete(fingerprint);
  }, 5000);
  return data as T;
}
