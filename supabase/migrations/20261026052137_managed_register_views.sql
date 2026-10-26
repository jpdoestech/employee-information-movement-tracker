-- Display rules never participate in row/field authorization or saved filters.
alter table public.register_display_settings add column managed_views jsonb not null default '[]'
 check(jsonb_typeof(managed_views)='array');

create or replace function public.register_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
 return (select (to_jsonb(s)-'id'-'managed_views') || jsonb_build_object('managed_views',
   (select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(s.managed_views) v
    where app_private.is_super() or v->>'user_id' is null or v->>'user_id'=auth.uid()::text))
   from public.register_display_settings s where id=true);
end $$;

create function public.set_register_view(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior public.write_requests; current_settings public.register_display_settings;
 rid uuid:=(p->>'id')::uuid; target_user uuid:=(p->>'user_id')::uuid; target_scope uuid:=(p->>'scope_id')::uuid;
 rules jsonb; rule jsonb; config jsonb:=p->'config'; result jsonb;
begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can manage column views'; end if;
 if request_id is null or rid is null or nullif(btrim(p->>'reason'),'') is null then raise exception using errcode='22023',message='A view ID, request ID and reason are required'; end if;
 perform 1 from public.system_state where id=true for update;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can manage column views'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=set_register_view.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'register_view' or prior.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return prior.result;
 end if;
 select * into current_settings from public.register_display_settings where id=true for update;
 if (p->>'expected_version')::bigint is distinct from current_settings.row_version then raise exception using errcode='40001',message='Register settings changed; reload before saving'; end if;
 select coalesce(jsonb_agg(v),'[]') into rules from jsonb_array_elements(current_settings.managed_views) v where v->>'id'<>rid::text;
 if coalesce((p->>'remove')::boolean,false) then
  if rules=current_settings.managed_views then raise exception using errcode='22023',message='Column view no longer exists'; end if;
 else
  if nullif(btrim(p->>'name'),'') is null or length(p->>'name')>80
   or p->>'scope_type' is null or p->>'scope_type' not in ('all','head_office','branch','client')
   or ((p->>'scope_type' in ('branch','client')) is distinct from (target_scope is not null)) then
   raise exception using errcode='22023',message='Provide a view name and valid location';
  end if;
  if target_user is not null and not exists(select 1 from public.user_profiles where id=target_user and active) then raise exception using errcode='22023',message='Select an active account'; end if;
  if p->>'scope_type'='branch' and not exists(select 1 from public.branches where id=target_scope and active)
   or p->>'scope_type'='client' and not exists(select 1 from public.clients c join public.branches b on b.id=c.branch_id where c.id=target_scope and c.active and b.active) then raise exception using errcode='22023',message='Select an active location'; end if;
  if jsonb_typeof(config) is distinct from 'object' or jsonb_typeof(config->'columns') is distinct from 'array'
   or jsonb_typeof(config->'pinned') is distinct from 'array' or jsonb_typeof(config->'showRowNumbers') is distinct from 'boolean' then
   raise exception using errcode='22023',message='Provide columns, pinned columns and row-number preference';
  end if;
  if jsonb_array_length(config->'columns') not between 1 and 200 or jsonb_array_length(config->'pinned')>2
   or exists(select 1 from jsonb_array_elements(config->'columns') k where jsonb_typeof(k)<>'string')
   or exists(select 1 from jsonb_array_elements(config->'pinned') k where jsonb_typeof(k)<>'string')
   or exists(select 1 from jsonb_array_elements_text(config->'columns') k where not exists(select 1 from public.field_definitions f where f.key=k and f.active and f.list_eligible))
   or exists(select 1 from jsonb_array_elements_text(config->'pinned') k where not (config->'columns') ? k)
   or (select count(*)<>count(distinct k) from jsonb_array_elements_text(config->'columns') k)
   or (select count(*)<>count(distinct k) from jsonb_array_elements_text(config->'pinned') k) then
   raise exception using errcode='22023',message='Select distinct active, list-eligible fields and at most two visible pinned columns';
  end if;
  if exists(select 1 from jsonb_array_elements(rules) v where (v->>'user_id')::uuid is not distinct from target_user
   and v->>'scope_type'=p->>'scope_type' and (v->>'scope_id')::uuid is not distinct from target_scope) then
   raise exception using errcode='22023',message='A view already exists for this account and location; edit that view';
  end if;
  if jsonb_array_length(rules)>=500 then raise exception using errcode='22023',message='Maximum 500 managed views; remove an unused view first'; end if;
  rule:=jsonb_build_object('id',rid,'name',btrim(p->>'name'),'user_id',target_user,'scope_type',p->>'scope_type','scope_id',target_scope,
   'config',jsonb_build_object('columns',config->'columns','pinned',config->'pinned','showRowNumbers',config->'showRowNumbers'));
  rules:=rules||jsonb_build_array(rule);
 end if;
 update public.register_display_settings set managed_views=rules,row_version=row_version+1 where id=true;
 insert into public.audit_log(actor_id,entity,operation,changed_keys,reason,previous_reference,next_reference)
 values(actor,'register_settings','permission_change',array['managed_views'],p->>'reason',current_settings.managed_views,rules);
 update public.system_state set revision=revision+1 where id=true;
 result:=public.register_settings();
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'register_view',p,result);
 return result;
end $$;
revoke all on function public.set_register_view(jsonb,uuid) from public,anon;
grant execute on function public.set_register_view(jsonb,uuid) to authenticated;
