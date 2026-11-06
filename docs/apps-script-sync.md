# Personal Google account sync with Apps Script

This replaces the manually configured Google Cloud OAuth client with an owner-run
standalone Apps Script. Google still asks the owner to authorize the script once.
Employee edits now use [incremental synchronization](incremental-google-sync.md);
the existing owner script and five-minute trigger remain compatible.
No OAuth client ID, client secret, callback, refresh-token encryption key or public
Apps Script web app is needed. The supplied `.gs/` employee form is a read-only
reference; do not install its public submission/lookup endpoints for tracker sync.

Supabase remains authoritative. The script sends its short-lived Google access
token over HTTPS to the secret-protected worker every five minutes. The token is
used in memory and never stored or returned to the browser. The worker continues
to enforce workbook approvals, field/row projections, sharing checks, leases,
backoff, literal cell values, incremental row updates and paged reconciliation. Manual Reconcile
queues work for the next trigger; this is one-way asynchronous synchronization.

## Backend preparation

1. Use the tracker project's Supabase account, not either reference project's.
   The current frontend URL identifies project `kynbaulanxfuivnxyxjk`; verify the
   target before deploying. Apply all pending repository migrations in order,
   including `20261028000000_apps_script_connection.sql` and
   `20261028010000_existing_spreadsheet_mapping.sql` and
   `20261028020000_branch_export_columns.sql`, database first.
2. Generate a random worker secret with at least 32 characters, stored privately.
   In Supabase Edge Function secrets set `GOOGLE_SYNC_MODE=apps_script` and
   `WORKER_SECRET` to that secret. Retain the correct `FRONTEND_ORIGIN` for other
   deployed functions. Supabase supplies its own service-role key and URL.
3. Deploy the updated worker to that explicitly selected project:

   ```powershell
   npx supabase@2.120.0 functions deploy sheets-worker --project-ref kynbaulanxfuivnxyxjk --no-verify-jwt
   ```

   If `google-oauth` is already deployed, redeploy its updated source too; it
   refuses the legacy connection flow when `GOOGLE_SYNC_MODE=apps_script`.
   Publish the updated frontend after the migration.
4. Disable an existing `eimt-reconcile-approved-workbooks` pg_cron job through
   trusted administration. Do not run `supabase/ops/schedule-sync.sql` in this mode:
   it cannot supply an Apps Script owner's token. The Apps Script trigger is the
   scheduler. Existing Vault secrets may remain for rollback, subject to your
   secret-retention policy.

## Google setup

