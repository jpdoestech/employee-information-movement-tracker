-- Retain each employee's typed row once instead of rebuilding it from JSON for
-- every readable field. Authorization and projection still precede all filters.
create or replace function app_private.readable_employee_rows()
returns table(id uuid, projected_row jsonb,target text,branch_id uuid,client_id uuid)
language sql stable security definer set search_path = '' as $$
 with placed as materialized (
 select e as employee,p.target,p.branch_id,p.client_id from public.employees e
 cross join lateral app_private.placement(e.id,app_private.today()) p where e.deleted_at is null
 ), targets as materialized (
 select distinct p.target,p.branch_id,p.client_id from placed p
 ), authorized as materialized (
 select t.*,array(select f.key from public.field_definitions f where f.active
 and app_private.field_access(f.key,'R',t.target,t.branch_id,t.client_id)) keys
 from targets t where app_private.scope_access('R',t.target,t.branch_id,t.client_id)
 )
 select (e.employee).id,jsonb_build_object('id',(e.employee).id,'row_version',(e.employee).row_version,'values',
 coalesce((select jsonb_object_agg(k,app_private.effective_value(e.employee,k,app_private.today())) from unnest(a.keys) k),'{}')),
 e.target,e.branch_id,e.client_id from placed e join authorized a
 on (e.target,e.branch_id,e.client_id) is not distinct from (a.target,a.branch_id,a.client_id)
$$;
revoke all on function app_private.readable_employee_rows() from public,anon,authenticated;

-- Share the authorized filter/order query with export. Export previously repeated
-- the full projection for every 100 rows, even within the same snapshot.
do $$ declare definition text; guard text:='if lim not in (10,25,50,100) or off<0 then raise exception ''Invalid pagination''; end if;'; begin
 definition:=replace(pg_get_functiondef('app_private.employee_page(jsonb)'::regprocedure),chr(13),'');
 if strpos(definition,guard)=0 then raise exception 'Review pagination before export optimization'; end if;
 definition:=replace(definition,'app_private.employee_page(q jsonb)','app_private.employee_page(q jsonb, export_all boolean)');
 definition:=replace(definition,guard,'if export_all then lim:=10001; off:=0; else '||guard||' end if;');
 execute definition;
end $$;
create or replace function app_private.employee_page(q jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select app_private.employee_page(q,false)
$$;
create or replace function public.export_employees(q jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare page jsonb; begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Access denied'; end if;
 page:=app_private.employee_page(q||jsonb_build_object('limit',100,'offset',0),true);
 if (page->>'total')::int>10000 then raise exception 'Narrow the export to at most 10,000 employees'; end if;
 return jsonb_build_object('items',page->'items','fields',app_private.catalog());
end $$;
revoke all on function app_private.employee_page(jsonb,boolean) from public,anon,authenticated;
revoke all on function app_private.employee_page(jsonb) from public,anon,authenticated;
