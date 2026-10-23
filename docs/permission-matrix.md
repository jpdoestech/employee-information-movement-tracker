# Permission matrix and record access

Access rules edits module permissions in a table populated by the database
catalog. Cells offer Inherit, Allow and Deny; unavailable actions have no editable
cell. Field permissions lists all active groups together and expands groups into
individual fields. Changed cells save in one confirmed, atomic transaction.
Clear value is a field action; Delete archives an employee separately.

## Evaluation and compatibility

The active native account role remains the security boundary: Superadmin has a
trusted override, Admin can receive scoped mutations, and Viewer cannot mutate
employee data. Additional roles are database records, not new application role
branches. New roles start without permissions. Assigning an additional role does
not change the native account role or bypass its restrictions.

Any matching ordinary module deny overrides role, direct and legacy capability
grants. Employee View does not imply Create, Update, Delete or Export. Each
operation still requires its existing organization actions, field permissions,
applicability, revisions and capabilities where applicable. Existing ordinary
View/Export behavior is represented by explicit built-in role grants; an Export
deny removes export while retaining View. Manage covers the existing organization,
field configuration, synchronization or security actions for that module. No
fictitious Approve action or workflow is introduced.

Field denies override both field and group allows, including legacy address
groups. Restricted fields still require an individual allow. Normal group allows
inherit future fields. Combined-name/component checks remain enforced in the
same evaluator. Ordinary denies cannot remove the trusted Superadmin override
within active field applicability.

## Record scopes

Record restrictions intersect organization grants; they never replace them.

| Record scope | Requirement |
| --- | --- |
| Organization grants | Existing organization boundaries |
| Own employee record | Account linked to that employee |
| Direct reports | Explicit employee-to-manager relationship |
| Selected departments | Exact current department membership |
| Assigned records | Explicit employee IDs selected for the account |

An assigned record in another unauthorized branch stays unavailable. Empty
department/assignment selections allow no records. Record-restricted accounts
cannot create employees. Managers do not gain their own record automatically.
Department changes update the boundary immediately. Additional/temporary
employment placements do not grant primary-placement visibility.

View Effective Access explains saved module decisions, role/direct/capability
sources, denies, dated organization grants, record restrictions and assignments.
Selecting an employee evaluates its actual current placement and record boundary.
Without a record, field results preview the selected placement only. Unsaved
drafts are excluded. Inspection and administration remain Superadmin-only.

## Migration and rollback order

1. Apply all existing migrations through `20261023014601_account_password.sql`.
2. Apply `20261023024633_rbac_matrix.sql` before the new frontend.
3. Deploy the frontend and verify Superadmin and ordinary-user flows.

The migration adds private catalog, role membership, override, record-rule and
reporting tables. It does not rewrite profiles, capabilities, organization grants,
field policies, employee values or passwords. Existing accounts keep their prior
organization boundaries and scoped capabilities. Superadmin retains complete
applicable access. No native HR Staff role existed previously, so accounts are
not guessed or reassigned from display names. The new HR Staff template starts
empty and is configured and assigned explicitly. The intentional security change
is that an existing matching group deny now defeats a field allow.

Raw tables/helpers remain unavailable to browser roles. RPCs validate the live
active profile. Matrix saves require a reason, current reviewed revision/business
date and payload-bound request ID. Preview uses the same mutation inside a
rollback-only subtransaction and reports effective changes. Failures roll back
the whole batch; Cancel sends no mutation. Writes are never retried automatically.
Existing RLS/RPC protections and the publishable frontend key remain.

For a frontend rollback retain the migration and its security rules; older RPC
callers remain compatible. Do not drop populated permission tables. Removing
record fences or reversing deny precedence requires a reviewed forward migration.

## Performance and validation

Before this change, the ordinary user's production context request measured
2594 ms versus 453 ms for Superadmin on two employees and 49 fields. The context
path repeatedly rebuilt the field catalog. The shared relational evaluator now
loads policy inputs once per statement and placement. Individual checks, register
projections, catalogs, exports and access reviews use that evaluator. Context
reuses one catalog and requests register settings concurrently. No authorization
cache survives a statement, identity, date or policy revision.

Native database tests cover self, direct reports, independent actions/export,
branch and department fences, assigned records, deny precedence, trusted access,
custom HR roles, rollback, stale reviews, replay and raw privilege denial. The
existing employee, lifecycle/movement, reporting, field and synchronization
regressions remain in the full suite. Browser tests cover multi-group saves,
cancellation, draft preservation, presets, effective explanations and four
viewports. The disposable Supabase REST harness also exercises real Auth JWTs
and the publishable-key API; never run it against production.

ESS, onboarding and broader HR Operations modules are absent from this standalone
tracker. This change supplies their requested access primitives without inventing
those modules or claiming nonexistent regression coverage.
