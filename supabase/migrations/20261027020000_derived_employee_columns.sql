-- Calculated register columns never store employee data or accept writes.
do $$ begin
 if exists(select 1 from public.field_definitions where key in ('age','length_of_service')) then
  raise exception 'Calculated column keys already exist; review before migrating';
 end if;
end $$;
insert into public.field_definitions(group_id,form_group_id,key,label,type,display_order,list_eligible,help_text)
select group_id,form_group_id,'age','Age','system',display_order+1,true,'Completed years as of the current Asia/Manila business date. Requires readable Birth Date.'
from public.field_definitions where key='birth_date';
insert into public.field_definitions(group_id,form_group_id,key,label,type,display_order,list_eligible,help_text)
select group_id,form_group_id,'length_of_service','Length of Service','system',display_order+1,true,'Calendar service through today for active employees or the recorded non-active effective date. Requires readable source fields.'
from public.field_definitions where key='date_hired';

-- Keep the shared policy evaluator authoritative for catalogs, projections and writes.
do $$ begin
 execute replace(pg_get_functiondef('app_private.field_policy_grid(text,uuid,uuid,text[])'::regprocedure),
  'FUNCTION app_private.field_policy_grid(', 'FUNCTION app_private.field_policy_grid_before_derived_columns(');
end $$;
create or replace function app_private.field_policy_grid(target text,b uuid,c uuid,wanted_keys text[] default null)
returns table(key text,action text,allowed boolean,reason text,policy_id uuid)
language sql stable security definer set search_path='' as $$
 with rules as materialized(
  select * from app_private.field_policy_grid_before_derived_columns(target,b,c,
   case when wanted_keys is null then null else wanted_keys || array['birth_date','date_hired','status'] end)
 ), resolved as (
  select r.*,case when r.key in ('age','length_of_service') then r.action='R' and r.allowed
   and not exists(select 1 from unnest(case when r.key='age' then array['birth_date'] else array['date_hired','status'] end) dependency
    where not exists(select 1 from rules d where d.key=dependency and d.action='R' and d.allowed))
   else r.allowed end final_allowed from rules r
 ) select key,action,final_allowed,
  case when allowed and not final_allowed then 'Calculated columns are read-only and require readable source fields' else reason end,policy_id from resolved
 where wanted_keys is null or key=any(wanted_keys)
  or wanted_keys && array['name','last_name','first_name','middle_name','suffix'] and key=any(array['name','last_name','first_name','middle_name','suffix'])
$$;

create function app_private.calendar_service(start_date date,end_date date) returns text
language plpgsql immutable set search_path='' as $$
declare months int; anniversary date; years int; days int;
begin
 if start_date is null or end_date is null or end_date<start_date then return null; end if;
 months:=(extract(year from end_date)::int-extract(year from start_date)::int)*12
  +extract(month from end_date)::int-extract(month from start_date)::int;
 anniversary:=(start_date+make_interval(months=>months))::date;
 if anniversary>end_date then months:=months-1; anniversary:=(start_date+make_interval(months=>months))::date; end if;
 years:=months/12; months:=months%12; days:=end_date-anniversary;
 return coalesce(nullif(concat_ws(', ',
  case when years>0 then years||case when years=1 then ' year' else ' years' end end,
  case when months>0 then months||case when months=1 then ' month' else ' months' end end,
  case when days>0 then days||case when days=1 then ' day' else ' days' end end),''),'0 days');
end $$;
do $$ begin
 execute replace(pg_get_functiondef('app_private.effective_value(public.employees,text,date)'::regprocedure),
  'FUNCTION app_private.effective_value(', 'FUNCTION app_private.effective_value_before_derived_columns(');
end $$;
create function app_private.derived_column_value(e public.employees,k text,d date,readable_keys text[] default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare start_date date; end_date date; state text; place record;
begin
 if k not in ('age','length_of_service') then return app_private.effective_value_before_derived_columns(e,k,d); end if;
 if k='age' then
  start_date:=nullif(e.custom_values->>'birth_date','')::date;
  if start_date is null or start_date>d then return 'null'::jsonb; end if;
  return to_jsonb(extract(year from d)::int-extract(year from start_date)::int
   -case when to_char(d,'MMDD')<to_char(start_date,'MMDD') then 1 else 0 end);
 end if;
 start_date:=nullif(e.custom_values->>'date_hired','')::date;
 state:=app_private.effective_value_before_derived_columns(e,'status',d)#>>'{}';
 if state='Active' then end_date:=d;
 elsif state in ('Inactive','Separated') then
  if readable_keys is null then
   select * into place from app_private.placement(e.id,d);
   if not app_private.field_access('status_effective_date','R',place.target,place.branch_id,place.client_id) then return 'null'::jsonb; end if;
  elsif not 'status_effective_date'=any(readable_keys) then return 'null'::jsonb; end if;
  end_date:=nullif(e.custom_values->>'status_effective_date','')::date;
 end if;
 if start_date>d or end_date>d then return 'null'::jsonb; end if;
 return coalesce(to_jsonb(app_private.calendar_service(start_date,end_date)),'null'::jsonb);
exception when invalid_datetime_format or datetime_field_overflow then return 'null'::jsonb;
end $$;
create or replace function app_private.effective_value(e public.employees,k text,d date) returns jsonb
language sql stable security definer set search_path='' as $$
 select app_private.derived_column_value(e,k,d)
$$;
-- Bulk reads reuse the permission keys already resolved once per placement.
do $$ declare definition text; original text:='app_private.effective_value(e.employee,k,app_private.today())'; begin
 definition:=pg_get_functiondef('app_private.readable_employee_rows()'::regprocedure);
 if strpos(definition,original)=0 then raise exception 'Review bulk projection before adding calculated columns'; end if;
 execute replace(definition,original,'app_private.derived_column_value(e.employee,k,app_private.today(),a.keys)');
end $$;

-- Sort service by exact elapsed days, before deterministic server pagination/export.
do $$ declare definition text; original text:='row->''values''->coalesce(q->>''sort'',''employee_number'') sort_value'; begin
 definition:=pg_get_functiondef('app_private.employee_page(jsonb,boolean)'::regprocedure);
 if strpos(definition,original)=0 then raise exception 'Review employee ordering before adding calculated columns'; end if;
 definition:=replace(definition,original,$sort$case when q->>'sort'='length_of_service' then
  case when row->'values'->>'length_of_service' is not null then to_jsonb(
   (case when row->'values'->>'status'='Active' then app_private.today()
    else (row->'values'->>'status_effective_date')::date end)-(row->'values'->>'date_hired')::date) end
  else row->'values'->coalesce(q->>'sort','employee_number') end sort_value$sort$);
 execute definition;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
update public.system_state set revision=revision+1 where id=true;
