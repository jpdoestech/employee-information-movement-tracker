import { Dialog } from "../components/Dialog";
import { FloatingNotification } from "../components/FloatingNotification";
import { useEffect, useState } from "react";
import { mutate, query } from "../api";
import { SearchFilterPicker } from "../components/SearchFilterPicker";
import type { Context, Option } from "../domain";
import { refreshContext } from "../refreshContext";
import { googleSpreadsheetId } from "../googleSheets";
import { formatDateTime } from "../dateTime";
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
          {!data
            ? error
              ? "Sync status unavailable"
              : "Loading sync status…"
            : data.connected
              ? "Google connection configured"
              : "Google account not connected"}
        </strong>
        {data && (
          <p>
            {data.pending || 0} pending events. Changes can still be saved
            during Google outages.
          </p>
        )}
        <p>
          For Apps Script setup, the workbook owner runs setupTrackerSync once
          in the Google Apps Script editor. Its five-minute trigger processes
          approved workbooks; Reconcile queues a refresh for the next run.
        </p>
        <small>
          Apps Script tokens are short-lived and are never stored. Workbook
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
            <p>
              Last successful sync:{" "}
              {b.last_success ? (
                <time dateTime={b.last_success} title={b.last_success}>
                  {formatDateTime(b.last_success)} (Asia/Manila)
                </time>
              ) : (
                "Never"
              )}
            </p>
            {b.last_error && ["Failed", "Suspended"].includes(b.status) && (
              <p role="status">{b.last_error}</p>
            )}
            <p>
              {b.approved
                ? "Export policy approved"
                : "Suspended until explicit policy approval"}
            </p>
            <button
              disabled={busy}
              onClick={() => {
                setBook({
                  ...structuredClone(b),
                  target_spreadsheet_id: b.spreadsheet_id || "",
                });
                setReason("");
              }}
            >
              Review export policy
            </button>
          </article>
        ))}
      </div>
      {data && !data.workbooks?.length && (
        <div className="empty">
          Workbooks are provisioned by the backend after branches are configured
          and export policies approved.
        </div>
      )}
      {book && (
        <Dialog
          title="Workbook export policy"
          onClose={() => setBook(undefined)}
          closeDisabled={busy}
        >
          <div className="dialog-body">
            <label>
              Google Sheets URL or spreadsheet ID
              <input
                value={book.target_spreadsheet_id}
                disabled={busy || Boolean(book.spreadsheet_id)}
                placeholder="Leave blank to create a new spreadsheet"
                onChange={(e) =>
                  setBook({ ...book, target_spreadsheet_id: e.target.value })
                }
              />
              <small>
                Use a spreadsheet owned by the connected Google account, or
                leave blank to create one. Sync replaces Employees_Current,
                Assignments_Current, Movement_History and Sync_Metadata; other
                tabs and your spreadsheet title are preserved. Saved
                destinations stay fixed to prevent stale copies.
              </small>
            </label>
            <SearchFilterPicker
              mode="multiple"
              label="Approved non-sensitive columns"
              disabled={busy}
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
              disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <footer>
            <button onClick={() => setBook(undefined)}>Cancel</button>
            <button
              disabled={busy || !reason.trim()}
              className="primary"
              onClick={() =>
                run(async () => {
                  await mutate("workbook", {
                    ...book,
                    target_spreadsheet_id: googleSpreadsheetId(
                      book.target_spreadsheet_id,
                    ),
                    reason,
                  });
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
