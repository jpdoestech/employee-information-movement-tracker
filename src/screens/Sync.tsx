import { Dialog } from "../components/Dialog";
import { requireConfirmation } from "../components/TransactionConfirmation";
import { FloatingNotification } from "../components/FloatingNotification";
import { useEffect, useState } from "react";
import { isDemo, mutate, query, supabase } from "../api";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import type { Context, Option } from "../domain";
import { refreshContext } from "../refreshContext";
export function Sync({
  context,
  options,
  onSaved,
  refreshKey,
}: {
  context: Context;
  options: Option[];
  onSaved: () => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [book, setBook] = useState<any>(),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const stop = refreshContext(async () => {
      try {
        const result = await query("sync");
        if (active) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (active) {
          setData(undefined);
          setError((e as Error).message);
        }
      }
    });
    return () => {
      active = false;
      stop();
    };
  }, [context.revision, refreshKey]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading page-action-heading">
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await mutate("sync_now", {});
            })
          }
        >
          Reconcile approved workbooks
        </button>
      </div>
      <div className="notice">
        <strong>
          {data?.connected
            ? "Google connection configured"
            : "Google account not connected"}
        </strong>
        <p>
          {data?.pending || 0} pending events. Saves to Supabase continue during
          Google outages.
        </p>
        <button
          disabled={busy || isDemo()}
          onClick={() =>
            run(async () => {
              await requireConfirmation(
                "Connect Google account",
                "Continue to Google to authorize this account connection?",
              );
              if (!supabase) throw new Error("Configure Supabase first");
              const { data, error } = await supabase.functions.invoke(
                "google-oauth",
                { body: { action: "start" } },
              );
              if (error) throw error;
              window.open(
                data.url,
                "google-oauth",
                "popup,width=600,height=760",
              );
            })
          }
        >
          Connect personal Google account
        </button>
        <small>
          OAuth refresh tokens remain encrypted in the backend. Workbook
          policies and actual Drive sharing must both be approved.
        </small>
      </div>
      <div className="organization-grid">
        {(data?.workbooks || []).map((b: any) => (
          <article className="panel" key={b.id}>
            <h3>
              {options.find((o) => o.id === b.branch_id)?.label ||
                "Head Office"}
            </h3>
            <span className="badge">{b.status}</span>
            <p>Last successful sync: {b.last_success || "Never"}</p>
            <p>
              {b.approved
                ? "Export policy approved"
                : "Suspended until explicit policy approval"}
            </p>
            <button
              onClick={() => {
                setBook(structuredClone(b));
                setReason("");
              }}
            >
              Review export policy
            </button>
          </article>
        ))}
      </div>
      {!data?.workbooks?.length && (
        <div className="empty">
          Workbooks are provisioned by the backend after branches are configured
          and export policies approved.
        </div>
      )}
      {book && (
        <Dialog
          title="Workbook export policy"
          onClose={() => setBook(undefined)}
        >
          <div className="dialog-body">
            <SearchFilterPicker
              mode="multiple"
              label="Approved non-sensitive columns"
              options={context.fields
                .filter((f) => f.active && f.sensitivity === "normal")
                .map((f) => ({
                  id: f.key,
                  label: f.label,
                  context: f.group_name,
                }))}
              value={book.allowed_fields}
              onChange={(v) => setBook({ ...book, allowed_fields: v })}
            />
            <SearchFilterPicker
              mode="multiple"
              label="Approved client rows"
              options={options.filter(
                (o) => o.kind === "client" && o.branch_id === book.branch_id,
              )}
              value={book.allowed_clients}
              onChange={(v) => setBook({ ...book, allowed_clients: v })}
            />
            <label>
              <input
                type="checkbox"
                checked={book.include_branch}
                onChange={(e) =>
                  setBook({ ...book, include_branch: e.target.checked })
                }
              />
              Include primary employees directly assigned to this branch / Head
              Office
            </label>
            <label>
              Approved sharing emails (one per line)
              <textarea
                value={book.sharing_emails.join("\n")}
                onChange={(e) =>
                  setBook({
                    ...book,
                    sharing_emails: e.target.value
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={book.approved}
                onChange={(e) =>
                  setBook({ ...book, approved: e.target.checked })
                }
              />
              I approve these rows, fields, stable IDs, revision/date metadata
              and Drive sharing for all four managed tabs
            </label>
            <label>
              Policy reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <footer>
            <button onClick={() => setBook(undefined)}>Cancel</button>
            <button
              disabled={busy || !reason}
              className="primary"
              onClick={() =>
                run(async () => {
                  await mutate("workbook", { ...book, reason });
                  setBook(undefined);
                })
              }
            >
              Save export policy
            </button>
          </footer>
          {error && (
            <FloatingNotification onDismiss={() => setError("")}>
              {error}
            </FloatingNotification>
          )}
        </Dialog>
      )}
      {error && !book && (
        <FloatingNotification onDismiss={() => setError("")}>
          {error}
        </FloatingNotification>
      )}
    </>
  );
}