1. Sign into the personal Google account that will own all branch workbooks and
   open [Apps Script](https://script.google.com/). Create a new standalone project.
   Keep this project separate from the reference employee form.
2. Paste [Sync.gs](../google-apps-script/Sync.gs) into its code file. In Project
   Settings enable **Show appsscript.json manifest file in editor** and replace
   the manifest with [appsscript.json](../google-apps-script/appsscript.json).
   The manifest enables Drive v3 and Sheets v4 advanced services and their APIs
   for the default Apps Script Cloud project. If you choose a standard Cloud
   project, enable those two APIs there as well.
3. In **Project Settings → Script Properties** set:

   | Property | Value |
   | --- | --- |
   | `TRACKER_WORKER_URL` | `https://kynbaulanxfuivnxyxjk.supabase.co/functions/v1/sheets-worker` |
   | `TRACKER_WORKER_SECRET` | The same private value as Supabase `WORKER_SECRET` |

   Do not put a Supabase service-role key in Apps Script or the browser. Limit
   script editor access: editors can read the worker secret and alter the script.
4. Review the code and properties, then run **setupTrackerSync** manually and
   authorize Google's permission prompt. This explicitly binds the verified
   owner and creates one five-minute trigger. No **Deploy as web app** step is
   needed. Repeat setup safely with the same account; it retains the folder and
   workbook IDs. Setup does not approve fields, create workbooks or export rows.
5. As tracker Superadmin, open **Sheets sync → Review export policy**. Paste a
   Google Sheets URL or spreadsheet ID to use an existing spreadsheet owned by
   the connected account, including a new blank spreadsheet you create yourself.
   Leave it blank to let the worker create a new one. Each branch/Head Office
   scope needs a different spreadsheet. Review each workbook's approved
   clients, direct primary roster, non-sensitive fields (including Employee ID),
   metadata and sharing emails. Save using the normal Continue/Cancel confirmation.
   The four managed tab names are reserved: their existing contents are replaced.
   Unrelated tabs and the title of a user-selected spreadsheet are preserved; it
   stays in its existing folder. A saved destination is fixed. Replacing an
   already mapped spreadsheet needs a reviewed migration and cleanup of the old
   exported copy, rather than silently leaving stale employee data behind.
6. Choose **Reconcile approved workbooks**, then run **syncTracker** once manually
   or wait for the trigger. Verify the folder, four managed tabs, branch membership,
   literal values and last-success status in real Google Sheets before enabling
   routine use. The owner must configure Drive sharing separately; approval does
   not grant access automatically.

The script requests Drive and Sheets scopes for its owner, plus external-request
and trigger-management scopes. Drive access is broader than the old `drive.file`
grant, so use a dedicated owner account where practical. Tokens and employee data
must never appear in logs. Google authorization, quotas, account restrictions and
Apps Script trigger limits still apply. Apps Script authorization is not an
authentication bypass. See Google's [authorization guide](https://developers.google.com/apps-script/guides/services/authorization)
and [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable).

## Dynamic branch columns

Employee columns come from Field Builder, not the reference form's hardcoded
header list or fixed spreadsheet column letters. Each workbook has its own
approved field keys and branch/client scopes. Headers follow Field Builder order,
use current labels with immutable keys, and omit inactive groups, inactive fields
and fields that do not apply to the approved roster scope. Renaming a field keeps
its key and employee matching intact. Employee updates use the current authorized
projection; schema/policy changes rebuild managed headers and rows in bounded
pages, including on an empty roster. A new field appears after it is explicitly approved for that workbook;
adding a field never automatically authorizes a new external data disclosure.

The fixed columns are synchronization identity/version metadata required by the
application specification. Ordinary employee columns remain configurable. Edits
and added columns directly inside the four managed tabs are currently overwritten
by reconciliation. Keep independent calculations and notes in other tabs unless
a separately reviewed preservation design is added; they never flow into Supabase.

## Failures, stopping and rollback

Use **Executions** in Apps Script for trigger failures and **Sheets sync** for
workbook failures, suspended sharing and backlog. A failed trigger sends one
request; database retries retain their existing backoff and eight-attempt limit.
Fix the issue before using Reconcile. An expired/revoked Google grant needs the
owner to reauthorize the script. A different Google owner is rejected; changing
owners requires a reviewed folder/workbook migration. Only the installing account
can manage its own installable triggers; do not install this project under several
accounts. Duplicate invocations are still fenced by the database lease.

Run **stopTrackerSync** to delete this account's sync triggers without changing
employees or workbooks. To rotate the worker secret, stop the trigger, update both
Supabase and Script Properties, then rerun setup. For a backend rollback, retain
the additive migration and workbook mappings. Set the backend mode to legacy,
reconnect the original owner through the legacy OAuth endpoint with its required
secrets, and only then restore the pg_cron scheduler and previous OAuth frontend.
Apps Script mode intentionally removes the old stored refresh token.

Local tests cannot prove Google authorization, API enablement, hosted migrations,
trigger delivery, quota behavior or actual Sheets writes. Complete those live
checks in the intended environment.

Local verification covers the production build, Deno checking, full unit suite,
focused native PostgreSQL checks and eight desktop/phone/tablet/short-landscape
browser checks. Native checks cover token-free owner binding, service-only access,
versioned/idempotent existing-sheet mapping, and dynamic branch headers after
approved field additions, renames, ordering, deactivation and scope differences.

## Hosted setup on 2026-10-28

Applied all three sync migrations to tracker project `kynbaulanxfuivnxyxjk` after
a migration-history check and dry run. A follow-up dry run reports no pending
migrations, and hosted database lint reports no errors. Configured Apps Script
mode and a random backend worker secret stored outside Git, and deployed
`sheets-worker` version 1. No legacy Google OAuth function or pg_cron job was
present, so neither needed removal.

Published the frontend at `https://strellas-employees.vercel.app` with deployment
`dpl_75pFUw5p2MomicBKTpjMQFMjmpHy`. The deployed bundle contains the Apps Script
instructions and configurable spreadsheet mapping for the correct tracker
project. Worker smoke checks return 401 without its secret and 400 without a
Google token, without claiming work or connecting Google.

Google owner authorization and Script Properties were completed after backend
setup. Davao subsequently completed its first worker-confirmed Sheets sync at
11:24 Manila time on 2026-10-28. Davao's worker-provisioned spreadsheet and the
user-selected Head Office spreadsheet have different IDs. Head Office remains
suspended pending its ownership/sharing check; Sta. Cruz remains unapproved.
Employee cell contents have not been visually reviewed in Google Sheets.

The follow-up migration `20261028030000_sync_failure_reasons.sql` and worker
version 2 distinguish ownership mismatch, unapproved individual recipients and
unsafe sharing using fixed messages without emails, tokens or upstream bodies.
Only failed/suspended workbook cards display the stored error, so an old error
does not imply that a newly pending workbook has failed again. Frontend deployment
`dpl_6865ddXxqDqKfKDTy2iS5GGUH93f` publishes those messages. Focused worker tests,
four native database checks, eight responsive browser checks, Deno checking and
the hosted frontend build passed for this change.

Deployment used the local working tree; commit the reviewed changes to preserve
the deployed source in Git. The
ignored `.test-db/reports/verification/google-sync-deployment.json` records the
deployment IDs, source hashes and bounded checks without secrets or employee data.
