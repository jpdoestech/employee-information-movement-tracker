-- Preserve existing RPC callers; new operations retain the original validators.
do $$ begin
 execute replace(pg_get_functiondef('public.worker_command(text,jsonb)'::regprocedure),
  'FUNCTION public.worker_command(', 'FUNCTION app_private.worker_command_before_audit(');
 execute replace(replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),
  'FUNCTION public.tracker_mutate(', 'FUNCTION app_private.tracker_mutate_before_audit('),
  'tracker_mutate.request_id', 'tracker_mutate_before_audit.request_id');
end $$;

alter table app_private.google_connection add column owner_permission_id text;

create function app_private.export_schema_signature() returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(
  (select jsonb_agg(to_jsonb(f) order by f.id) from public.field_definitions f),
  (select jsonb_agg(to_jsonb(g) order by g.id) from public.field_groups g),
  (select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.field_scope_targets t)
 )::text)
$$;
-- Capture the schema signature in the same statement/snapshot as exported values.
do $$ declare definition text; needle text:='''revision'',(select system_state.revision from public.system_state),'; begin
 definition:=pg_get_functiondef('app_private.worker_command_before_audit(text,jsonb)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Review snapshot before adding schema guard'; end if;
 execute replace(definition,needle,'''schema_signature'',app_private.export_schema_signature(),'||needle);
end $$;

create or replace function public.worker_command(operation text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare connection app_private.google_connection; begin
 if operation='publish_guard' then
  if p->>'schema_signature' is distinct from app_private.export_schema_signature()
   or not exists(select 1 from public.branch_spreadsheets where id=(p->>'id')::uuid
    and approved and row_version=(p->>'row_version')::bigint) then
   raise exception 'Snapshot or export policy changed; rebuild before publishing';
  end if;
  return '{}';
 elsif operation='store_connection' then
  perform 1 from public.system_state where id=true for update;
  if nullif(btrim(p->>'owner_permission_id'),'') is null
   or nullif(btrim(p->>'owner_email'),'') is null
   or nullif(p->>'encrypted_refresh_token','') is null then raise exception 'Verified Google account identity is required'; end if;
  select * into connection from app_private.google_connection where id=true for update;
  if connection.id is not null and (
   connection.owner_permission_id is not null and connection.owner_permission_id is distinct from p->>'owner_permission_id'
   or connection.owner_permission_id is null and connection.folder_id is not null
    and connection.folder_id is distinct from p->>'verified_folder_id') then
   raise exception 'Reconnect the original Google account; changing accounts requires a separate workbook migration';
  end if;
  insert into app_private.google_connection(id,encrypted_refresh_token,owner_email,owner_permission_id)
  values(true,p->>'encrypted_refresh_token',p->>'owner_email',p->>'owner_permission_id')
  on conflict(id) do update set encrypted_refresh_token=excluded.encrypted_refresh_token,
   owner_email=excluded.owner_email,owner_permission_id=excluded.owner_permission_id,updated_at=now();
  return '{}';
 end if;
 return app_private.worker_command_before_audit(operation,p);
end $$;

create or replace function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.write_requests; action text; result jsonb; begin
 if operation<>'policy_batch' then return app_private.tracker_mutate_before_audit(operation,p,request_id); end if;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can administer permissions'; end if;
 if request_id is null or jsonb_typeof(p->'actions') is distinct from 'array' then raise exception 'Choose permission actions and a request ID'; end if;
 if jsonb_array_length(p->'actions') not between 1 and 4
  or exists(select 1 from jsonb_array_elements_text(p->'actions') a where a not in ('C','R','U','D') or a is null)
  or (select count(distinct a) from jsonb_array_elements_text(p->'actions') a)<>jsonb_array_length(p->'actions') then
  raise exception 'Choose distinct supported permission actions';
 end if;
 perform 1 from public.system_state where id=true for update;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
 select * into existing from public.write_requests w where w.actor_id=auth.uid() and w.request_id=tracker_mutate.request_id;
 if existing.actor_id is not null then
  if existing.operation<>operation or existing.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return existing.result;
 end if;
 for action in select jsonb_array_elements_text(p->'actions') loop
  perform app_private.tracker_mutate_before_audit('policy',(p-'actions')||jsonb_build_object('action',action),
   md5('policy_batch:'||request_id::text||':'||action)::uuid);
 end loop;
 result:=jsonb_build_object('updated',jsonb_array_length(p->'actions'));
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(auth.uid(),request_id,operation,p,result);
 return result;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.worker_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.worker_command(text,jsonb) to service_role;
revoke all on function public.tracker_mutate(text,jsonb,uuid) from public,anon;
grant execute on function public.tracker_mutate(text,jsonb,uuid) to authenticated;
