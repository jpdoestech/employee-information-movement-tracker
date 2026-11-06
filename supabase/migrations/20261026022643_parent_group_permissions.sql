-- Preserve a private predecessor for audited comparison and a forward rollback.
do $$ begin
 execute replace(pg_get_functiondef('app_private.field_policy_grid(text,uuid,uuid,text[])'::regprocedure),
  'FUNCTION app_private.field_policy_grid(', 'FUNCTION app_private.field_policy_grid_before_parent_inheritance(');
end $$;
revoke all on function app_private.field_policy_grid_before_parent_inheritance(text,uuid,uuid,text[]) from public,anon,authenticated;

-- Reparenting now changes inherited access, so schema-edit capability alone
-- must not let an ordinary account move a group under an allowed ancestor.
do $$ declare definition text; needle text:='perform 1 from public.system_state where id for update;'; begin
 definition:=pg_get_functiondef('app_private.validate_group_parent()'::regprocedure);
 execute replace(definition,'FUNCTION app_private.validate_group_parent(', 'FUNCTION app_private.validate_group_parent_before_inheritance(');
 if strpos(definition,needle)=0 then raise exception 'Inspect group parent validator before securing inheritance'; end if;
 execute replace(definition,needle,needle||$guard$
 if auth.uid() is not null and not app_private.is_super() and
  ((tg_op='INSERT' and new.parent_group_id is not null) or
   (tg_op='UPDATE' and new.parent_group_id is distinct from old.parent_group_id)) then
  raise exception using errcode='42501',message='Only a Superadmin can change the permission parent group';
 end if;
 $guard$);
end $$;
revoke all on function app_private.validate_group_parent_before_inheritance() from public,anon,authenticated;

-- Two-level permission hierarchy; form_group_id remains presentation only.
-- Matching DENY at the field, own group or active parent wins. Restricted fields
-- still need a field-level allow; no group allow changes that requirement.
create or replace function app_private.field_policy_grid(target text,b uuid,c uuid,wanted_keys text[] default null)
returns table(key text,action text,allowed boolean,reason text,policy_id uuid)
language sql stable security definer set search_path='' as $$
 with subject as materialized(select app_private.is_super() super),
 gates as materialized(select a,app_private.scope_access(a,target,b,c) allowed from unnest(array['C','R','U','D']) a),
 policies as materialized(select p.* from public.field_access_policies p where (p.user_id=auth.uid() or p.role=any(app_private.subject_roles())) and app_private.scope_matches(p.scope_type,p.scope_id,p.include_descendants,target,b,c)),
 legacy as materialized(select l.* from app_private.address_legacy_groups l join public.field_groups g on g.id=l.group_id and g.active),
 fields as materialized(select f.*,parent.id parent_group_id,f.scope_mode='all' or exists(select 1 from public.field_scope_targets t where t.field_id=f.id and app_private.scope_matches(t.scope_type,t.scope_id,t.include_descendants,target,b,c)) applicable from public.field_definitions f join public.field_groups g on g.id=f.group_id left join public.field_groups parent on parent.id=g.parent_group_id and parent.active where f.active and g.active and (wanted_keys is null or f.key=any(wanted_keys) or wanted_keys && array['name','last_name','first_name','middle_name','suffix'] and f.key=any(array['name','last_name','first_name','middle_name','suffix']))),
 raw as materialized(
 select f.key,g.a action,g.allowed and f.applicable and (s.super or coalesce(p.effect='allow',false)) allowed,
 case when not g.allowed then 'Organization action denied or inactive account' when not f.applicable then 'Field does not apply at this primary placement'
 when s.super then 'Trusted Superadmin override within applicability'
 when p.id is null and f.sensitivity='restricted' then 'Restricted field requires explicit field allow'
 when p.id is null then 'Default deny: no matching inherited group policy'
 when p.field_id is not null then 'Direct field '||p.effect
 when p.group_id=f.parent_group_id then 'Parent group '||(select name from public.field_groups where id=p.group_id)||' '||p.effect
 else 'Group '||p.effect||' ('||(select name from public.field_groups where id=p.group_id)||')' end reason,p.id policy_id
 from fields f cross join gates g cross join subject s left join lateral(
  select p.* from policies p where p.action=g.a and (p.field_id=f.id or (p.group_id=f.group_id or p.group_id=f.parent_group_id or exists(select 1 from legacy l where l.field_id=f.id and l.destination_group=f.group_id and l.group_id=p.group_id)) and (p.effect='deny' or p.inherit_new and f.sensitivity<>'restricted'))
  order by (p.effect='deny') desc,(p.field_id is not null) desc,(p.group_id=f.group_id) desc,p.id limit 1
 ) p on true),
 names as materialized(select action,bool_or(key='name' and allowed) name_allowed,count(*) filter(where key=any(array['last_name','first_name','middle_name','suffix']) and allowed)=4 components_allowed from raw group by action),
 resolved as(select r.*,r.allowed and case when r.action='R' and r.key='name' then n.components_allowed when r.action='R' and r.key=any(array['last_name','first_name','middle_name','suffix']) then n.name_allowed when r.action<>'R' and r.key=any(array['last_name','first_name','middle_name','suffix']) then (select name_allowed from names where action=case r.action when 'D' then 'U' else r.action end) else true end final_allowed from raw r join names n on n.action=r.action)
 select key,action,coalesce(final_allowed,false),case when allowed and not coalesce(final_allowed,false) then 'Combined name and component identity permissions must both allow this action' else reason end,policy_id from resolved
$$;

-- Invalidate open catalogs and route the change through the existing sync boundary.
do $$ begin perform app_private.changed(null,'policy'); end $$;
