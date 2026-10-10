import { useEffect, useState } from "react";
import { isDemo, mutate, query, supabase } from "../api";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import type { Context, Option } from "../domain";
export function Sync({
  context,
  options,
  onSaved,
}: {
  context: Context;
  options: Option[];
  onSaved: () => void;
}) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [book, setBook] = useState<any>(),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    query("sync")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [context.revision]);
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
      <div className="section-heading">
        <div>
          <h2>Google Sheets sync</h2>
          <p>
            Branch-specific secondary projections. Supabase is the authoritative
            database.
          </p>
        </div>
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
        <section className="panel">
          <h3>Workbook export policy</h3>
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
              onChange={(e) => setBook({ ...book, approved: e.target.checked })}
            />
            I approve these rows, fields, stable IDs, revision/date metadata and
            Drive sharing for all four managed tabs
          </label>
          <label>
            Policy reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
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
          <button onClick={() => setBook(undefined)}>Cancel</button>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
