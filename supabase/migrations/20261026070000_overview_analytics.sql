-- Dashboard-only projection: no profile values, identities or permission cache leave the request.
create index if not exists employee_status_analytics on public.employee_movements(employee_id,effective_on desc,created_at desc,id desc)
 where type='status' and voided_at is null;

create function app_private.dashboard_analytics(q jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare business_date date:=app_private.today(); finish date:=coalesce((q->>'to')::date,business_date);
 start_date date:=coalesce((q->>'from')::date,finish-29); result jsonb;
begin
 if not app_private.module_access('employees','view') then raise exception using errcode='42501',message='Access denied'; end if;
 if start_date>finish or finish>business_date or start_date<date '1900-01-01' then
  raise exception using errcode='22023',message='Choose a valid date range ending on or before today';
 end if;
 with placed as materialized (
  -- The primary-assignment exclusion constraint guarantees at most one match per employee/date.
  select e employee,coalesce(a.target_level,'unassigned') target,a.branch_id,a.client_id from public.employees e
  left join public.employee_assignments a on a.employee_id=e.id and a.category='primary' and not a.voided
   and daterange(a.starts_on,a.ends_on,'[)') @> business_date
  where e.deleted_at is null and app_private.record_access(e.id)
 ), targets as materialized (select distinct target,branch_id,client_id from placed),
 permissions as materialized (
  select t.*,array(select key from app_private.field_policy_grid(t.target,t.branch_id,t.client_id,
   array['status','branch','client','date_hired','birth_date','gender','employment_type','status_effective_date']) where action='R' and allowed) keys
  from targets t where app_private.scope_access('R',t.target,t.branch_id,t.client_id)
 ), authorized_rows as materialized (
  select (p.employee).id,p.employee,p.target,p.branch_id,p.client_id,a.keys
  from placed p join permissions a on (p.target,p.branch_id,p.client_id) is not distinct from (a.target,a.branch_id,a.client_id)
 ), current_rows as materialized (
  select r.*,(select coalesce(jsonb_object_agg(k,case k
   when 'status' then app_private.effective_value(r.employee,'status',business_date)
   when 'branch' then to_jsonb(case r.target when 'head_office' then 'Head Office' when 'unassigned' then 'Unassigned' else b.name end)
   when 'client' then coalesce(to_jsonb(c.name),'null'::jsonb)
   else coalesce((r.employee).custom_values->k,'null'::jsonb) end),'{}') from unnest(r.keys) k) v
  from authorized_rows r left join public.branches b on b.id=r.branch_id left join public.clients c on c.id=r.client_id
 ), snapshots as materialized (
  select r.id,r.employee,r.keys,r.v->>'date_hired' hired,d.day,coalesce(a.target_level,'unassigned') target,a.branch_id,a.client_id
  from current_rows r cross join (values(start_date-1),(finish)) d(day)
  left join public.employee_assignments a on a.employee_id=r.id and a.category='primary' and not a.voided
   and daterange(a.starts_on,a.ends_on,'[)') @> d.day
  where r.keys @> array['status','date_hired'] and nullif(r.v->>'date_hired','') is not null
   and app_private.module_access('movements','view')
 ), snapshot_targets as materialized (select distinct target,branch_id,client_id from snapshots),
 snapshot_permissions as materialized (
  select t.*,coalesce(bool_or(x.key='status' and x.allowed),false) status_read,
   coalesce(bool_or(x.key='date_hired' and x.allowed),false) hire_read
  from snapshot_targets t cross join lateral app_private.field_policy_grid(t.target,t.branch_id,t.client_id,array['status','date_hired']) x
  group by t.target,t.branch_id,t.client_id
 ), endpoint_values as materialized (
  select s.id,s.day,nullif(s.hired,'')::date hired,app_private.effective_value(s.employee,'status',s.day)#>>'{}' status
  from snapshots s join snapshot_permissions p
   on (s.target,s.branch_id,s.client_id) is not distinct from (p.target,p.branch_id,p.client_id)
  where p.status_read and p.hire_read and s.keys @> array['status','date_hired']
 ), raw_events as materialized (
  select m.employee_id,m.payload->>'status' status,p.*,
   coalesce(m.payload->>'target_level',p.target) destination,
   case when m.payload ? 'target_level' then (m.payload->>'branch_id')::uuid else p.branch_id end destination_branch,
   case when m.payload ? 'target_level' then (m.payload->>'client_id')::uuid else p.client_id end destination_client,
   coalesce(m.previous_state->>'target_level',p.target) source,
   case when m.previous_state ? 'target_level' then (m.previous_state->>'branch_id')::uuid else p.branch_id end source_branch,
   case when m.previous_state ? 'target_level' then (m.previous_state->>'client_id')::uuid else p.client_id end source_client
  from public.employee_movements m join current_rows r on r.id=m.employee_id
  left join public.employee_assignments a on a.employee_id=m.employee_id and a.category='primary' and not a.voided
   and daterange(a.starts_on,a.ends_on,'[)') @> m.effective_on
  cross join lateral(select coalesce(a.target_level,'unassigned') target,a.branch_id,a.client_id) p
  where app_private.module_access('movements','view') and r.keys @> array['status','date_hired'] and nullif(r.v->>'date_hired','') is not null
   and m.type='status' and m.voided_at is null and m.effective_on between start_date and finish
 ), event_scopes as materialized (
  select target,branch_id,client_id from raw_events union select destination,destination_branch,destination_client from raw_events
  union select source,source_branch,source_client from raw_events
 ), event_permissions as materialized (
  select s.*,app_private.scope_access('R',s.target,s.branch_id,s.client_id) scope_read,
   app_private.field_access('status','R',s.target,s.branch_id,s.client_id) status_read from event_scopes s
 ), event_counts as materialized (
  select e.employee_id,count(*) filter(where e.status in ('Separated','Resigned','Terminated')) separations,
   bool_and(a.status_read and b.scope_read and b.status_read and c.scope_read and c.status_read) allowed
  from raw_events e join event_permissions a on (e.target,e.branch_id,e.client_id) is not distinct from (a.target,a.branch_id,a.client_id)
  join event_permissions b on (e.destination,e.destination_branch,e.destination_client) is not distinct from (b.target,b.branch_id,b.client_id)
  join event_permissions c on (e.source,e.source_branch,e.source_client) is not distinct from (c.target,c.branch_id,c.client_id)
  group by e.employee_id
 ), period_inputs as (
  -- Aggregate endpoint and event facts together, avoiding repeated joins of projected profile rows.
  select id,hired,case when day=start_date-1 then status end opening,case when day=finish then status end closing,
   day=start_date-1 opening_allowed,day=finish closing_allowed,0::bigint separations,true allowed from endpoint_values
  union all select employee_id,null::date,null::text,null::text,false,false,separations,allowed from event_counts
 ), cohort as materialized (
  select id,max(hired) hired,max(opening) opening,max(closing) closing,sum(separations) separations from period_inputs
  group by id having max(hired) is not null and bool_or(closing_allowed)
   and (bool_or(opening_allowed) or max(hired)>=start_date) and bool_and(allowed)
   and app_private.module_access('movements','view')
 ), metrics as (
  select count(*) eligible,count(*) filter(where hired<start_date and opening='Active') opening,
   count(*) filter(where hired<=finish and closing='Active') closing,
   count(*) filter(where hired between start_date and finish) hires,
   coalesce(sum(separations),0) separations,
   count(*) filter(where hired<start_date and opening='Active' and closing='Active' and separations=0) retained from cohort
 ), workforce as materialized (select * from current_rows where v->>'status'='Active'),
 staffing_candidates as materialized (
  -- Keep permission checks on actual requirements; do not push them onto the entire client catalog.
  select r.client_id,r.employment_type,c.branch_id,sum(r.required_headcount) required from app_private.readable_staffing() r
  join public.clients c on c.id=r.client_id
  where r.active and r.starts_on<=business_date and (r.ends_on is null or r.ends_on>business_date)
  group by r.client_id,r.employment_type,c.branch_id
 ), staffing_targets as materialized (
  select * from staffing_candidates c where app_private.field_access('status','R','client',c.branch_id,c.client_id)
 ), staffing_counts as (
  select t.required,least(t.required,(select count(*) from workforce w where w.client_id=t.client_id
   and w.keys @> array['client','employment_type'] and w.v->>'employment_type'=t.employment_type)) filled from staffing_targets t
 ), staffing as (select coalesce(sum(required),0) required,coalesce(sum(filled),0) filled from staffing_counts),
 branches as (select coalesce(branch_id::text,target) id,v->>'branch' label,count(*) count from workforce where keys @> array['branch'] group by 1,2),
 clients as (select coalesce(client_id::text,'none') id,coalesce(v->>'client','No client') label,
  case when keys @> array['branch'] then v->>'branch' end context,count(*) count
  from workforce where keys @> array['client'] group by 1,2,3),
 employment as (select coalesce(v->>'employment_type','Not recorded') label,count(*) count from workforce where keys @> array['employment_type'] group by 1),
 ages as (
  select case when nullif(v->>'birth_date','') is null then null else extract(year from age(business_date,(v->>'birth_date')::date))::int end years,
   coalesce(v->>'gender','Not recorded') gender from workforce where keys @> array['birth_date','gender']
 ), mix as (
  select case when years is null or years<0 then 'Not recorded' when years<18 then 'Under 18' when years<=25 then '18–25' when years<=30 then '26–30'
   when years<=40 then '31–40' when years<=50 then '41–50' when years<=60 then '51–60' else '61+' end age,gender,count(*) count from ages group by 1,2
 )
 select jsonb_build_object('today',business_date,'from',start_date,'to',finish,'total',(select count(*) from current_rows),
  'headcount',(select count(*) from workforce),'status_coverage',(select count(*) from current_rows where keys @> array['status']),
  'statuses',(select coalesce(jsonb_object_agg(label,n),'{}') from(select coalesce(v->>'status','Not recorded') label,count(*) n from current_rows where keys @> array['status'] group by 1) s),
  'placements',(select coalesce(jsonb_object_agg(label,n),'{}') from(select coalesce(v->>'branch','Not recorded') label,count(*) n from current_rows where keys @> array['branch'] group by 1) s),
  'period',jsonb_build_object('eligible',m.eligible,'opening',m.opening,'closing',m.closing,'hires',case when m.eligible>0 then m.hires end,
   'separations',case when m.eligible>0 then m.separations end,'retention',round(100.0*m.retained/nullif(m.opening,0),1),
   'turnover',round(100.0*m.separations/nullif((m.opening+m.closing)/2.0,0),1)),
  'fill_rate',(select round(100.0*filled/nullif(required,0),1) from staffing),'staffing',(select to_jsonb(s) from staffing s),
  'branches',coalesce((select jsonb_agg(to_jsonb(b) order by count desc,id) from(select * from branches order by count desc,id limit 100) b),'[]'),
  'branch_groups',(select count(*) from branches),
  'clients',coalesce((select jsonb_agg(to_jsonb(c) order by count desc,id) from(select * from clients order by count desc,id limit 100) c),'[]'),
  'client_groups',(select count(*) from clients),
  'employment_types',coalesce((select jsonb_agg(to_jsonb(e) order by count desc,label) from employment e),'[]'),
  'age_gender',coalesce((select jsonb_agg(to_jsonb(a) order by age,gender) from mix a),'[]')) into result from metrics m;
 return result;
end $$;
revoke all on function app_private.dashboard_analytics(jsonb) from public,anon,authenticated;

-- Preserve the public RPC and all other query branches.
do $$ declare definition text; first_pos int; last_pos int; begin
 definition:=pg_get_functiondef('app_private.tracker_query_before_matrix(text,jsonb)'::regprocedure);
 first_pos:=strpos(definition,'elsif operation=''dashboard'' then');
 last_pos:=strpos(definition,'elsif operation=''schema'' then');
 if first_pos=0 or last_pos<=first_pos then raise exception 'Review dashboard dispatch before applying analytics'; end if;
 execute overlay(definition placing 'elsif operation=''dashboard'' then return app_private.dashboard_analytics(q); ' from first_pos for last_pos-first_pos);
end $$;
