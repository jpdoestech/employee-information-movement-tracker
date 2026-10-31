# PRF employee assignments

The requested PRF extension supersedes the original v1.8 exclusion for this slice.
Applicant tracking and approval workflows remain outside this change.

## PRFs and job requirements

[Shared job choices](shared-job-choices.md) provide official Department/Position
names with nonblocking temporary entry and optional import linking. Users can
choose existing names or type temporary ones. New hires still select the client
before opening PRF No.; approved manning stays fixed while vacancies decrease.

A client PRF has a PRF No., Employment Type, effective dates, and 1–100 requirement
lines. Each line contains Department, Position required, and a positive whole
headcount. Duplicate department/position pairs are combined into one line. The
PRF total is calculated from its active lines, up to 100,000 employees.

One PRF can have many employees across its requirement lines. An employee has
one current hiring PRF requirement or no PRF. **PRF No. is optional for every
employee**, including new client employees. Existing records are not assigned
automatically or forced to change.

In Employment Details, select PRF No. and the matching job requirement. New
employee forms fill writable Department, Position, and Employment Type values
from that requirement. Existing job edits retain the established official-change
or correction flow. Employees can also be assigned, reassigned, or unlinked
without rewriting their employment history. A new selection must be an active,
effective requirement belonging to the employee's current primary client.

PRF No. is available in the employee overview, configured register columns,
authorized filtering, exports and existing workforce projections. The database
stores a foreign key to the requirement; the displayed field resolves its PRF
number. Stable requirement IDs are retained in field-value audit history, so a
change between two lines of the same PRF is still recorded.

Imports may supply the requirement UUID or the PRF number together with its
exact Department, initial Position and Employment Type. The ordinary creation
path resolves and authorizes the relationship inside the import transaction.

## Fill rate

Filled employees must be explicitly linked to the line, active today, currently
placed in its client, and match its Department, Position and Employment Type.
Unlinked staff and staff in another job do not fill a requirement. Employment
movements can therefore change filled counts while retaining the hiring PRF.

Fill rate is `sum(min(matching linked active employees, required) per active line)
/ sum(required per active line) × 100`. Only active PRFs effective today and
readable staffing populations contribute. Extra hires in one line cannot cover
another line's vacancies. Counts remain unavailable when required fields or the
staffing population are restricted. A missing denominator remains a dash.

PRF No. and Employment Type are locked after any employee is assigned. Assigned
line job details are also locked; add another line for a different job. Headcounts
and effective dates remain editable with versions and confirmation. Removing a
line retires it, preserving its employee foreign keys and historical labels.
PRFs and lines are never hard-deleted by this UI.

## Authorization and transactions

PRF management retains Organization View/Manage, client Read/Update scope,
unrestricted record access, and readable Client, Employment Type, Department and
Position. Employee selection uses a separate, bounded secured RPC and requires
employee Create/Update, matching client scope and PRF No. field permission.
Requirement labels additionally require Read for PRF No. and the job fields.
Current employee and source client permissions protect historical PRF labels.

Employee assignment uses the shared innermost employee patch path, covering
profile employment changes, ordinary edits, bulk writes and imports. Versions,
field Create/Update/Delete, audit values, the request ledger, revision and the
existing synchronization outbox remain in the same database transaction.
Continue/Cancel and unsaved-draft confirmations are unchanged.

Base tables have RLS enabled and no direct authenticated/anonymous privileges.
Counts use indexed linked employees and one permission grid per requisition;
picker searches return at most 25 authorized lines, and record pagination stays
server-side. No employee identities are included in staffing totals.

## Migration and rollback

Apply `20261027000000_prf_employee_assignments.sql` after the two Overview
migrations and before publishing this frontend. Existing PRFs receive one
unconfigured line preserving their total. Complete its Department and Position
before assigning employees. Existing employees retain null PRF links.

Retain the additive schema and employee links on frontend rollback. The older
frontend can read its existing dashboard response but cannot manage multiple job
lines; refresh/redeploy the current frontend for PRF saves. Do not drop the new
tables, field or employee relationship when rolling back the frontend.

Focused coverage lives in `.test-db/scripts/test-prf-assignments.mjs` and
`.test-db/e2e/prf-assignments.spec.ts`, alongside the updated analytics fixtures.

Recorded local checks: production build, 135 unit tests, 11 focused database
checks, and 11 browser scenarios passed. Browser coverage includes desktop,
phone, tablet/dark mode and short landscape. The 1,000-profile analytics benchmark
remained below the former full-projection query (354 ms versus 1,160 ms in the
final concurrent verification run). These timings are not production capacity
measurements. The full unrelated database matrix suite was not rerun for this release.
