-- Display preferences never grant row or field access. Null retains client defaults.
create table public.user_quick_filters (
 user_id uuid primary key references public.user_profiles(id),
 filter_keys text[],
 row_version bigint not null default 1,
 check(filter_keys is null or cardinality(filter_keys)<=5)
);
alter table public.user_quick_filters enable row level security;
revoke all on public.user_quick_filters from public,anon,authenticated;

create function public.quick_filter_settings(q jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare subject uuid:=coalesce((q->>'user_id')::uuid,auth.uid()); cfg public.user_quick_filters;
begin
 if not app_private.is_super() then
  raise exception using errcode='42501',message='Quick filter configuration is not authorized';
 end if;
 if not exists(select 1 from public.user_profiles where id=subject) then raise exception 'Account is unavailable'; end if;
 select * into cfg from public.user_quick_filters where user_id=subject;
 return jsonb_build_object('user_id',subject,'row_version',coalesce(cfg.row_version,0),'filter_keys',cfg.filter_keys);
end $$;

create function public.set_quick_filters(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); subject uuid:=(p->>'user_id')::uuid; prior public.write_requests;
 cfg public.user_quick_filters; keys text[]; result jsonb;
begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can assign quick filters'; end if;
 if request_id is null or subject is null or nullif(btrim(p->>'reason'),'') is null or not(p ? 'filter_keys') then
  raise exception using errcode='22023',message='Account, filter fields, request ID and reason are required';
 end if;
 perform 1 from public.system_state where id=true for update;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can assign quick filters'; end if;
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=set_quick_filters.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'quick_filters' or prior.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return prior.result;
 end if;
 if not exists(select 1 from public.user_profiles where id=subject) then raise exception 'Account is unavailable'; end if;
 if p->'filter_keys'<>'null'::jsonb then
  if jsonb_typeof(p->'filter_keys') is distinct from 'array' then raise exception 'Choose up to five distinct quick filters'; end if;
  if jsonb_array_length(p->'filter_keys')>5 or exists(select 1 from jsonb_array_elements(p->'filter_keys') v where jsonb_typeof(v)<>'string') then raise exception 'Choose up to five distinct quick filters'; end if;
  select coalesce(array_agg(value),'{}') into keys from jsonb_array_elements_text(p->'filter_keys');
  if cardinality(keys)<>(select count(distinct k) from unnest(keys) k) then raise exception 'Choose up to five distinct quick filters'; end if;
  if exists(select 1 from unnest(keys) k where k in ('branch','client') or not exists(
   select 1 from public.field_definitions f join public.field_groups g on g.id=f.group_id where f.key=k and f.active and g.active and f.list_eligible)) then
   raise exception 'One or more quick filter fields are unavailable';
  end if;
 end if;
 select * into cfg from public.user_quick_filters where user_id=subject;
 if (p->>'expected_version')::bigint is distinct from coalesce(cfg.row_version,0) then raise exception using errcode='40001',message='Quick filters changed; close and reopen before saving'; end if;
 insert into public.user_quick_filters(user_id,filter_keys) values(subject,keys)
 on conflict(user_id) do update set filter_keys=excluded.filter_keys,row_version=user_quick_filters.row_version+1;
 insert into public.audit_log(actor_id,entity,entity_id,operation,changed_keys,reason,next_reference)
 values(actor,'user_quick_filters',subject,'configuration',array['filter_keys'],p->>'reason',jsonb_build_object('filter_keys',keys));
 update public.system_state set revision=revision+1 where id=true;
 result:=public.quick_filter_settings(jsonb_build_object('user_id',subject));
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'quick_filters',p,result);
 return result;
end $$;

-- Extend the existing context read without another browser request.
alter function public.register_settings() rename to register_settings_before_quick_filters;
revoke all on function public.register_settings_before_quick_filters() from public,anon,authenticated;
create function public.register_settings() returns jsonb language sql stable security definer set search_path='' as $$
 select public.register_settings_before_quick_filters() || jsonb_build_object('quick_filter_keys',
  case when cfg.filter_keys is null then null else (
   select coalesce(jsonb_agg(k order by ord),'[]') from unnest(cfg.filter_keys) with ordinality x(k,ord)
   where exists(select 1 from jsonb_array_elements(app_private.catalog()) f where f->>'key'=k and (f->>'active')::boolean and (f->>'list_eligible')::boolean and f->'actions' ? 'R')
  ) end)
 from (select 1) singleton left join public.user_quick_filters cfg on cfg.user_id=auth.uid();
$$;

-- Resolve only the requested authorized field; avoid projecting the whole record per choice.
create or replace function public.filter_values(q jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; wanted text:=q->>'key';
begin
 if (app_private.profile()).id is null or not exists(select 1 from jsonb_array_elements(app_private.catalog()) f where f->>'key'=wanted and f->'actions' ? 'R' and (f->>'active')::boolean and (f->>'list_eligible')::boolean) then raise exception using errcode='42501',message='Filter field is unavailable'; end if;
 if q->>'client_id' is not null and not exists(select 1 from public.clients c where c.id=(q->>'client_id')::uuid and app_private.scope_access('R','client',c.branch_id,c.id)) then raise exception using errcode='42501',message='Client is unavailable'; end if;
 with placed as materialized (
  select e employee,p.target,p.branch_id,p.client_id from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p
  where e.deleted_at is null and app_private.record_access(e.id)
   and (q->>'client_id' is null or p.client_id=(q->>'client_id')::uuid)
   and (coalesce(jsonb_array_length(q->'branches'),0)=0 or p.branch_id::text in(select jsonb_array_elements_text(q->'branches')))
   and (coalesce(jsonb_array_length(q->'clients'),0)=0 or p.client_id::text in(select jsonb_array_elements_text(q->'clients')))
 ), targets as materialized(select distinct target,branch_id,client_id from placed),
 authorized as materialized (
  select t.* from targets t where app_private.scope_access('R',t.target,t.branch_id,t.client_id)
   and exists(select 1 from app_private.field_policy_grid(t.target,t.branch_id,t.client_id,array[wanted]) x where x.key=wanted and x.action='R' and x.allowed)
 ), field_values as materialized (
  select app_private.effective_value(p.employee,wanted,app_private.today()) value from placed p join authorized a
  on (p.target,p.branch_id,p.client_id) is not distinct from(a.target,a.branch_id,a.client_id)
 ), choices as (
  select distinct value from field_values where value is not null and value<>'null'::jsonb
   and position(lower(coalesce(q->>'search','')) in lower(value#>>'{}'))>0 order by value limit 100
 ) select coalesce(jsonb_agg(jsonb_build_object('id',value::text,'label',value#>>'{}') order by value),'[]') into result from choices;
 return result;
end $$;
revoke all on function public.quick_filter_settings(jsonb),public.set_quick_filters(jsonb,uuid),public.register_settings() from public,anon;
grant execute on function public.quick_filter_settings(jsonb),public.set_quick_filters(jsonb,uuid),public.register_settings() to authenticated;
notify pgrst,'reload schema';
