# Access management

Permissions → Access rules now combines an account overview, draft presets and a database-backed change review. Existing role codes, grants, scope matching, field precedence, applicability, capabilities and trusted administrator boundaries are unchanged.

## Draft presets

Head Office editor selects Head Office only; Company-wide HR editor explicitly selects all organization scopes. Branch editor excludes clients; Branch and clients editor explicitly includes them. Client viewer selects Read only. Editor presets select C/R/U, never D (clear values). Choose the actual branch/client and permission group before saving. Presets fill the existing form and reset its field selection; they do not create accounts, change roles, grant capabilities, save permissions, or replace existing rules. A Viewer remains read-only after choosing an editor preset.

Organization actions and field policies remain separate saves. This preserves the existing API and avoids partially applying a multi-request preset. Employee creation, movements and bulk changes still require their separate capabilities. Permission administration and movement correction remain Superadmin-only.

## Overview and confirmation

Select a user to see their account status, explicit capabilities, scope names, branch-client inclusion, inclusive start dates, exclusive end dates, scheduled/expired/inactive grants, direct field exceptions and matching role policies. Form sections are not permission groups. Effective permission preview explains each C/R/U/D decision, including inactive accounts, Viewer mutation restrictions and missing effective scope grants.

Saving or revoking a scope/field policy first calls the Superadmin-only `access_change_preview` RPC. It uses the existing live evaluator before and after the same secured mutation in a rollback-only subtransaction. The response contains changed scope/field action decisions and configuration labels, not employee values. Revoking a role policy evaluates all accounts with that role. Restricted-field gains and access restored by removing a deny are visible. Confirmation is the shared Continue/Cancel dialog; Cancel preserves the draft and sends no persistent mutation.

The preview evaluates today's access, including current grant dates and overlapping rules. It does not promise the same decisions on future dates. Scope-action differences are listed separately from field-action differences. Capabilities are described in their existing confirmation and account overview; field access alone does not authorize every employee operation. Synthetic demo mode explicitly does not claim a database evaluation.

Reviewed saves carry the system revision and business date. A changed revision or date rejects a new save and requires a fresh review; matching request replays retain the existing idempotency behavior. Older callers without review metadata still use the original validators. Previews serialize on the existing configuration lock and may take longer for company-wide or role-wide changes with many fields and placements; measure this before introducing asynchronous review jobs.

## Release and verification

Apply `20261022085957_access_change_review.sql` before deploying the updated frontend. The migration only adds preview helpers and a backwards-compatible mutation wrapper; it does not backfill, delete, or alter existing grants or employee data. The previous frontend remains compatible with the advanced database. To roll back the interface, redeploy the previous frontend and retain the additive migration; do not delete grants or rewrite applied migration history.

Unit tests cover presets, grant dates, scope labels and denial explanations. Native database regressions cover trusted-only RPC access, unchanged grants/audit/outbox/revision/request records after preview, identity restoration, Head Office isolation, optional branch clients, future/inactive grants, restricted fields, role-wide revocation, stale date/revision rejection and replay. Browser tests cover drafts, failure/cancellation without writes, atomic saves, role/capability preservation and responsive confirmation bounds. The existing real Supabase Auth/REST harness now also checks preview denial, rollback and stale-review rejection with distinct real JWTs; it runs in the existing disposable Supabase CI job. Hosted deployment, secrets and production grants require their normal release process.

Local verification on 2026-10-22: production build, 113 unit tests, 93 native PostgreSQL checks (45 migrations), and 19 focused browser checks passed. After the final confirmation-scroll styling, all nine affected browser checks passed again, including 320px phone, tablet, desktop, short landscape and an 80-change review with stationary actions; phone and desktop screenshots were inspected. Real Auth/REST execution was attempted but stopped before connecting because disposable Supabase connection settings were absent. No hosted database, production grants or deployment was changed.
