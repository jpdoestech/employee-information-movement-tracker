# Permission matrix and record access

Access rules edits module permissions in a table populated by the database
catalog. Cells offer Inherit, Allow and Deny; unavailable actions have no editable
cell. Field permissions lists all active groups together and expands groups into
individual fields. Changed cells save in one confirmed, atomic transaction.
Clear value is a field action; Delete archives an employee separately.

## Evaluation and compatibility

| Account role | Organization boundary                         | Access administration |
| ------------ | --------------------------------------------- | --------------------- |
| Superadmin   | All applicable scopes                         | Allowed               |
| Admin        | Explicit Head Office, branch or client grants | Denied                |
| Viewer       | Explicit grants, read-only employee access    | Denied                |

Head Office Admin and Branch Admin are scoped assignments of Admin, not higher
roles or automatic grants. A Head Office grant does not include branches. A
branch grant includes clients only when explicitly selected. The Admin role
alone grants no employee-record access without organization grants; field,
module and record restrictions still apply. Existing assignments stay unchanged.

The active native account role remains the security boundary: Superadmin has a
trusted override, Admin can receive scoped mutations, and Viewer cannot mutate
employee data. Additional roles are database records, not new application role
branches. New roles start without permissions. Assigning an additional role does
not change the native account role or bypass its restrictions.

Admin is shown as **Administrator** in Role template. It is assigned through
Users through the account editor, not Additional roles; the latter lists HR Staff, Manager, Employee and
custom supplemental roles. Keep a normal administrator as Admin with only the
organization grants, module actions and fields their job needs. Reserve
Superadmin for trusted access administration. HR Staff/Manager templates start
empty and need explicit configuration before assignment.

Additional roles and the account-role explanation are under Scope & assignments.
Field Builder, employee form sections and Field permissions share full group
paths such as **Employment Details / Compensation** and place child groups after
their parent. Child permission groups inherit their active parent's policies;
fields inherit their own permission group. Any matching field, group or parent
deny overrides ordinary allows. Restricted fields still require an explicit field
policy, including a field policy from an assigned role. Inherit removes the
selected user's or role's direct setting at the selected scope; it is not itself
an Allow. Other matching user policies (including broader scopes) and role
policies still apply, and a root group with no applicable policy defaults to denied.
Parent links in the matrix take administrators directly to the group to adjust;
field rows link to their permission group. View effective access names the saved
policy's group, role/user source and organization scope. Draft settings do not
claim to be the final effective result. Permission
rows still target the original access-group ID, not the displayed form location.
When those locations differ, Field Builder shows **Permission group: …** and the
expanded permission row shows **Form: …**. Field Builder labels its access selector
**Permission group**; its form-section selector controls presentation only.
Confirmation summaries use the same full group paths.

Apply `20261026022643_parent_group_permissions.sql` after the import migration
and before this frontend. The shared evaluator supplies the inheritance to every
read/write, import, export, preview and synchronization path. It changes no saved
policies or employee values. Existing parent grants can therefore permit normal
child fields that were previously default-denied; review the impact on current
users before release. Explicit child/field denies continue to block access.
Form placement (`form_group_id`) does not confer permission. New ordinary fields
inherit only policies with `inherit_new`; group denies continue to apply.
An inactive parent supplies no inherited grant. Reparenting changes security and
requires Superadmin, while the existing two-level hierarchy constraint remains.
For rollback, restore `field_policy_grid` and `validate_group_parent` from their
private `*_before_parent_inheritance` / `*_before_inheritance` predecessors in a
new forward migration, preserving ACLs; then roll back the frontend. Keep the
predecessors private and retain employee data and all saved policies.

Field organization controls share the stationary top toolbar. Permission tables
own their vertical and horizontal scroll; column headers and the first identity
column remain visible. Help stays available in compact expandable sections.

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

| Record scope         | Requirement                                    |
| -------------------- | ---------------------------------------------- |
| Organization grants  | Existing organization boundaries               |
| Own employee record  | Account linked to that employee                |
| Direct reports       | Explicit employee-to-manager relationship      |
| Selected departments | Exact current department membership            |
| Assigned records     | Explicit employee IDs selected for the account |

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

Apply `20261026005346_employee_name_case_selection.sql` after the uppercase-name
migration and before its frontend. This supersedes mandatory uppercase storage:
the shared name inputs offer UPPER CASE (new-entry default), PROPER CASE, and
USER DEFINED for each name part. Case choices stay with the open draft across
form tabs; existing mixed-case values start as USER DEFINED. Only the resulting
text is persisted, so reopening an employee preserves its recorded spelling.
Name previews and duplicate review use the actual submitted components. The
secured dispatcher continues whitespace cleanup, all validation, authorization,
versioning, duplicate review and atomic writes while preserving selected casing.
No existing data, grants or function ACLs change. Old uppercase-only frontends
remain compatible; roll back the frontend without reintroducing forced server
uppercase, which would destroy user-defined casing on subsequent saves.


