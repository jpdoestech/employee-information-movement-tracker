-- Apps Script supplies an ephemeral token; never persist that token.
alter table app_private.google_connection
 add column auth_mode text not null default 'oauth' check(auth_mode in ('oauth','apps_script')),
 alter column encrypted_refresh_token drop not null;
alter table app_private.google_connection add constraint google_connection_token_mode
 check((auth_mode='oauth' and encrypted_refresh_token is not null)
    or (auth_mode='apps_script' and encrypted_refresh_token is null));

do $$ begin
 execute replace(pg_get_functiondef('public.worker_command(text,jsonb)'::regprocedure),
  'FUNCTION public.worker_command(', 'FUNCTION app_private.worker_command_before_apps_script(');
end $$;

create or replace function public.worker_command(operation text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare connection app_private.google_connection; result jsonb; begin
 if operation='bind_apps_script' then
  perform 1 from public.system_state where id=true for update;
  if nullif(btrim(p->>'owner_permission_id'),'') is null
   or nullif(btrim(p->>'owner_email'),'') is null then
   raise exception 'Verified Google account identity is required';
  end if;
  select * into connection from app_private.google_connection where id=true for update;
  if connection.id is not null and (
   connection.owner_permission_id is not null and connection.owner_permission_id is distinct from p->>'owner_permission_id'
   or connection.owner_permission_id is null and connection.folder_id is not null
    and connection.folder_id is distinct from p->>'verified_folder_id') then
   raise exception 'Use the original Google account; changing owners requires a separate workbook migration';
  end if;
  insert into app_private.google_connection(id,owner_email,owner_permission_id,auth_mode,encrypted_refresh_token)
   values(true,p->>'owner_email',p->>'owner_permission_id','apps_script',null)
  on conflict(id) do update set owner_email=excluded.owner_email,
   owner_permission_id=excluded.owner_permission_id,auth_mode='apps_script',
   encrypted_refresh_token=null,updated_at=now();
  return '{}';
 elsif operation='store_connection' then
  -- The previous validator still owns OAuth account binding and token checks.
  perform 1 from public.system_state where id=true for update;
  update app_private.google_connection set auth_mode='oauth',encrypted_refresh_token=p->>'encrypted_refresh_token'
   where id=true and nullif(p->>'encrypted_refresh_token','') is not null;
 end if;
 result:=app_private.worker_command_before_apps_script(operation,p);
 return result;
end $$;
revoke all on function app_private.worker_command_before_apps_script(text,jsonb) from public,anon,authenticated;
revoke all on function public.worker_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.worker_command(text,jsonb) to service_role;
