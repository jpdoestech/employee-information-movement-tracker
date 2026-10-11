# Employee Information & Movement Tracker

Standalone React/TypeScript application with Supabase Auth/PostgreSQL and an asynchronous Google Sheets worker. Implements the authoritative v1.8 specification in `docs/`. Reference applications were inspected read-only; no HRIS or cooperative finance modules are included.

## Run locally

Requires Node.js 24 and npm. The committed lockfile defines dependencies.

On Windows, double-click `setup-local.bat` once, then `start-local.bat`. Setup installs the locked dependencies and creates a synthetic-demo `.env.local` only if none exists. Existing environment settings are preserved. Start opens the browser, uses the next available port if 5173 is occupied, and keeps the server running until you press Ctrl+C in its window. Neither file starts Supabase, runs migrations, or changes a hosted database. For connected mode, configure this standalone project's public Supabase credentials and set `VITE_DEMO_MODE=false` in `.env.local`. Use `--no-pause` when invoking either batch file from a terminal or automation.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set the new project's public Supabase URL/publishable key in `.env.local`. Never put service-role, Google client secrets or refresh tokens in `VITE_*` variables. Without a connection, the sign-in screen offers an explicitly labelled synthetic preview. Preview data is fictional and its permissions are simulated; use database tests to verify enforcement.

```powershell
npm run build
npm test
npm run test:db
npx playwright install chromium
npm run test:e2e
npx deno@2 check supabase/functions/google-oauth/index.ts supabase/functions/sheets-worker/index.ts
```

The disposable native database harness applies every SQL migration, exercises real PostgreSQL ACL/RLS/transactions/constraints and writes `.test-db/reports/verification/database.json`. It simulates `auth.uid()` and does **not** replace full Supabase Auth/REST testing. For Docker-backed local Supabase:

```powershell
npm install --no-save --package-lock=false supabase@2.120.0
npx supabase@2.120.0 start
npx supabase@2.120.0 db reset
npx supabase@2.120.0 db lint --level error
node .test-db/scripts/test-rest.mjs --local-cli
npx supabase@2.120.0 migration list --local
npx supabase@2.120.0 db diff --local --schema public,app_private
```

`db reset` destroys the disposable local database. The REST harness creates synthetic accounts/fixtures; reset afterward. CI runs both native tests and a separate full Supabase job. No production migrations or deployment run automatically.

## Implementation

- `src/components/`: shared single/multiple search picker, filter bar, authorized table, live column layout preview, dialogs and dynamic value editors.
- `src/screens/`: employees, seven movement types, atomic bulk updates, organization, dynamic fields, permissions and workbook policies. Saved layouts belong to the signed-in user.
- `supabase/migrations/`: ordered schema and secured RPCs; the source of truth for database changes.
- `supabase/functions/`: backend OAuth and leased, retryable workbook reconciliation. Supabase remains canonical.
- `.test-db/`: permission/data/concurrency tests, responsive browser tests and disposable Auth/REST checks.

Permission evaluation intersects organization C/R/U/D, effective primary assignment, field applicability and field/group policy. Explicit denies, restricted fields and dynamic inheritance are enforced in SQL. Raw tables are unavailable to ordinary API users; authorized projections govern search, counts, exports and history. Writes require revisions and produce transactional audit/outbox records.

Bounded operations: 100 employees per atomic bulk update; 100 rows per page; 100 visible option results; 10,000 rows per CSV export; 1,000 current employees per workbook reconciliation. Expand these deliberately after staging measurements. Primary intervals are start-inclusive/end-exclusive; business dates use Asia/Manila. Additional assignments do not grant primary branch access.

## Philippine addresses

The default Address group provides Home Address, Current Address and emergency contact details. Search the supplied local official lists nationwide, with hierarchy validation in both the form and PostgreSQL. Postal codes remain manual. Read [address integration and migration notes](docs/philippine-addresses.md) before applying the new migration in connected mode.

## Delivery and evidence

Read [architecture](docs/architecture.md), [reference review](docs/design-reference.md), [deployment](docs/deployment.md), [Google synchronization](docs/google-sync.md), [security](docs/security.md), and [acceptance evidence](docs/acceptance.md).

The current [v1.8 review and remaining work](docs/requirements-status.md) distinguishes implemented features, local evidence and external release gates. Field creation/edit previews resolve authorized applicability without creating data. Column rules use type-specific values and operators; matching active/inactive definitions can be reused or reactivated through the existing confirmed save flow.

The native workload defaults to 20 simultaneous users. For 50 on PowerShell, run `$env:TEST_CONCURRENCY_USERS='50'; npm run test:db`; remove that variable afterward with `Remove-Item Env:TEST_CONCURRENCY_USERS`. Bash equivalent: `TEST_CONCURRENCY_USERS=50 npm run test:db`. Values outside 20–50 are rejected. The generated database report includes transaction latencies, expected revision conflicts, unexpected errors, outbox backlog and worker claims. It makes no live Google requests and is not a production capacity guarantee.

Local implementation is verified separately from deployment. A new Supabase project, Google OAuth consent/account, approved workbook policies and staging/production targets remain necessary for live verification. Reference databases are never connected. Obtain explicit approval before production SQL or deployment.

All test source, runners, configurations and generated evidence are under `.test-db/`: `unit/`, `e2e/`, `scripts/`, `runs/`, `results/`, `reports/` and `cache/`. Source/configuration are tracked; generated database files, reports, traces and caches are ignored. Existing archived test databases in `.test-db/` are preserved.
