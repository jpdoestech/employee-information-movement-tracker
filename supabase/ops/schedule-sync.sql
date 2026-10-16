-- MANUAL, APPROVED RELEASE STEP. Never commit secret values.
-- Enable pg_cron and pg_net through trusted Supabase administration first.
-- Store these two Vault secrets using the trusted dashboard:
--   eimt_worker_url = https://PROJECT.supabase.co/functions/v1/sheets-worker
--   eimt_worker_secret = the backend WORKER_SECRET
-- Inspect existing cron.job rows before scheduling to prevent duplicates.
select cron.schedule(
  'eimt-reconcile-approved-workbooks',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='eimt_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='eimt_worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  -- Avoid idle Edge invocations/HTTP logs; the worker still owns lease fencing.
  where not exists(select 1 from public.sync_outbox where status='processing' and lease_until>now())
  and (
    exists(select 1 from public.system_state where last_sync_date is distinct from app_private.today())
    or exists(select 1 from public.sync_outbox
      where (status='pending' or status='processing' and lease_until<=now()) and next_retry<=now())
  );
  $job$
);
-- Inspect cron.job_run_details and net._http_response through trusted administration.
-- Stop a schedule with: select cron.unschedule('eimt-reconcile-approved-workbooks');
