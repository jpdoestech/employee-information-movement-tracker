create table public.client_entry_settings (
 client_id uuid primary key references public.clients(id),
 default_values jsonb not null default '{}' check(jsonb_typeof(default_values)='object'),
 filter_keys text[] not null default array['status']::text[],
 row_version bigint not null default 1
);
alter table public.client_entry_settings enable row level security;
revoke all on public.client_entry_settings from public,anon,authenticated;

create function public.client_settings(q jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clients; settings public.client_entry_settings; keys text[]; begin
 select * into c from public.clients where id=(q->>'client_id')::uuid and active;
 if c.id is null or not app_private.scope_access('R','client',c.branch_id,c.id) then raise exception using errcode='42501',message='Client is unavailable'; end if;
 select * into settings from public.client_entry_settings where client_id=c.id;
 select coalesce(array_agg(key order by ord),'{}') into keys from unnest(coalesce(settings.filter_keys,array['status'])) with ordinality x(key,ord)
 where exists(select 1 from public.field_definitions f where f.key=x.key and f.active and f.list_eligible and app_private.field_access(f.key,'R','client',c.branch_id,c.id));
 return jsonb_build_object('client_id',c.id,'row_version',coalesce(settings.row_version,0),'filter_keys',keys,
 'default_values',case when app_private.is_super() then coalesce(settings.default_values,'{}') else '{}'::jsonb end);
end $$;

create function public.set_client_settings(p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c public.clients; prior public.write_requests; cfg public.client_entry_settings;
 defaults jsonb; keys text[]; kv record; f public.field_definitions; result jsonb; begin
 if not app_private.capability('schema_manage') then raise exception using errcode='42501',message='Client configuration is not authorized'; end if;
 if request_id is null or nullif(btrim(p->>'reason'),'') is null then raise exception using errcode='22023',message='A request ID and change reason are required'; end if;
 perform 1 from public.system_state where id=true for update;
 select * into c from public.clients where id=(p->>'client_id')::uuid and active;
 if not app_private.capability('schema_manage') or c.id is null or not app_private.scope_access('U','client',c.branch_id,c.id) then raise exception using errcode='42501',message='Client configuration is not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=set_client_settings.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'client_settings' or prior.payload<>p then raise exception using errcode='22023',message='Request ID was already used with a different payload'; end if;
  return public.client_settings(jsonb_build_object('client_id',c.id));
 end if;
 select * into cfg from public.client_entry_settings where client_id=c.id for update;
 if (p->>'expected_version')::bigint is distinct from coalesce(cfg.row_version,0) then raise exception using errcode='40001',message='Client settings changed; reload before saving'; end if;
 defaults:=coalesce(cfg.default_values,'{}');
 if p ? 'default_values' then
  if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin may configure client defaults'; end if;
  defaults:=p->'default_values';
  if jsonb_typeof(defaults) is distinct from 'object' then raise exception using errcode='22023',message='Defaults must be an object'; end if;
  for kv in select * from jsonb_each(defaults) loop
   select * into f from public.field_definitions where key=kv.key and active and type<>'system' and not(validation ? 'government_id_digits');
   if f.id is null or not app_private.field_access(f.key,'C','client',c.branch_id,c.id) then raise exception using errcode='42501',message='One or more default fields are unavailable'; end if;
   perform app_private.validate_value(f,kv.value);
  end loop;
 end if;
 if jsonb_typeof(p->'filter_keys') is distinct from 'array' then raise exception using errcode='22023',message='Choose filter fields'; end if;
 if exists(select 1 from jsonb_array_elements(p->'filter_keys') v where jsonb_typeof(v)<>'string') then raise exception using errcode='22023',message='Filter keys must be strings'; end if;
 select coalesce(array_agg(value),'{}') into keys from jsonb_array_elements_text(p->'filter_keys');
 if cardinality(keys)>8 or cardinality(keys)<>(select count(distinct v) from unnest(keys) v) then raise exception using errcode='22023',message='Choose up to eight distinct direct filters'; end if;
 for kv in select unnest(keys) key loop
  if not exists(select 1 from public.field_definitions f where f.key=kv.key and f.active and f.list_eligible and app_private.field_access(f.key,'R','client',c.branch_id,c.id)) then raise exception using errcode='42501',message='One or more filter fields are unavailable'; end if;
 end loop;
 insert into public.client_entry_settings(client_id,default_values,filter_keys) values(c.id,defaults,keys)
 on conflict(client_id) do update set default_values=excluded.default_values,filter_keys=excluded.filter_keys,row_version=client_entry_settings.row_version+1;
 insert into public.audit_log(actor_id,entity,entity_id,operation,changed_keys,reason,next_reference)
 values(actor,'client_settings',c.id,'configuration',array['default_values','filter_keys'],p->>'reason',jsonb_build_object('filter_keys',keys,'default_keys',array(select jsonb_object_keys(defaults))));
 update public.system_state set revision=revision+1 where id=true;
 result:=public.client_settings(jsonb_build_object('client_id',c.id));
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'client_settings',p,result);
 return result;
end $$;

-- Resolve defaults only at authorized creation. Explicit values (including null) win.
do $$ begin
 execute replace(pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.patch_employee(', 'FUNCTION app_private.patch_employee_v29(');
end $$;
create or replace function app_private.patch_employee(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare kv record; begin
 if creating and target='client' and exists(select 1 from public.clients where id=c and branch_id=b and active) then
  for kv in select x.key,x.value from public.client_entry_settings s cross join lateral jsonb_each(s.default_values) x
   join public.field_definitions f on f.key=x.key where s.client_id=c and f.active and f.type<>'system' and app_private.field_access(f.key,'C',target,b,c) loop
   if not patch ? kv.key then patch:=patch||jsonb_build_object(kv.key,kv.value); end if;
  end loop;
 end if;
 perform app_private.patch_employee_v29(eid,expected,patch,creating,target,b,c);
end $$;
create or replace function public.target_fields(q jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(f)-'normalized_label'||jsonb_build_object('group_name',g.name,'default_value',
 case when s.default_values ? f.key and app_private.field_access(f.key,'C',coalesce(q->>'target_level','unassigned'),(q->>'branch_id')::uuid,(q->>'client_id')::uuid) then s.default_values->f.key else f.default_value end,'actions',(
 select coalesce(jsonb_agg(a),'[]') from unnest(array['C','R','U','D']) a where app_private.field_access(f.key,a,coalesce(q->>'target_level','unassigned'),(q->>'branch_id')::uuid,(q->>'client_id')::uuid))) order by g.display_order,f.display_order),'[]')
 from public.field_definitions f join public.field_groups g on g.id=f.group_id left join public.client_entry_settings s on s.client_id=(q->>'client_id')::uuid and q->>'target_level'='client'
 where f.active and g.active and exists(select 1 from unnest(array['C','R','U','D']) a where app_private.field_access(f.key,a,coalesce(q->>'target_level','unassigned'),(q->>'branch_id')::uuid,(q->>'client_id')::uuid))
$$;
create function public.filter_values(q jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if (app_private.profile()).id is null or not exists(select 1 from jsonb_array_elements(app_private.catalog()) f where f->>'key'=q->>'key' and f->'actions' ? 'R' and (f->>'list_eligible')::boolean) then raise exception using errcode='42501',message='Filter field is unavailable'; end if;
 if q->>'client_id' is not null and not exists(select 1 from public.clients c where c.id=(q->>'client_id')::uuid and app_private.scope_access('R','client',c.branch_id,c.id)) then raise exception using errcode='42501',message='Client is unavailable'; end if;
 with authorized as materialized (
  select app_private.project(e)->'values'->(q->>'key') value from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p
  where e.deleted_at is null and app_private.employee_access(e.id,'R') and (q->>'client_id' is null or p.client_id=(q->>'client_id')::uuid)
 ), choices as (select distinct value from authorized where value is not null and value<>'null'::jsonb and position(lower(coalesce(q->>'search','')) in lower(value#>>'{}'))>0 order by value limit 100)
 select coalesce(jsonb_agg(jsonb_build_object('id',value::text,'label',value#>>'{}') order by value),'[]') into result from choices;
 return result;
end $$;
revoke all on function public.client_settings(jsonb),public.set_client_settings(jsonb,uuid),public.filter_values(jsonb) from public,anon;
grant execute on function public.client_settings(jsonb),public.set_client_settings(jsonb,uuid),public.filter_values(jsonb) to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
