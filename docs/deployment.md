# Deployment and migrations

Calculated Age and Length of Service columns require
`20261027020000_derived_employee_columns.sql` after shared job choices and before
the frontend. Employee data and existing column selections are preserved. See
[calculated register columns](derived-register-columns.md).

Shared optional job choices require `20261027010000_shared_job_choices.sql`
after PRF employee assignments. Temporary Department/Position values remain
allowed; existing values are preserved. See [shared job choices](shared-job-choices.md).

PRF employee links and multiple department/position requirements need
`20261027000000_prf_employee_assignments.sql` after both Overview migrations and
before publishing their frontend. Existing employees remain unassigned; existing
PRF totals are preserved. See [PRF assignments](prf-employee-assignments.md).

Parent field-group inheritance requires `20261026022643_parent_group_permissions.sql`
after employee import. Review changed effective access for existing users before
applying it: saved parent grants can now reach normal child fields. Publish the
updated permission UI after the migration. See [permission-matrix.md](permission-matrix.md)
for deny precedence, parent links, restricted fields and rollback.

Employee import requires `20261026014402_employee_import.sql` after all earlier
migrations and before the updated frontend. It preserves existing records and
grants Import to no ordinary account by default. See [employee-import.md](employee-import.md)
for selected-user grants, file format, rollback and verification details.

Create a **new** Supabase project. Keep its database and Auth separate from both reference applications. Configure Auth site/redirect URLs for the chosen frontend; disable public signup, create accounts through trusted Auth administration, and enroll them through Permissions. Enable appropriate MFA/password and session policies for your organization.

## Staging first

With Docker available, run the README's full local Supabase checks. Link only the selected staging project, verify migration history and review the generated SQL/diff. The CLI version below is pinned; update it through a reviewed dependency change.

```powershell
npx supabase@2.120.0 login
npx supabase@2.120.0 link --project-ref YOUR_STAGING_PROJECT_REF
npx supabase@2.120.0 migration list
npx supabase@2.120.0 db push --dry-run
npx supabase@2.120.0 db push
npx supabase@2.120.0 db lint --linked --level error
npx supabase@2.120.0 db diff --linked --schema public,app_private
```

Review differences against the ordered migration files; do not reconcile drift by editing production tables in the dashboard. `seed.sql` contains optional synthetic demo fixtures and must not be loaded into production. Core system metadata is supplied by migrations. Each migration is applied once, in order. Append corrective migrations after release; never rewrite released migrations. Frontend hosting does not apply database migrations.

Bootstrap the first trusted administrator using the new project's SQL editor **after** creating its Auth account. Replace the placeholder with that account's UUID. This is a privileged release step, never a browser signup flow:

```sql
insert into public.user_profiles(id,display_name,role,active)
values ('REPLACE_WITH_AUTH_USER_UUID'::uuid,'Initial administrator','superadmin',true);
```

Review all Superadmins. After bootstrap, use **Permissions → Accounts & capabilities → Create new user** to create sign-in accounts with email, display name, initial password and role. Explicitly grant organization actions and group/field policies; an Admin role alone grants no data. At least two independently controlled trusted administrators avoid lockout.

Deploy the account-management function before the frontend:

```powershell
npx supabase@2.120.0 functions deploy manage-users --no-verify-jwt
```

It validates the caller's Auth token and active Superadmin profile itself, and enrolls profiles through the caller-authorized mutation RPC. Supabase supplies its URL, anon key and service-role key; never copy the service-role key into frontend variables. Set `FRONTEND_ORIGIN` to the frontend origin (default `https://strellas-employees.vercel.app`). Public signup stays disabled. Account creation confirms the email administratively and sends no invitation; provide the initial password securely. If enrollment fails, retry the unchanged form to complete the same request. The existing Auth UUID option remains available for previously created Auth accounts.

Allow the frontend root and `/?auth=recovery` in Auth redirect URLs. Reset emails use this explicit marker so the new-password form opens even after Auth consumes the token fragment. Expired links open the reset-request form.

## Frontend

The function audit fixes require `20261022055927_audit_function_fixes.sql` before the updated frontend and Google functions. It adds atomic `policy_batch` saves, a service-only snapshot publication guard, and a private Google owner ID. Existing single-policy callers remain supported. Deploy the updated Google handlers only when enabling Sheets; no scheduler or Google connection is enabled by this migration. To roll back the frontend, retain the additive migration; do not drop stored account bindings or rewrite released migrations.

The audit fixes require migration `20261020000100_audit_options_and_exports.sql` before deploying the updated frontend. It repairs and pages organization options, marks Head Office active, and excludes inactive field groups from workbook headers and values. Earlier migrations remain unchanged. Run a successful reconciliation after applying it to remove previously exported inactive-group cells; stored employee values are retained.

Vercel: import this repository, build `npm run build`, output `dist`, Node 24. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; set `VITE_DEMO_MODE=false`. `vercel.json` supplies browser security headers and a Supabase-compatible CSP. Hash routes work without a server rewrite. Preview deployment must point to staging.

GitHub Pages: enable Actions as the Pages source, configure the same two repository variables, review `.github/workflows/pages.yml` and manually dispatch after approval. Its `BASE_PATH` matches this repository name; change it if the repository/custom domain changes. Pages cannot apply Vercel response headers; use a hosting proxy if equivalent headers are required. Worker secrets belong exclusively in Supabase. Frontend source maps are not published.

## Backend worker

Fill a private, ignored Edge Function secret file using `supabase/functions/.env.example`. Supabase supplies its URL/service-role environment; the backend service role must never be a frontend key. Generate independent random encryption and scheduler secrets. Keep the secret file outside Git.

```powershell
npx supabase@2.120.0 secrets set --env-file YOUR_PRIVATE_SECRET_FILE
npx supabase@2.120.0 functions deploy google-oauth --no-verify-jwt
npx supabase@2.120.0 functions deploy sheets-worker --no-verify-jwt
```

The OAuth function validates user bearer authentication and single-use state; the worker validates its dedicated scheduler secret. Do not remove these checks. Configure the approved origin and exact OAuth callback. Provision the scheduler with `supabase/ops/schedule-sync.sql` after reviewing its Vault names and URL. This file is intentionally outside automatic migrations. Run the scheduler independently of frontend hosting. This follows [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) and [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) with Vault-backed secrets.

## Production release gate

Before any approved production release: verify staging apply and zero unexplained drift; run Auth/REST tests with separate accounts; verify OAuth and Google failure/retry cases; approve every workbook; test backup restoration; record migration versions and release commit; review grants, CSP and origins. Then explicitly approve the linked production project, migration dry-run and worker/frontend deployments. No such release was performed in this workspace.

Back up canonical Supabase data using the project's supported backup/PITR plan, and rehearse restoration to a separate project. Sheets are projections, not backups. Preserve encryption keys securely with your recovery material; rotating the key requires re-encrypting tokens through a reviewed backend procedure or reconnecting OAuth. Restore migrations and data together; reauthorize grants, reconnect Google and reconcile only approved workbooks after recovery.
# Managed register views

Apply `20261026052137_managed_register_views.sql` after the parent-group permission
migration and before its frontend. Existing views remain untouched until a
superadmin saves a managed rule. See [managed view setup, precedence and rollback](managed-register-views.md).
