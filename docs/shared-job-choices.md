# Shared Department and Position choices

Superadmins manage the shared lists in **Field Builder → Department / Position →
Choices**. Enter one official name per line, review spelling and consistency,
then use the normal Continue/Cancel save confirmation. The lists can be empty.
Position retains its system field, movement history and permissions; this action
updates only its choice list with the field's existing row version.

Employee, PRF and position-change forms offer **Choose existing** alongside a
normal text input. Unknown names are allowed as temporary values. An inline
information message suggests checking spelling, choosing an existing official
name, or asking a Superadmin to add the name to the official list. Case-only
matches offer **Use official spelling**. Temporary values never automatically
become official and do not block a save. Existing validation, required fields,
permissions, versions, audit and confirmation still apply.

Imports show **Review Department / Position names** for unlisted values. Each
name may be kept temporarily or linked to an official choice before validation
and save. Mapping changes only the current import draft and clears its prior
validation result. Missing catalog choices never prevent import. Existing
records are not rewritten when a choice is added or removed.

The lists use field-definition options already projected under the existing
authorization rules. No employee catalog scan or separate background workflow is
needed. `set_job_choices` requires an active Superadmin with schema management,
serializes with the shared configuration lock, checks the field version, records
audit/revision/outbox and actor-bound idempotency together. Generic Position
definition edits remain forbidden. Official list names must be distinct,
nonempty strings of at most 200 characters; employee values need not belong to
those lists. Older Department dropdown definitions also accept temporary values.

## PRF selection and vacancy counts

First choose the specific **client** in the employee's **Initial organization**;
choosing its branch alone does not select that client. Then choose the PRF and
job requirement in Employment Details. The picker remains limited to authorized,
active requirements effective today. PRF No. remains optional.

Approved manning is not reduced when an employee is hired. With two required
positions, one matching linked active employee gives **2 required, 1 filled,
1 vacant and 50% fill rate**. PRF lists, requirement forms and Overview display
vacancies explicitly. Case and surrounding whitespace alone do not make a job
different; different job names still require an explicit choice/link. No
automatic fuzzy matching or rewriting of employee jobs occurs.

## Deployment and verification

Apply `20261027010000_shared_job_choices.sql` after the PRF employee-assignment
migration and before this frontend. The migration preserves job values, PRFs,
employee links and existing official choices; it does not approve any temporary
name. Keep the additive RPC and helpers on frontend rollback.

Focused coverage includes temporary manual entry, PRF entry and imports;
optional import mapping; catalog privileges, versions and idempotency; system
Position protection; case-consistent PRF counts; and desktop, phone, tablet and
short-landscape interaction. All verification files are under `.test-db`.
