-- Backend-only progress holds UUIDs and schema versions, never employee values.
create table app_private.workbook_sync_state(
 workbook_id uuid primary key references public.branch_spreadsheets(id) on delete cascade,
 schema_signature text not null, policy_version bigint not null,
 full_revision bigint not null, active boolean not null default true,
 reset_pending boolean not null default false, cursor uuid, seen_ids uuid[] not null default '{}', last_batch_key text
);
alter table app_private.workbook_sync_state enable row level security;
revoke all on app_private.workbook_sync_state from public,anon,authenticated;

-- Reuse the canonical authorized projection, with bounded keyset/delta inputs.
-- Legacy snapshot callers retain their existing 1,000-row guard.
do $$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('app_private.worker_command_before_audit(text,jsonb)'::regprocedure);
 needle:=$old$select e.*,pl.target,pl.branch_id,pl.client_id from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) pl$old$;
 if strpos(definition,needle)=0 then raise exception 'Review canonical roster before adding incremental sync'; end if;
 definition:=replace(definition,needle,$new$select e.*,pl.target,pl.branch_id,pl.client_id from (
  select candidate.* from public.employees candidate
  where (not p ? 'sync_ids' or candidate.id=any(array(select jsonb_array_elements_text(p->'sync_ids'))::uuid[]))
   and (not p ? 'sync_page' or p->>'after' is null or candidate.id>(p->>'after')::uuid)
  order by candidate.id
 ) e cross join lateral app_private.placement(e.id,app_private.today()) pl$new$);
 -- Apply LIMIT after authorized membership, including empty branches.
 needle:=$old$pl.client_id=any(b.allowed_clients)))$old$;
 if strpos(definition,needle)=0 then raise exception 'Review canonical membership before adding keyset paging'; end if;
 definition:=replace(definition,needle,needle||' order by e.id limit case when p ? ''sync_page'' then 200 else null end');
 execute definition;
 execute replace(pg_get_functiondef('public.worker_command(text,jsonb)'::regprocedure),
  'FUNCTION public.worker_command(', 'FUNCTION app_private.worker_command_before_incremental(');
end $$;

create function app_private.sheet_sync_guard(p jsonb) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.sync_outbox where lease_token=(p->>'token')::uuid
  and status='processing' and lease_until>now()) then raise exception 'Worker lease is expired'; end if;
 perform app_private.worker_command_before_incremental('publish_guard',p);
end $$;

create or replace function public.worker_command(operation text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; s app_private.workbook_sync_state; events jsonb; keys uuid[]; begin
 if operation='sync_due' then
  return to_jsonb(exists(select 1 from public.system_state where last_sync_date is distinct from app_private.today())
   or exists(select 1 from public.sync_outbox where (status='pending' or status='processing' and lease_until<=now()) and next_retry<=now()));
 elsif operation='claim' then
  result:=app_private.worker_command_before_incremental(operation,p);
  if result is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.entity_id,'revision',o.revision,'action',o.action,
   'branches',o.branch_routes,'head_office',o.head_office_route,
   'full',not exists(select 1 from public.employees e where e.id=o.entity_id)) order by o.id),'[]')
  into events from public.sync_outbox o where o.id=any(array(select jsonb_array_elements_text(result->'job_ids'))::bigint[]);
  return result||jsonb_build_object('events',events,'batch_key',md5((result->'job_ids')::text));
 elsif operation='workbooks' then
  result:=app_private.worker_command_before_incremental(operation,p);
  return (select coalesce(jsonb_agg(book||jsonb_build_object('completed_batch',state_row.last_batch_key,'synced_policy_version',state_row.policy_version)),'[]')
   from jsonb_array_elements(result) book left join app_private.workbook_sync_state state_row on state_row.workbook_id=(book->>'id')::uuid);
 elsif operation in ('sync_snapshot','sync_page') then
  if operation='sync_snapshot' then
   if jsonb_typeof(p->'employee_ids') is distinct from 'array' or jsonb_array_length(p->'employee_ids')>200 then
    raise exception 'Choose at most 200 employee IDs per delta'; end if;
   result:=app_private.worker_command_before_incremental('snapshot',p||jsonb_build_object('sync_ids',p->'employee_ids'));
  else
   result:=app_private.worker_command_before_incremental('snapshot',p||jsonb_build_object('sync_page',true));
  end if;
  select coalesce(array_agg((e->>'id')::uuid order by (e->>'id')::uuid),'{}') into keys from jsonb_array_elements(result->'rows') e;
  return result||jsonb_build_object('next_cursor',keys[array_length(keys,1)],'has_more',operation='sync_page' and cardinality(keys)=200);
 elsif operation='sync_state' then
  return (select to_jsonb(state) from app_private.workbook_sync_state state where workbook_id=(p->>'id')::uuid);
 elsif operation='sync_done' then
  perform app_private.sheet_sync_guard(p);
  update app_private.workbook_sync_state set last_batch_key=p->>'batch_key' where workbook_id=(p->>'id')::uuid and not active;
  return '{}';
 elsif operation='sync_begin' then
  perform app_private.sheet_sync_guard(p);
  insert into app_private.workbook_sync_state(workbook_id,schema_signature,policy_version,full_revision,reset_pending)
   values((p->>'id')::uuid,p->>'schema_signature',(p->>'row_version')::bigint,(p->>'full_revision')::bigint,coalesce((p->>'reset')::boolean,false))
  on conflict(workbook_id) do update set schema_signature=excluded.schema_signature,policy_version=excluded.policy_version,
   full_revision=excluded.full_revision,active=true,reset_pending=excluded.reset_pending,cursor=null,seen_ids='{}',last_batch_key=null
  returning * into s;
  return to_jsonb(s);
 elsif operation='sync_checkpoint' then
  perform app_private.sheet_sync_guard(p);
  select * into s from app_private.workbook_sync_state where workbook_id=(p->>'id')::uuid for update;
  if not s.active or s.full_revision is distinct from (p->>'full_revision')::bigint
   or s.cursor is distinct from (p->>'expected_cursor')::uuid then raise exception 'Rebuild progress changed'; end if;
  update app_private.workbook_sync_state set
   cursor=case when p ? 'cursor' then (p->>'cursor')::uuid else s.cursor end,
   reset_pending=case when coalesce((p->>'initialized')::boolean,false) then false else s.reset_pending end,
   seen_ids=case when coalesce((p->>'finish')::boolean,false) then '{}'::uuid[] else
    array(select distinct x from unnest(s.seen_ids||array(select jsonb_array_elements_text(coalesce(p->'add_ids','[]')))::uuid[]) x
     where not x=any(array(select jsonb_array_elements_text(coalesce(p->'remove_ids','[]')))::uuid[])) end,
   active=not coalesce((p->>'finish')::boolean,false)
   where workbook_id=s.workbook_id returning * into s;
  return to_jsonb(s);
 elsif operation='defer' then
  if not exists(select 1 from public.sync_outbox where lease_token=(p->>'token')::uuid and status='processing' and lease_until>now()) then
   raise exception 'Worker lease is expired'; end if;
  update public.sync_outbox set status='pending',attempts=greatest(0,attempts-1),lease_token=null,lease_until=null,
   next_retry=now()+interval '1 minute' where lease_token=(p->>'token')::uuid and status='processing';
  return '{}';
 end if;
 return app_private.worker_command_before_incremental(operation,p);
end $$;
revoke all on function app_private.sheet_sync_guard(jsonb) from public,anon,authenticated;
revoke all on function app_private.worker_command_before_incremental(text,jsonb) from public,anon,authenticated;
revoke all on function public.worker_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.worker_command(text,jsonb) to service_role;
