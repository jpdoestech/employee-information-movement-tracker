# Permanent employee data deletion

Only an active native **Superadmin** can access **Permissions > Data management**.
An Admin, role template or direct grant cannot enable this operation. Backend RPCs
recheck the native role after acquiring the configuration lock; raw browser access
to the private preview receipts and employee tables remains denied.

Select All employee data, Head Office, a branch or a client, then preview. Scope
uses today's **primary assignment**. A branch includes its clients. Archived
employees are included. Historical-only, additional and temporary assignments do
not select an employee. All employee data includes unassigned employees.

Preview shows counts, linked accounts, cross-location history and the first ten
employees. Deleting a selected employee deletes the **entire employee**, including
history in other locations; it does not just delete the selected assignment.
Organization definitions, field setup, permissions, staffing PRFs, login accounts,
personal views and employee/client numbering counters remain. Counters are never
reset, so old identifiers are not reused.

Enter a reason and the exact count-bound phrase, then use the shared Continue/Cancel
confirmation. No delete occurs on Cancel. Closing an edited dialog uses the shared
Discard changes/Continue editing prompt. Expired previews, another save, a date
change, a different actor or loss of Superadmin status require a fresh review.
Previews expire after ten minutes. There is no automatic write retry.

The atomic operation deletes employee profiles, assignments, movements, per-client
IDs, unique-value entries, position corrections and associated audit value history.
Old request receipts containing employee/movement UUIDs are replaced with
non-personal tombstones so retrying a previously completed create cannot recreate
deleted employees. Reporting links are removed. Self/direct-report accounts linked
to a deleted identity retain an empty assigned-record restriction, rather than
falling back to organization access; assigned-record lists lose only deleted IDs.
A minimal deletion audit retains actor, reason, scope and counts; it does not copy
employee names or values. The delete and its receipt are idempotent by request ID.

Approved managed spreadsheets receive a queued full roster reconciliation through
the existing worker. Cleanup is asynchronous and depends on a working connection.
Backups, downloaded exports and unmanaged spreadsheet copies are not erased.
Hard deletion has no app undo; recovery requires restoring an independently held
database backup. No live deletion is needed to install or verify this feature.

## Deployment and rollback

Apply `20261031072807_employee_hard_delete.sql` after the current migration set,
then deploy the frontend. The additive migration grants no ordinary role a new
capability and deletes no existing business records. Disabling/reverting the UI
and revoking authenticated execution on the two new RPCs disables the feature;
it cannot reverse already committed deletions. Retain deletion audit records.

Native SQL tests under `.test-db/scripts/test-employee-purge.mjs` cover isolation,
role checks, stale receipts, transaction rollback, complete dependent removal,
closed record restrictions, idempotency and all-data rollback rehearsal. Browser
tests under `.test-db/e2e/employee-purge.spec.ts` cover typed confirmation,
cancellation, draft retention and desktop/phone/tablet/landscape bounds using only
synthetic records. Auth/REST and hosted worker completion are separate checks.
