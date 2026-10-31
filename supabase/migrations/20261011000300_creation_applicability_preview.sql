-- Draft previews are reads: no field is created and no permission is granted.
-- A missing/inactive profile must return false, never SQL NULL in IF NOT guards.
create or replace function app_private.capability(c text) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(app_private.is_super() or
  ((app_private.profile()).role='admin' and exists(select 1 from public.capability_grants
   where user_id=auth.uid() and capability=c)),false)
$$;
create or replace function public.field_scope_preview(q jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.field_definitions; result jsonb; begin
 if not app_private.capability('schema_manage') then
  raise exception using errcode='42501',message='Access denied';
 end if;
 if coalesce(q->>'scope_mode','') not in ('all','selected') then
  raise exception using errcode='22023',message='Invalid applicability mode';
 end if;
 if q->>'id' is not null then
  select * into f from public.field_definitions where id=(q->>'id')::uuid;
  if f.id is null then raise exception 'Field definition is unavailable'; end if;
 end if;
 with targets as materialized (
  select t.* from app_private.targets() t where
   app_private.scope_access('R',t.target,t.branch_id,t.client_id) and
   (q->>'scope_mode'='all' or exists(select 1 from jsonb_array_elements(coalesce(q->'targets','[]')) s
    where app_private.scope_matches(s->>'scope_type',(s->>'scope_id')::uuid,coalesce((s->>'include_descendants')::boolean,false),t.target,t.branch_id,t.client_id)))
 ), affected as (
  select e.id from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p
  where f.id is not null and e.deleted_at is null and e.custom_values ? f.key
   and app_private.field_access(f.key,'R',p.target,p.branch_id,p.client_id)
   and not exists(select 1 from targets t where (t.target,t.branch_id,t.client_id) is not distinct from(p.target,p.branch_id,p.client_id))
 ), candidates as materialized (
  select e.id,e.employee_number,e.name,
   app_private.field_access('employee_number','R',p.target,p.branch_id,p.client_id) as can_id,
   app_private.field_access('name','R',p.target,p.branch_id,p.client_id) as can_name
  from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p
  where e.deleted_at is null and exists(select 1 from targets t
   where (t.target,t.branch_id,t.client_id) is not distinct from(p.target,p.branch_id,p.client_id))
 ), visible as materialized (
  select * from candidates where can_id or can_name
 ), sample as (
  select id, jsonb_strip_nulls(jsonb_build_object(
   'employee_number',case when can_id then employee_number end,
   'name',case when can_name then name end)) as identity
  from visible order by id limit 5
 ) select jsonb_build_object('resolved_targets',(select count(*) from targets),
  'affected_visible_values',(select count(*) from affected),
  'scoped_employee_count',(select count(*) from visible),
  'samples',coalesce((select jsonb_agg(identity order by id) from sample),'[]'::jsonb),
  'revision',(select revision from public.system_state)) into result;
 return result;
end $$;
revoke all on function public.field_scope_preview(jsonb) from public,anon;
grant execute on function public.field_scope_preview(jsonb) to authenticated;
