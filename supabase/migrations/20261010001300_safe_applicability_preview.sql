create function public.field_scope_preview(q jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.field_definitions; result jsonb; begin
 if not app_private.capability('schema_manage') then
  raise exception using errcode='42501',message='Access denied';
 end if;
 select * into f from public.field_definitions where id=(q->>'id')::uuid;
 if f.id is null then raise exception 'Field definition is unavailable'; end if;
 with targets as materialized (
  select t.* from app_private.targets() t where
   (app_private.is_super() or app_private.scope_access('R',t.target,t.branch_id,t.client_id)) and
   (q->>'scope_mode'='all' or exists(select 1 from jsonb_array_elements(coalesce(q->'targets','[]')) s
    where app_private.scope_matches(s->>'scope_type',(s->>'scope_id')::uuid,coalesce((s->>'include_descendants')::boolean,false),t.target,t.branch_id,t.client_id)))
 ), affected as (
  select e.id from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p
  where e.deleted_at is null and e.custom_values ? f.key
   and (app_private.is_super() or app_private.field_access(f.key,'R',p.target,p.branch_id,p.client_id))
   and not exists(select 1 from targets t where (t.target,t.branch_id,t.client_id) is not distinct from(p.target,p.branch_id,p.client_id))
 ) select jsonb_build_object('resolved_targets',(select count(*) from targets),
  'affected_visible_values',(select count(*) from affected),'revision',(select revision from public.system_state)) into result;
 return result;
end $$;
revoke all on function public.field_scope_preview(jsonb) from public,anon;
grant execute on function public.field_scope_preview(jsonb) to authenticated;
