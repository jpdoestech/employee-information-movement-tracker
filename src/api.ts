import { createClient } from "@supabase/supabase-js";
import { demoQuery, demoMutate, demoIdentityPreview, demoImport } from "./demo";
import { requireConfirmation } from "./components/TransactionConfirmation";
import { trackTransaction } from "./transactions";
import { normalizeInputs } from "./inputNormalization";
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
  if (operation === "employee_duplicates") q = normalizeInputs(q);
  if (demo) return demoQuery(operation, q) as T;
  if (!supabase)
    throw new Error(
      "The application connection is unavailable. Contact your administrator.",
    );
  const special = [
    "client_settings",
    "quick_filter_settings",
    "filter_values",
    "employee_duplicates",
    "access_configuration",
    "staffing_options",
    "effective_access",
    "preview_employee_purge",
  ].includes(operation)
    ? operation
    : operation === "record_page"
      ? (q as { kind?: string }).kind === "staffing"
        ? "staffing_page"
        : "record_page"
      : operation === "effective_permissions"
        ? "permission_preview"
        : operation === "export"
          ? "export_employees"
          : operation === "field_scope_preview"
            ? "field_scope_preview"
            : operation === "target_fields"
              ? "target_fields"
              : null;
  const response = supabase.rpc(
    special || "tracker_query",
    special ? { q } : { operation, q },
  );
  const [result, settings] = await Promise.all([
    response,
    operation === "context" ? supabase.rpc("register_settings") : null,
  ]);
  const { data, error } = result;
  if (error) throw new Error(error.message);
  if (operation === "context") {
    if (settings?.error) throw new Error(settings.error.message);
    return { ...data, register_settings: settings?.data } as T;
  }
  return data as T;
}
export async function preview(operation: string, p: unknown) {
  p = normalizeInputs(p);
  if (demo) {
    if (operation === "employee_import") return demoImport(p, true);
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
export async function reviewAccessChange(
  operation: string,
  p: unknown,
): Promise<AccessImpact> {
  p = normalizeInputs(p);
  if (demo) return { demo: true, revision: null, targets: [], changes: [] };
  if (!supabase) throw new Error("The application connection is unavailable.");
  return trackTransaction("Reviewing access changes", async () => {
    const { data, error } = await supabase!.rpc("access_change_preview", {
      operation,
      p,
    });
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
  p = normalizeInputs(p);
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
    return invokeAccountChange(p, "account");
  });
}
export async function setAccountPassword(
  p: { user_id: string; password: string; reason: string },
  name: string,
): Promise<{ id: string }> {
  p = normalizeInputs(p);
  await requireConfirmation(
    "Set account password",
    `Set a new password for ${name}? Their role, account status and permissions will stay the same.`,
  );
  return trackTransaction("Setting password", async () => {
    if (demo) return { id: p.user_id };
    return invokeAccountChange({ ...p, action: "set_password" }, "password");
  });
}
async function invokeAccountChange(
  p: object,
  namespace: string,
): Promise<{ id: string }> {
  if (!supabase) throw new Error("The application connection is unavailable.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(p)),
  );
  const fingerprint =
    namespace +
    ":" +
    Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
  // shortcut: retry IDs live in memory; keep this draft open after an interrupted account change.
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
        : "The account change failed. Your entries are preserved; try again.",
    );
  }
  pendingRequests.delete(fingerprint);
  return data;
}

export async function mutate<T = any>(
  operation: string,
  p: unknown,
  requestId?: string,
  confirmed = false,
): Promise<T> {
  p = normalizeInputs(p);
  const labels: Record<string, string> = {
    employee_create: "Create employee",
    employee_import: "Import employees",
    employee_update: "Save employee changes",
    employee_delete: "Archive employee",
    employee_purge: "Permanently delete employee data",
    bulk_update: "Update selected employees",
    movement: "Record movement",
    void_movement: "Void or correct movement",
    organization: "Save organization",
    staffing_requisition: "Save staffing PRF",
    job_choices: "Save official job choices",
    field: "Save field definition",
    group: "Save field group",
    form_layout: "Save employee form tabs",
    save_view: "Save personal view",
    personal_view: "Save personal view",
    register_settings: "Save register display policy",
    register_view: "Save managed column view",
    client_settings: "Save client entry settings",
    quick_filters: "Save user quick filters",
    scope: "Change access scope",
    policy: "Change access policy",
    policy_batch: "Change access policy",
    access_matrix: "Save access changes",
    access_role: "Create access role",
    profile: "Change user account",
    capability: "Change user capability",
    workbook: "Change workbook settings",
    sync_now: "Reconcile workbooks",
  };
  if (!confirmed) {
    await requireConfirmation(
      labels[operation] || "Confirm changes",
      operation === "employee_purge"
        ? `${(p as { confirmation: string }).confirmation}. Permanently delete the reviewed employee records and their full history? This cannot be undone in the app.`
        : "Continue with this transaction? Review your entries before saving.",
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
      operation === "employee_purge"
        ? await supabase.rpc("hard_delete_employees", { p, request_id: id })
        : operation === "staffing_requisition" || operation === "job_choices"
        ? await supabase.rpc(
            operation === "job_choices"
              ? "set_job_choices"
              : "set_staffing_requisition",
            { p, request_id: id },
          )
        : operation === "personal_view"
          ? await supabase.rpc("save_personal_view", { p, request_id: id })
          : operation === "register_view"
            ? await supabase.rpc("set_register_view", { p, request_id: id })
            : operation === "quick_filters"
              ? await supabase.rpc("set_quick_filters", { p, request_id: id })
              : operation === "client_settings"
                ? await supabase.rpc("set_client_settings", {
                    p,
                    request_id: id,
                  })
                : operation === "register_settings"
                  ? await supabase.rpc("set_register_settings", {
                      p,
                      request_id: id,
                    })
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
