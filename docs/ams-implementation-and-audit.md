# AMS presentation and audit fixes

The tracker uses the supplied read-only AMS reference for presentation. Its
processes remain owned by the existing React controls and secured PostgreSQL
functions. No reference repository or AMS snapshot was changed.

## Presentation

- Shared light/dark tokens match the AMS reference. System follows OS changes;
  explicit preferences persist before first paint in tracker-specific keys.
- Desktop navigation supports a compact 60px rail and an expanded labelled
  sidebar. Mobile navigation keeps labels, a close action, focus containment and
  Escape dismissal. Breadcrumbs retain existing routes.
- Dialogs use compact shared chrome and bounded widths (normally 680px, 880px
  employee forms, 960px table settings). Closing nested confirmations restores
  focus after dialog teardown. Draft, save and discard semantics are retained.
- The installed Segoe/Aptos stacks, fixed typography scale, 36px desktop/50px
  touch rows, stationary pagination and internal data scrolling are preserved.
- No new dependency, font download, applied-filter chip row or unrelated
  business feature was added. The unused ColumnFilters component was removed;
  current direct filters and client settings remain available.

## Integrity fixes

Apply `20261016000100_audit_integrity_fixes.sql` before the dependent frontend:

- Omitted/null field sensitivity and applicability retain their existing values;
  changing a restricted field to normal still requires superadmin authority.
- Direct status changes and ordinary/bulk employment edits enforce non-active
  required data. Configured separation choices replace the old fixed list.
  Unrelated edits to legacy records do not require backfilling employment data.
- Same-day initial placement can be closed when creating a non-active employee;
  void restores it. Official department-event reversal restores the prior value
  and refuses to overwrite a subsequent correction.
- Each workbook failure is isolated so other approved workbooks continue.
  Lease fencing, bounded execution, retry/backoff, sharing approval and revision
  skipping remain enforced; successful workbooks are not rewritten on retry.

## Pagination, loading and resource use

Apply `20261017000100_projection_cost.sql` next:

- Employee projection retains a typed employee row once instead of rebuilding
  it from JSON for every field. Scope and field authorization still run before
  search, sort, counts, pagination and export. No authorization cache was added.
- Export shares that exact filter/order implementation and projects once,
  instead of repeating the entire projection for each 100 rows. Public pages
  still accept only 10/25/50/100; the private export path is not executable by
  authenticated users. The 10,000-row export ceiling is retained.
- Administration and Overview no longer request an unused employee page.
  Hidden tabs pause context polling; returning to the tab refreshes it. Visible
  workspaces retain the 30-second check, with overlapping reads and paired
  focus/visibility events deduplicated. Writes are never automatically retried.
- Search retains its 180ms debounce. Pagination, sorting and applied filters
  avoid that typing delay. An emptied final employee page returns to the last
  valid page; ordinals remain filtered offsets rather than stored identifiers.
- The optional manual scheduler SQL checks due work before invoking the Edge
  worker. It preserves daily effective-date reconciliation, expired-lease
  recovery and retry deadlines. Reapply this reviewed schedule in deployment
  to enable the guard; changing the file does not change a hosted schedule.
- Existing delayed floating progress remains active through settlement and
  explains extended waits. No employee values, tokens or verbose request bodies
  were added to logs. Audit records and idempotency history are not deleted to
  reduce storage; retention needs an explicit operational policy.

The 20-user local run measured the same 1,000-row page three times with each
projection: baseline 2,253/2,186/2,643ms; typed 1,232/1,474/1,193ms. Page objects
were identical. Single-pass 1,000-row export took 1,246ms. These observations
include local contention and are not a free-tier throughput or latency SLA.
Substring search/counts still inspect authorized rows, and existing workbook
snapshot bounds remain; larger deployments need representative hosted profiling.
The production JavaScript entry remains about 210KB gzip and emits Vite's
500KB uncompressed chunk warning. Route splitting was left out of this patch;
it needs its own measured loading/error-boundary work rather than hiding the warning.

## Verification and release boundaries

Regression sources and generated reports are under `.test-db`. Database checks
cover ACL/RLS, blind updates, revocation, hidden search/count/export values,
duplicate races, rollback, idempotency, status rules, department reversal,
schedule eligibility and page/export equivalence. Worker tests execute the real
handler with local transports, including failure isolation and retry skipping.

Browser checks cover both themes at laptop, desktop, tablet, phone and short
landscape sizes, System preference, persistence, navigation, scrolling, picker
bounds, floating progress/errors, confirmations, draft retention and typography.
Tests referencing removed filters, old fonts and hidden settings tabs were
updated to current workflows rather than skipped.

Native PostgreSQL simulates Supabase authentication; it does not replace the CI
Supabase REST/safeupdate/drift checks. Hosted Vercel/Supabase latency, production
data and live Google consent/sharing/quota behavior require staging verification.
No remote migration, deployment, schedule change, commit or push is performed by
these local checks.

Final local checks: production build, 87 unit tests, 69 database checks and Deno
type checks passed. Database runs exercised 20 and 50 users; the final additional
field-applicability regression passed in the 20-user rerun. The complete browser
run passed 158 tests, followed by 12 appearance checks including one added mobile
keyboard-focus test. No tests were skipped. `git diff --check` passed.
`node .test-db/scripts/test-rest.mjs --local-cli` could not start because the
Supabase CLI is absent (`spawn supabase ENOENT`); REST, Supabase lint and drift
checks remain CI/staging gates. Google requests were mocked, never sent live.
