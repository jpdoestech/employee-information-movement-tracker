# Managed employee column views

Superadmins manage these under **Permissions > Register settings > Managed column views**.
Use **Add column view**, choose **All accounts** or a selected account, and choose
all locations, Head Office, a branch, or a client. Use the existing column designer
to select/order columns, pin up to two identity columns, and configure row numbers.
The proposed starting columns are System ID, Employee Name, Employee Category, ID,
Employment Status, Position, Primary Branch, Primary Client, Date Hired and Gender.
No. remains a display ordinal ahead of selection and identity; it is not a field.
The existing global row-number availability gate still wins.

**Apply & Save** requires the shared Continue/Cancel confirmation. Close/Cancel
on an edited draft requires Discard changes/Continue editing. No changes are sent
on cancellation. Name the view under **View settings**. Each account/location
combination has one rule; edit it instead of creating conflicting duplicates.

## Precedence and scope

1. A single selected client: matching client view, then its branch view.
2. A single selected branch: matching branch view.
3. Head Office: matching Head Office view.
4. Account-wide view, then global all-account view.
5. Existing personal saved/active layout, then the existing system default.

At the same location, the selected account wins over All accounts. Organization
specificity wins before account specificity. Multiple selected locations use
account-wide/global defaults, not an arbitrary scoped rule. A branch rule applies
when that branch is selected or when a single client belonging to it is selected.
Without a location filter, a user with a branch grant still sees the account/global
view: authorization scope is not inferred as a UI filter.

The toolbar shows **Managed: view name** while a rule applies. Personal column
editing is disabled while managed columns apply; named personal views may still
restore filters, but cannot override managed columns. Removing the matching rule
restores the next rule/personal layout without deleting saved views. Sorting,
search, predicates, paging and selection are not saved into managed rules.
Authorized CSV export uses the same effective visible columns as the table.

## Security and rollout

Managed layouts are presentation preferences, not authorization. They cannot grant
record, field, export or import access. Existing server projections and RLS/RPC
checks remain authoritative; unreadable, inactive and non-list fields are removed
when rendering or exporting. Ordinary accounts receive only global rules and their
own account rules. Only superadmins may change rules; browser roles cannot access
the settings table directly. Every write checks the shared settings version, is
idempotent by request ID, records an audit entry and advances the global revision.
The normal context refresh carries these small settings; scope switches require
no extra network request. Limit: 500 rules, 200 columns per rule.

Apply `20261026052137_managed_register_views.sql` after parent-group permissions,
then publish the frontend. The additive migration starts with no managed rules,
preserving current personal views. Existing frontend/register-setting writes remain
compatible and preserve managed rules. Operational rollback: remove managed rules
through the confirmed UI and roll back the frontend; retain the additive schema
and audited history. No employee or permission data migration is required.

Verification lives under `.test-db`: register-view unit, native database and
responsive browser suites. Full Auth/REST and physical-device checks remain
separate release gates.
