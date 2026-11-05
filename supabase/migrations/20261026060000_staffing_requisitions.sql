-- Approved staffing requirements only; hiring workflow and applicant records are separate concerns.
create table public.staffing_requisitions(
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 reference text not null check(length(btrim(reference)) between 1 and 80),
 employment_type text not null check(length(btrim(employment_type)) between 1 and 100),
 required_headcount integer not null check(required_headcount between 1 and 100000),
 starts_on date not null, ends_on date, active boolean not null default true,
 row_version bigint not null default 1, created_at timestamptz not null default now(),
 check(ends_on is null or ends_on>starts_on), unique(client_id,reference,employment_type)
);
alter table public.staffing_requisitions enable row level security;
revoke all on public.staffing_requisitions from public,anon,authenticated;
create index on public.staffing_requisitions(client_id,starts_on) where active;

create function app_private.readable_staffing() returns setof public.staffing_requisitions
language sql stable security definer set search_path='' as $$
 with requested_clients as materialized (
 select c.* from public.clients c join (select distinct client_id from public.staffing_requisitions) r on r.client_id=c.id
 ), scoped_clients as materialized (
 select c.* from requested_clients c where app_private.module_access('organization','view')
 and app_private.scope_access('R','client',c.branch_id,c.id)
 and (app_private.is_super() or not exists(select 1 from app_private.access_record_rules where user_id=auth.uid() and mode<>'organization'))
 ), clients as materialized (
 select c.id from scoped_clients c where app_private.field_access('client','R','client',c.branch_id,c.id)
 and app_private.field_access('employment_type','R','client',c.branch_id,c.id)
 ) select r.* from public.staffing_requisitions r join clients c on c.id=r.client_id
$$;
revoke all on function app_private.readable_staffing() from public,anon,authenticated;

create function public.staffing_page(q jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare lim int:=coalesce((q->>'limit')::int,25); off int:=coalesce((q->>'offset')::int,0); result jsonb; begin
 if not app_private.module_access('organization','view') then raise exception using errcode='42501',message='Access denied'; end if;
 if lim not in (10,25,50,100) or off<0 or length(coalesce(q->>'search',''))>500 then raise exception 'Invalid pagination or search'; end if;
 with visible as materialized (
 select to_jsonb(r)||jsonb_build_object('label',r.reference,'client_label',c.name,'effective_on',r.starts_on,
  'context',case when app_private.field_access('branch','R','client',c.branch_id,c.id) then b.name end) row,
  case when app_private.field_access('branch','R','client',c.branch_id,c.id) then c.branch_id end branch_id
 from app_private.readable_staffing() r join public.clients c on c.id=r.client_id join public.branches b on b.id=c.branch_id
 ), filtered as materialized (
 select row from visible where (coalesce(q->>'search','')='' or position(lower(q->>'search') in lower(concat_ws(' ',row->>'reference',row->>'client_label',row->>'employment_type',row->>'context')))>0)
 and (coalesce(jsonb_array_length(q->'branches'),0)=0 or branch_id::text in(select jsonb_array_elements_text(q->'branches')))
 and (coalesce(jsonb_array_length(q->'clients'),0)=0 or row->>'client_id' in(select jsonb_array_elements_text(q->'clients')))
 and (coalesce(q->>'from','')='' or (row->>'starts_on')::date>=(q->>'from')::date)
 and (coalesce(q->>'to','')='' or (row->>'starts_on')::date<=(q->>'to')::date)
 ), ordered as (
 select row,row->>case when q->>'sort' in ('label','client_label','employment_type','effective_on') then q->>'sort' else 'effective_on' end sort_value from filtered
 ), page as (
 select row from ordered order by case when q->>'direction'='asc' then sort_value end asc,
 case when coalesce(q->>'direction','desc')='desc' then sort_value end desc,row->>'id' limit lim offset off
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(row) from page),'[]'),'total',(select count(*) from filtered)) into result;
 return result;
end $$;

create function public.set_staffing_requisition(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rid uuid:=(p->>'id')::uuid; cid uuid:=(p->>'client_id')::uuid;
 prior public.write_requests; existing public.staffing_requisitions; client public.clients; result jsonb;
begin
 perform 1 from public.system_state where id=true for update;
 if not app_private.capability('organization_manage') then raise exception using errcode='42501',message='Organization management access required'; end if;
 if request_id is null or rid is null then raise exception 'A record ID and request ID are required'; end if;
 select * into client from public.clients where id=cid and active;
 if client.id is null or not exists(select 1 from public.branches where id=client.branch_id and active)
 or not app_private.scope_access('U','client',client.branch_id,cid)
 or not app_private.module_access('organization','view') or not app_private.field_access('client','R','client',client.branch_id,cid)
 or not app_private.field_access('employment_type','R','client',client.branch_id,cid)
 or not app_private.scope_access('R','client',client.branch_id,cid)
 or not app_private.is_super() and exists(select 1 from app_private.access_record_rules where user_id=actor and mode<>'organization') then
  raise exception using errcode='42501',message='Client staffing is unavailable';
 end if;
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=set_staffing_requisition.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'staffing_requisition' or prior.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return prior.result;
 end if;
 select * into existing from public.staffing_requisitions where id=rid for update;
 if existing.id is not null and (existing.client_id<>cid or existing.row_version is distinct from (p->>'expected_version')::bigint)
 or existing.id is null and coalesce((p->>'expected_version')::bigint,0)<>0 then raise exception using errcode='40001',message='PRF changed; reload before saving'; end if;
 if existing.id is null or p->>'employment_type' is distinct from existing.employment_type then
  if not exists(select 1 from public.field_definitions f where f.key='employment_type' and f.active and f.options ? (p->>'employment_type')) then raise exception 'Choose a configured Employment Type'; end if;
 end if;
 if jsonb_typeof(p->'active') is distinct from 'boolean' or (p->>'starts_on')::date is null or nullif(btrim(p->>'reference'),'') is null
 or (p->>'required_headcount')::int is null then raise exception 'Complete the PRF staffing requirement'; end if;
 insert into public.staffing_requisitions(id,client_id,reference,employment_type,required_headcount,starts_on,ends_on,active)
 values(rid,cid,btrim(p->>'reference'),p->>'employment_type',(p->>'required_headcount')::int,(p->>'starts_on')::date,(p->>'ends_on')::date,(p->>'active')::boolean)
 on conflict(id) do update set reference=excluded.reference,employment_type=excluded.employment_type,required_headcount=excluded.required_headcount,
 starts_on=excluded.starts_on,ends_on=excluded.ends_on,active=excluded.active,row_version=public.staffing_requisitions.row_version+1;
 perform app_private.audit('staffing_requisition',rid,case when existing.id is null then 'create' else 'update' end,array['staffing_requirement']);
 update public.system_state set revision=revision+1 where id=true;
 select to_jsonb(r) into result from public.staffing_requisitions r where id=rid;
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'staffing_requisition',p,result);
 return result;
end $$;
revoke all on function public.staffing_page(jsonb),public.set_staffing_requisition(jsonb,uuid) from public,anon;
grant execute on function public.staffing_page(jsonb),public.set_staffing_requisition(jsonb,uuid) to authenticated;
