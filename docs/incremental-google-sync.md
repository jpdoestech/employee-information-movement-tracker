# Incremental Google Sheets synchronization

Normal employee events now project only their affected employee UUIDs, up to 200
per claimed outbox batch. The worker reads managed headers and the two identity
columns in each managed tab, then fetches current values only for affected rows.
Matching uses UUIDs, not names, row numbers or mutable labels. A normal edit
updates that employee's approved row and relevant assignment/movement rows.
Unchanged values are skipped, and retrying a committed append finds its existing
UUID instead of appending another copy. Source/destination transfer routes and
archival events remove records that no longer belong in an approved roster.

Database commits, audit/outbox atomicity, approvals, field applicability, stable
branch workbook mappings, Google ownership/sharing checks and one-way authority
remain unchanged. Every external batch rechecks the live lease and schema/policy
publication guard. Only fixed managed tabs are touched. Employee edits outside
the affected set wait for their own event; Google edits never update Supabase.

## Initial setup, schema changes and repair

Migration `20261028040000_incremental_sheet_sync.sql` adds backend-only progress
containing UUIDs, cursor positions, policy/schema signatures and an active flag.
It stores no employee values and grants no client access. Apply it before
deploying the updated `sheets-worker`; no new services, secrets, Vercel Functions
or Apps Script code are needed. Existing legacy snapshot callers keep their old
1,000-row guard, while the worker uses new 200-record delta/keyset operations.

Initial setup, an approved schema/column-policy change, duplicate IDs, changed
headers or explicit Reconcile starts a rebuild. Managed cells are reset when
their old schema or policy cannot be safely retained, then filled in bounded
pages. `Syncing` and the hidden metadata indicate that rows may be incomplete.
Up to four 200-record pages per workbook are processed per call, with a deadline
margin. Large rebuilds can span five-minute triggers. Continuations release the
lease without increasing failed-attempt counts; they are not write retries.
Completed workbook/batch markers avoid revisiting healthy workbooks when another
scope fails or the run is deferred. Employee events are still processed even
when their revision is below a later completed batch, preventing delayed older
events from being silently skipped.

Progress advances only after the external write succeeds. A crash or lost reply
leaves the previous cursor; a subsequent attempt re-reads Google IDs/current rows
and safely resumes. New employee changes claimed during a rebuild are also
applied and included in its seen-ID set, even when their UUID sorts before the
cursor. At completion, records outside the rebuilt roster are removed.

The existing Manila date reconciliation remains necessary for future-dated
assignments, age and daily Length of Service values. It scans bounded pages and
compares current values, writing only rows whose displayed data changed. Unlike
explicit repair or policy/schema changes, an ordinary calendar pass retains the
existing managed cells while it progresses.

Manual sorting between runs is supported by fresh ID lookups. Avoid editing or
sorting managed tabs while a write is in progress: Google does not provide a
transaction covering a read and a later write. Use separate tabs for independent
notes/formulas, and Reconcile to repair manual changes or missing rows outside
the affected employee set.

## Free-tier resource budget

The frontend stays static; sync uses no Vercel Functions or Vercel Cron. A
five-minute Apps Script trigger makes 288 worker calls per day, approximately
8,640 in 30 days. An idle call performs an indexed due-work check and skips
Google authorization/API requests. The timer alone is below Supabase's current
500,000 included monthly Edge invocations, but all application usage shares its
database, CPU and egress allowances. Source: [Supabase pricing](https://supabase.com/pricing).

Runs use a 100-second worker deadline with a 25-second page-start margin;
projection pages and delta employee sets contain at most 200 IDs. Request bodies
above 1.8 MB fail safely before being sent. These bounds are below Google's
recommended 2 MB payload and leave margin under Supabase Free's 150-second wall
clock limit. Supabase also limits each Edge request to two seconds of CPU and
256 MB memory; actual production load still needs monitoring.
Sources: [Edge limits](https://supabase.com/docs/guides/functions/limits),
[Sheets API limits](https://developers.google.com/workspace/sheets/api/limits).

Google currently allows 60 read and 60 write Sheets requests per minute per user
per project. This worker batches rows, runs sequentially and defers before
exceeding 40 Sheets reads or 40 writes in one invocation. Those per-run budgets
do not reserve capacity against other scripts or closely spaced manual runs;
Google's actual quota/backoff remains authoritative. Consumer Apps Script triggers
have 90 minutes total runtime per day and 20,000 URL Fetch calls per day. A
five-minute trigger leaves an average of 18.75 seconds per invocation within that
runtime allowance. Idle/ordinary runs should be short, but a continuously busy
queue or repeated large rebuilds can exhaust it; do not repeatedly invoke manual
sync to bypass backoff. Source: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

Free operation is a workload target, not an unlimited-capacity guarantee. Monitor
Supabase database size/egress, outbox growth, execution duration and Google quota
errors. No plan upgrades or paid services are introduced. Vercel Hobby itself is
restricted to personal, non-commercial use, so a business employee system needs
hosting eligibility reviewed independently of its traffic.
Source: [Vercel Hobby](https://vercel.com/docs/plans/hobby).

## Verification and rollback

Focused native PostgreSQL checks create 3,000 synthetic employees with 50 approved
fields, traverse 16 keyset pages, verify scoped delta/removal projections, enforce
200-ID bounds, and reject stale cursors, revoked approval, expired leases and raw
client access. The local traversal took about nine seconds including fixture
preparation/other checks, rising to about 41 seconds with concurrent local checks;
neither is a hosted throughput guarantee. Unit transport
tests rebuild 3,000 rows across bounded invocations, update one of 3,000 records
without a full clear, survive a lost commit response, respect sorted UUID rows,
retain concurrent edits behind a rebuild cursor and recheck publication approval.

Retain this additive migration on rollback. An older worker can still use the
unchanged legacy snapshot operation for small workbooks. Stop owner triggers
before a rollback while a rebuild is active; that older worker cannot resume the
new progress table and retains its 1,000-row snapshot limit. Supabase employee
records and audit history never depend on Google availability.

## Hosted rollout on 2026-10-28

Applied migration `20261028040000_incremental_sheet_sync.sql` to tracker project
`kynbaulanxfuivnxyxjk` and deployed `sheets-worker` version 3. Hosted database lint
reported no errors. A secret-authenticated idle request returned 200 without
contacting Google or claiming work; an unauthenticated request returned 401.
Read-only hosted checks verified empty deltas return no employees, bounded pages
return the existing 1/1/2 authorized roster counts, the service role retains the
worker grant, browser roles remain denied and private progress has RLS enabled.
The four production employee records were preserved. No employee edits, forced
reconciliation, paid plan changes or Vercel deployments were performed for this
rollout. Existing Apps Script code, timer, secrets and spreadsheet IDs remain valid.

Validation passed: production build, Deno checks, 169 unit tests and the full
157-check native database suite. Historical migration replay now targets the
preserved normalization dispatcher behind the workbook wrapper, and calculated
column tests search their own fixtures instead of assuming a random UUID appears
on the first page of the full-suite dataset. These changes affect tests only.

The previous deployed worker source was saved under the ignored
`.test-db/reports/verification/worker-before-incremental/` for rollback. Source
hashes and bounded deployment checks are recorded in
`.test-db/reports/verification/incremental-sync-deployment.json`. Actual Google
write recovery and a 3,000-record hosted Google round trip remain unverified;
the large dataset and interrupted writes were exercised synthetically. The next
real employee change will initialize that workbook's baseline if necessary.
