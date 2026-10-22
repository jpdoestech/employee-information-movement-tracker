import { createClient } from "@supabase/supabase-js";
import { demoQuery, demoMutate, demoIdentityPreview } from "./demo";
import { requireConfirmation } from "./components/TransactionConfirmation";
import { trackTransaction } from "./transactions";
import type { Option } from "./domain";
import type { AccessImpact } from "./accessReview";
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
    throw new Error(
      "The application connection is unavailable. Contact your administrator.",
    );
  const special = [
    "client_settings",
    "filter_values",
    "employee_duplicates",
  ].includes(operation)
    ? operation
    : operation === "record_page"
      ? "record_page"
      : operation === "effective_permissions"
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
  if (operation === "context") {
    const settings = await supabase.rpc("register_settings");
    if (settings.error) throw new Error(settings.error.message);
    return { ...data, register_settings: settings.data } as T;
  }
  return data as T;
}
export async function preview(operation: string, p: unknown) {
  if (demo) {
    if (operation === "movement") demoIdentityPreview(p);
    return { valid: true };
  }
  if (!supabase) throw new Error("The application connection is unavailable.");
  return trackTransaction("Validating transaction", async () => {
    const { data, error } = await supabase!.rpc("transaction_preview", {
      operation,
      p,
    });
    if (error) throw new Error(error.message);
    return data;
  });
}
export async function reviewAccessChange(operation: string, p: unknown): Promise<AccessImpact> {
  if (demo) return { demo: true, revision: null, targets: [], changes: [] };
  if (!supabase) throw new Error("The application connection is unavailable.");
  return trackTransaction("Reviewing access changes", async () => {
    const { data, error } = await supabase!.rpc("access_change_preview", { operation, p });
    if (error) throw new Error(error.message);
    return data;
  });
}
export async function organizationOptions(): Promise<Option[]> {
  const options: Option[] = [];
  let page: Option[];
  do {
    page = await query<Option[]>("options", { offset: options.length });
    options.push(...page);
  } while (page.length === 100);
  return options;
}
const pendingRequests = new Map<string, string>();
export async function createAccount(p: {
  email: string;
  display_name: string;
  password: string;
  role: string;
  reason: string;
}): Promise<{ id: string }> {
  await requireConfirmation(
    "Create user account",
    "Create this sign-in account and enroll its selected role? Review the email and role before continuing.",
  );
  return trackTransaction("Creating user account", async () => {
    if (demo) {
      const id = crypto.randomUUID();
      await demoMutate("profile", {
        id,
        display_name: p.display_name,
        role: p.role,
        active: true,
        reason: p.reason,
      });
      return { id };
    }
    if (!supabase)
      throw new Error("The application connection is unavailable.");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(p)),
    );
    const fingerprint =
      "account:" +
      Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");
    // shortcut: retry IDs live in memory; keep this draft open after an enrollment error.
    const id = pendingRequests.get(fingerprint) || crypto.randomUUID();
    pendingRequests.set(fingerprint, id);
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: { ...p, request_id: id },
    });
    if (error) {
      const details =
        error.context instanceof Response
          ? await error.context.json().catch(() => null)
          : null;
      throw new Error(
        typeof details?.error === "string"
          ? details.error
          : "Account creation failed. Your entries are preserved; try again.",
      );
    }
    pendingRequests.delete(fingerprint);
    return data;
  });
}
export async function mutate<T = any>(
  operation: string,
  p: unknown,
  requestId?: string,
  confirmed = false,
): Promise<T> {
  const labels: Record<string, string> = {
    employee_create: "Create employee",
    employee_update: "Save employee changes",
    employee_delete: "Archive employee",
    bulk_update: "Update selected employees",
    movement: "Record movement",
    void_movement: "Void or correct movement",
    organization: "Save organization",
    field: "Save field definition",
    group: "Save field group",
    form_layout: "Save employee form tabs",
    save_view: "Save personal view",
    register_settings: "Save register display policy",
    client_settings: "Save client entry settings",
    scope: "Change access scope",
    policy: "Change access policy",
    policy_batch: "Change access policy",
    profile: "Change user account",
    capability: "Change user capability",
    workbook: "Change workbook settings",
    sync_now: "Reconcile workbooks",
  };
  if (!confirmed) {
    await requireConfirmation(
      labels[operation] || "Confirm changes",
      "Continue with this transaction? Review your entries before saving.",
    );
  }
  return trackTransaction(labels[operation] || "Saving changes", async () => {
    if (demo) return demoMutate(operation, p) as T;
    if (!supabase)
      throw new Error("The application connection is unavailable.");
    const fingerprint = operation + JSON.stringify(p);
    const id =
      requestId || pendingRequests.get(fingerprint) || crypto.randomUUID();
    pendingRequests.set(fingerprint, id);
    const { data, error } =
      operation === "client_settings"
        ? await supabase.rpc("set_client_settings", { p, request_id: id })
        : operation === "register_settings"
          ? await supabase.rpc("set_register_settings", { p, request_id: id })
          : await supabase.rpc("tracker_mutate", {
              operation,
              p,
              request_id: id,
            });
    if (error)
      throw new Error(
        error.code === "23505" &&
          !/must have a unique value|Cannot enable uniqueness/.test(
            error.message,
          )
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
  });
}
