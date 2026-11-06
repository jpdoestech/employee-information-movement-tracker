# Employment classification and unique fields

Migration: `supabase/migrations/20261017000200_manpower_and_unique_fields.sql`.

## Use

- New employees default to **New/Additional**. Choose **Replacement** to select an authorized Inactive or Separated employee. The server checks their current status again when saving. Previously saved references remain valid for unrelated edits if that person later becomes active.
- All four Government IDs are optional, including on new records. Entering a value does not make it required: it can be cleared and saved. Supplied values retain exact-digit/format validation and restricted permissions.
- A superadmin can enable **Unique values** in Field Builder and choose **Across the whole system** or **Within each client**. There is one rule per field; there are no individual-client overrides. For non-Government fields, disabling the checkbox turns the uniqueness rule off.
- Government ID uniqueness is enforced, globally by default, with a superadmin-configurable Global/Per-client scope. Other fields are opt-in. Corrective migration `20261017000400_optional_government_ids.sql` makes IDs optional and enables uniqueness without changing existing scope choices or employee values. Existing duplicates reject activation atomically; resolve those explicitly before applying the migration.
- Empty optional values do not reserve a value. Text uses the existing case-insensitive Unicode/whitespace normalization. Government ID separators are ignored. Numeric values compare numerically.
- Global uniqueness includes archived employees. Per-client uniqueness reserves values for every non-voided primary client placement, including past and scheduled placements and archived employees. An employee without a client reserves no per-client value until a client placement is created. Voiding a future placement releases that placement's reservation unless another non-voided placement retains it.
- System ID and the client-issued **ID** retain their existing allocation, manual/automatic settings and uniqueness rules. They are not controlled by this new checkbox.

## Deployment and compatibility

Apply the forward migration through the existing Supabase release workflow before publishing the matching frontend to Vercel. No Docker or third-party service is needed by the feature. Local verification uses the repository's embedded PostgreSQL harness; it does not modify hosted Supabase.

The migration adds metadata columns with safe defaults and a private hash-based claim table. It does not rewrite existing employee values. Existing field-configuration callers that omit the new flags retain the stored rule. Private claims cannot be read through public REST, and duplicate errors disclose no conflicting employee or value. Concurrent writes, bulk edits and assignment changes use the existing transaction/serialization boundary.

## Recovery

For non-Government fields, to undo an unwanted uniqueness policy, disable **Unique values** for that field as superadmin; this removes its claims without changing employee values. Scope changes and rule activation roll back completely on duplicate data. Existing request/version/idempotency handling is unchanged.

A frontend rollback alone does not relax the new server requirements. Migration `20261017000400_optional_government_ids.sql` corrects the former required-ID policy. If the manpower policy must be reversed, use a reviewed corrective forward migration: remove `manpower_values_changed`, restore `patch_employee` from `patch_employee_before_manpower` using its existing signature, and set the manpower definition's `required` flag to false. Preserve the stored values and new columns. Do not drop claim tables/functions while a unique rule is still enabled. No destructive rollback is run automatically.

## Verification

`npm test`, `npm run build`, `npm run test:db`, and `npm run test:e2e` cover the shared validation, responsive forms, atomic uniqueness and replacement eligibility. Native database tests include twenty concurrent duplicate creates, idempotent replay, bulk rollback, archived reservations, future client assignments, and unauthorized configuration changes.

## Possible duplicate employee review

Migration: `supabase/migrations/20261017000300_employee_duplicate_review.sql`.

- Permissions → Register settings lets a superadmin configure the global name similarity threshold (0–100%, default 90%). Old settings clients preserve it when updating row-number visibility.
- A birthday must match exactly. Names use normalized, case-insensitive Levenshtein similarity: `100 × (1 − edit distance / longer name length)`. Blank birthdays do not produce a duplicate warning.
- Checks span clients and branches, rather than the employee register's current filters or loaded page. Existing read authorization still applies: hidden identities/birthdays are not disclosed or counted. Assignment details without Read permission show “Restricted or unavailable.”
- New entries, identity edits and bulk name/birthday changes require a possible-duplicate confirmation when matches exist. The modal shows the matching employee, similarity, Branch, Client, Department and Position. Cancel retains the draft and writes nothing. Continue is the save confirmation; there is no redundant second prompt.
- The server rechecks inside the same atomic transaction. Approval is bound to the candidate details, matching records and threshold. Changed matches or settings require a new review. Successful request replay remains idempotent. This is an advisory review, so a user may confirm that two matching records are different people; it does not replace hard unique-field rules.
- Suggestions show at most 20 match relationships with a total. Bulk review identifies which edited employee each match belongs to. The database checks the entire match set, including matches between rows in the same batch. Bulk preview uses the existing rollback-only pattern: no employee, audit, request or outbox change persists.
- An indexed birthday lookup limits fuzzy comparisons to employees sharing that birthday. No external service, extra API key, periodic scan or background logging task is introduced.

To roll back duplicate review, restore `public.tracker_mutate` from `app_private.tracker_mutate_before_duplicates` (preserving the existing public function signature and its qualified request-ID references), and remove the matching frontend controls in the same release. Preserve the setting and employee data until dependent clients have been retired. This is a reviewed corrective migration, not an automatic action.

Government ID permissions: explicit **Create** permission is needed only for IDs being entered. Blank IDs do not require access to all four fields. Existing Read grants are not expanded automatically.