Apply `20261023151031_employee_names_uppercase.sql` after the text/category migration
and before its frontend. Last/first/middle names, suffix and combined employee
name are uppercase on entry and inside the existing secured mutation dispatcher.
Combined-name generation also returns uppercase for duplicate checks. No policies,
versions, atomic write boundaries or existing rows are changed. Existing names
become uppercase as their name fields are edited and saved. Remarks, Department,
Position and sign-in account display names retain their casing. Frontend rollback
is compatible; reversing stored-name rules requires a forward migration restoring
the previous dispatcher and combined-name function bodies.

Apply `20261023143337_employee_text_and_initial_category.sql` after the form-section
catalog migration, before its frontend. Submitted text is trimmed and repeated
horizontal spaces collapse; paragraph breaks are retained. Employee-name casing
is governed by the later uppercase-name migration above; other text keeps its casing. Credentials,
opaque review tokens and saved filter configurations remain exact. The same
normalization runs before client confirmation/fingerprinting and at the secured
mutation endpoints. Existing untouched values are not rewritten.

New Head Office employees receive Admin; new branch/client employees receive
Agency. Initial category is generated inside the authorized creation transaction,
including for creators without a category-field Create grant. It is read-only in
the creation form; category Read permissions still govern visibility. Existing
record edits retain normal field authorization, and movements do not silently
reclassify existing employees. Unassigned creation retains its current behavior.
No login roles or existing employee categories are changed by deployment.

Frontend rollback may retain this migration; older creation forms remain usable
and the server applies the required initial category. Reversing the business rule
requires a reviewed forward migration restoring the previous function bodies;
do not drop the normalizer while those bodies reference it.

Apply `20261023141014_form_section_catalog.sql` after the profile/target-field
loading migrations and before publishing its frontend. It restores presentation
sections and their parent names from the authorized field catalog. It does not
change field actions, organization grants, field definitions, or employee values.
The context JSON contract is unchanged, so older frontends remain compatible and
a frontend rollback can retain the migration. Do not restore the older group-only
projection: it hides authorized fields with separate form placement.

Employee drafts are locked during validation, confirmation and submission;
cancelling confirmation or a failed save unlocks the retained draft. Profile
address summaries group readable parts by their configured presentation section.

1. Apply all existing migrations through `20261023014601_account_password.sql`.
2. Apply `20261023024633_rbac_matrix.sql` before the new frontend.
3. Apply `20261023033903_matrix_review_coverage.sql` so module/role changes and
   scope removals review every affected placement, independent of the field
   editor's selected scope.
4. Deploy the frontend and verify Superadmin and ordinary-user flows.

For the employee loading optimization, apply
`20261023130450_employee_profile_loading.sql` before deploying its frontend.
`tracker_query('employee', {id, include_history:false})` returns the same secured
employee and field catalog without history. `employee_history` reuses the
existing authorized detail/history path and returns only assignments and
movements. Legacy employee queries still return their original full response.
Rolling the frontend back requires no database rollback or data changes.

History loads only when its tab opens. Its cache exists only inside the mounted
dialog and is keyed by account, employee, authorization revision and business
date. Closing the dialog discards it. Failed history reads can be retried without
blocking or changing the overview; no write is retried automatically.

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

Apply `20261023133957_target_field_loading.sql` after the employee-profile loading
migration, before publishing its frontend. `target_fields` keeps its JSON contract,
defaults, applicability and ACLs, but computes the shared field policy grid once
per request. Older clients remain compatible; a frontend rollback may retain it.
To reverse the database optimization, restore the previous `target_fields`
definition from `20261012000700_client_entry_settings.sql` in a forward migration.

New employee forms wait for the current organization's verified field list instead
of temporarily rendering the union from the context catalog. Switching organization,
principal, permission revision or business date invalidates the displayed list
immediately. Pending/failed checks disable Save; read retries preserve the draft.
Empty groups do not generate tabs, and restricted fields still need explicit grants.

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

Employee import adds the independent `employees.import` action. It defaults to
trusted Superadmin only; grant it explicitly for a selected user in the matrix.
Employee Create, authorized creation scope and field Create permissions remain
separate requirements. Import never grants Export or record access. See
[employee-import.md](employee-import.md) for its atomic transaction and file rules.

ESS, onboarding and broader HR Operations modules are absent from this standalone
tracker. This change supplies their requested access primitives without inventing
those modules or claiming nonexistent regression coverage.
