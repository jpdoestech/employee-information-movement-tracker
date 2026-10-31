# Employee import

Employees → Import accepts CSV UTF-8 and Excel `.xlsx` files (first sheet only).
Choose the initial organization, download its current CSV template, fill it in,
then upload either format. Keep the immutable field keys as headers. The column
guide shows their current labels, permission groups, required state and choices.
Renaming a label does not change the import key. The template contains only fields
authorized for Create in the chosen organization; it contains no employee data.

Names default to UPPER CASE; PROPER CASE and USER DEFINED are available before
validation. The preview displays exactly the normalized values to be submitted.
Dates use `YYYY-MM-DD` (real Excel date cells also work); decimal/integer values
have no currency symbols or thousands separators; checkboxes use `true`/`false`.
Format identifiers, account numbers, phone numbers and names as Text. Numeric
Excel cells in text columns are rejected to avoid silent loss of leading zeros.
Blank cells are omitted so existing authorized field/client defaults still apply.
Empty rows are ignored. The batch limit is 100 employees, 200 columns and 1 MB.
CSV files with more than 1,000 physical records (including blanks) are rejected.

Validate import runs the full database transaction in a rollback-only preview.
It saves no employees, audit entries, write receipts or synchronization work.
Permanent ID sequences can have gaps after previews or failed transactions,
as with existing rollback previews. Continue/Cancel confirmation is required
before Import. Closing a file draft requires Discard changes/Continue editing.
Cancellation retains the preview and sends no mutation. Files are parsed in the
browser; only normalized row payloads go to the existing application database.
The Excel parser loads only when an Excel file is chosen and parses in a worker.

Imports only create employees; they never overwrite or match/update existing
records. Organization and generated category apply to the whole batch: Head Office
generates Admin; branch/client generates Agency. System and automatic client IDs
are allocated by existing creation logic. A manual-ID client adds the
`manual_client_id` column, required for every row. Initial status/position go
through the existing typed employment path. Other fields retain validation,
applicability, uniqueness, restricted-field requirements and configured defaults.

One invalid/unauthorized row or possible duplicate aborts the entire batch,
including previous rows, assignments, audit entries and outbox changes. Errors
identify the row's ordinal in the preview (not a permanent employee ID or a CSV
physical line). Correct the file and validate again. Possible duplicates must be
handled individually through Add employee, where the existing secured duplicate
review is available. Import accepts no duplicate-review override.

## Authorization

`employees.import` is an independent module action, available to trusted
Superadmin by default. The migration grants it to no ordinary account or role.
To authorize a selected user, choose that user under Permissions → Access rules
→ Permission matrix and set Employees Import to Allow. Employee Create, creation
organization scope and each field's Create permission are independently required.
Existing Viewer and record-restricted accounts remain read-only for creation.
DENY overrides ordinary grants. Effective Access explains the new action using
the same central evaluator as other module actions. Import grants no Read,
Update, Delete, Export, organization scope or restricted-field access.

`tracker_mutate('employee_import', payload, request_id)` checks Import and Create,
locks the existing configuration boundary, and calls the complete secured
employee-create dispatcher for every row in one database transaction. The outer
idempotency receipt returns only a count and rejects changed payloads. A retry
rechecks current module and creation scope; no row data or IDs are returned by a
replay. Raw employee tables and private helper functions remain inaccessible to
publishable-key callers. The browser never uses elevated credentials. Existing
audit and asynchronous synchronization boundaries remain unchanged.

## Deployment and verification

Apply all previous migrations, including
`20261026005346_employee_name_case_selection.sql`, then
`20261026014402_employee_import.sql`, before publishing the frontend. Existing
records, field policies, scope grants, memberships, account roles and public
function ACLs are preserved. An older frontend works with the additive database
change. For a frontend rollback retain the migration; review/revoke any manually
granted Import permissions through Access rules as appropriate. Do not rewrite
released migrations or delete employee data to disable this feature.

Tests cover CSV quoting/malformed input, immutable headers, exact types/IDs,
name case, batch bounds, real Excel parsing, all-or-nothing rollback, duplicate
protection, idempotency, default denial, scoped delegation, field/record denial,
anonymous/private API denial, preview isolation and four responsive layouts.
Real employee files must not be used as repository fixtures or production test
imports. Use the synthetic fixture under `.test-db/fixtures` for browser checks.
