-- Preserve approved PRFs and employee records while adding explicit staffing lines.
create table public.staffing_requisition_lines (
 id uuid primary key default gen_random_uuid(),
 requisition_id uuid not null references public.staffing_requisitions(id),
 department text not null check(length(btrim(department))<=200),
 position text not null check(length(btrim(position))<=200),
 required_headcount integer not null check(required_headcount between 1 and 100000),
 active boolean not null default true
);
create unique index staffing_line_requirement on public.staffing_requisition_lines(requisition_id,lower(department),lower(position)) where active;
alter table public.staffing_requisition_lines enable row level security;
revoke all on public.staffing_requisition_lines from public,anon,authenticated;
-- Existing targets remain valid; an administrator completes their job details before assigning employees.
insert into public.staffing_requisition_lines(requisition_id,department,position,required_headcount)
select id,'','',required_headcount from public.staffing_requisitions;
alter table public.employees add column prf_line_id uuid references public.staffing_requisition_lines(id);
create index employee_prf_line on public.employees(prf_line_id) where deleted_at is null and prf_line_id is not null;
insert into public.field_definitions(group_id,key,label,type,display_order,list_eligible,help_text)
select group_id,'prf_number','PRF No.','short_text',display_order+1,true,
 'Hiring PRF and department/position requirement. Existing employee records may be assigned without changing their job details.'
from public.field_definitions where key='department';

-- Reuse the complete existing field, scope, version, audit and synchronization path.
do $$ begin
 execute replace(pg_get_functiondef('app_private.patch_employee_before_integrity(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),
  'FUNCTION app_private.patch_employee_before_integrity(', 'FUNCTION app_private.patch_employee_before_prf(');
end $$;
create or replace function app_private.patch_employee_before_integrity(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare e public.employees; place record; line public.staffing_requisition_lines;
 selected uuid; requested boolean:=patch ? 'prf_number'; action text;
begin
 select * into e from public.employees where id=eid and deleted_at is null for update;
 if not creating then
  select * into place from app_private.placement(eid,app_private.today());
  target:=place.target;b:=place.branch_id;c:=place.client_id;
 end if;
 if requested then
  action:=case when creating then 'C' when patch->'prf_number'='null'::jsonb then 'D' else 'U' end;
  if not app_private.field_access('prf_number',action,target,b,c) then
   raise exception using errcode='42501',message='PRF assignment is not authorized';
  end if;
  if patch->'prf_number'<>'null'::jsonb then
   -- UUIDs come from the secured picker; imports may use a PRF number plus exact department/position.
   select l.* into line from public.staffing_requisition_lines l join public.staffing_requisitions r on r.id=l.requisition_id
   where r.client_id=c and l.active and r.active and r.starts_on<=app_private.today() and (r.ends_on is null or r.ends_on>app_private.today())
   and l.department<>'' and l.position<>'' and (l.id::text=patch->>'prf_number' or (
    r.reference=patch->>'prf_number' and l.department=coalesce(patch->>'department',e.custom_values->>'department')
    and l.position=app_private.effective_value(e,'position',app_private.today())#>>'{}'
    and r.employment_type=coalesce(patch->>'employment_type',e.custom_values->>'employment_type')))
   order by l.id limit 1;
   if target is distinct from 'client' or line.id is null or not app_private.field_access('prf_number','R',target,b,c) then
    raise exception using errcode='42501',message='Choose an available PRF requirement for this client';
   end if;
   selected:=line.id;
   patch:=jsonb_set(patch,'{prf_number}',to_jsonb(line.id::text));
  end if;
 end if;
 perform app_private.patch_employee_before_prf(eid,expected,patch,creating,target,b,c);
 if requested then update public.employees set prf_line_id=selected where id=eid; end if;
end $$;

-- The displayed value comes from the relationship, never editable free text.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('app_private.effective_value(public.employees,text,date)'::regprocedure);
 definition:=regexp_replace(definition,'\mBEGIN\M',$body$BEGIN
 if k='prf_number' then return coalesce((select to_jsonb(r.reference) from public.staffing_requisition_lines l
  join public.staffing_requisitions r on r.id=l.requisition_id join public.clients c on c.id=r.client_id
  where l.id=e.prf_line_id and app_private.scope_access('R','client',c.branch_id,c.id)
  and app_private.field_access('prf_number','R','client',c.branch_id,c.id)),'null'::jsonb); end if;
 $body$,'i');
 execute definition;
end $$;

create function app_private.staffing_line_counts(rid uuid) returns table(line_id uuid,filled bigint)
language plpgsql stable security definer set search_path='' as $$
declare r public.staffing_requisitions; b uuid;
begin
 select * into r from public.staffing_requisitions where id=rid;
 select branch_id into b from public.clients where id=r.client_id;
 if not app_private.module_access('employees','view') or not app_private.scope_access('R','client',b,r.client_id)
 or (select count(*) from app_private.field_policy_grid('client',b,r.client_id,array['prf_number','client','department','position','employment_type','status']) where action='R' and allowed)<>6 then
  return query select l.id,null::bigint from public.staffing_requisition_lines l where l.requisition_id=rid and l.active;
  return;
 end if;
 return query
 with assigned as materialized (
  select e.prf_line_id,e.custom_values->>'department' department,
   app_private.effective_value(e,'position',app_private.today())#>>'{}' position
  from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p
  where e.deleted_at is null and e.prf_line_id in(select l.id from public.staffing_requisition_lines l where l.requisition_id=rid and l.active)
  and app_private.record_access(e.id) and p.target='client' and p.client_id=r.client_id
  and e.custom_values->>'employment_type'=r.employment_type
  and app_private.effective_value(e,'status',app_private.today())#>>'{}'='Active'
 ) select l.id,count(a.prf_line_id) from public.staffing_requisition_lines l
 left join assigned a on a.prf_line_id=l.id and a.department=l.department and a.position=l.position
 where l.requisition_id=rid and l.active group by l.id;
end $$;

-- Employee pickers do not require Organization management or enumerate its full catalog.
create function public.staffing_options(q jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare eid uuid:=(q->>'employee_id')::uuid; cid uuid:=(q->>'client_id')::uuid; bid uuid; place record;
 selected uuid; result jsonb; mode text:=case when eid is null then 'C' else 'U' end;
begin
 if length(coalesce(q->>'search',''))>500 then raise exception 'Search is too long'; end if;
 if eid is not null then
  if not app_private.employee_access(eid,'R') then raise exception using errcode='42501',message='Employee is unavailable'; end if;
  select * into place from app_private.placement(eid,app_private.today()); cid:=place.client_id;
  select prf_line_id into selected from public.employees where id=eid;
 end if;
 if q ? 'selected_id' then selected:=(q->>'selected_id')::uuid; end if;
 select branch_id into bid from public.clients where id=cid and active;
 if cid is null then return jsonb_build_object('items','[]'::jsonb,'selected',null); end if;
 if bid is null or not app_private.module_access('employees',case when eid is null then 'create' else 'update' end)
 or not app_private.scope_access(mode,'client',bid,cid)
 or not app_private.field_access('prf_number',mode,'client',bid,cid)
 or not app_private.scope_access('R','client',bid,cid)
 or exists(select 1 from unnest(array['prf_number','department','position','employment_type']) k
  where not app_private.field_access(k,'R','client',bid,cid)) then
  raise exception using errcode='42501',message='PRF selection requires authorized client and job details access';
 end if;
 with visible as materialized (
  select l.id,r.reference label,concat_ws(' · ',l.department,l.position,r.employment_type) context,
   l.department,l.position,r.employment_type,
   r.active and l.active and l.department<>'' and l.position<>'' and r.starts_on<=app_private.today()
    and (r.ends_on is null or r.ends_on>app_private.today()) available
  from public.staffing_requisition_lines l join public.staffing_requisitions r on r.id=l.requisition_id where r.client_id=cid
 ), page as (
  select * from visible where available and (coalesce(q->>'search','')='' or position(lower(q->>'search') in lower(label||' '||context))>0)
  order by label,context,id limit 25
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)) from page p),'[]'),
  'selected',(select to_jsonb(v) from visible v where id=selected)) into result;
 return result;
end $$;

-- PRF details are subject to the same job-field visibility as the employee selector.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('app_private.readable_staffing()'::regprocedure);
 definition:=replace(definition,$old$and app_private.field_access('employment_type','R','client',c.branch_id,c.id)$old$,
  $new$and app_private.field_access('employment_type','R','client',c.branch_id,c.id) and app_private.field_access('department','R','client',c.branch_id,c.id) and app_private.field_access('position','R','client',c.branch_id,c.id)$new$);
 execute definition;
end $$;

-- Extend the established PRF save transaction, keeping its receipt, lock and row version.
do $$ begin
 execute replace(replace(pg_get_functiondef('public.set_staffing_requisition(jsonb,uuid)'::regprocedure),
  'FUNCTION public.set_staffing_requisition(', 'FUNCTION app_private.set_staffing_requisition_before_lines('),
  'set_staffing_requisition.request_id','set_staffing_requisition_before_lines.request_id');
end $$;
create or replace function public.set_staffing_requisition(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; entry jsonb; existing public.staffing_requisition_lines; rid uuid:=(p->>'id')::uuid;
 lid uuid; ids uuid[]:='{}'; total integer; previous public.staffing_requisitions; receipt public.write_requests;
begin
 p:=app_private.normalize_inputs(p);
 perform 1 from public.system_state where id=true for update;
 if exists(select 1 from public.clients c where c.id=(p->>'client_id')::uuid and (not app_private.field_access('department','R','client',c.branch_id,c.id) or not app_private.field_access('position','R','client',c.branch_id,c.id))) then raise exception using errcode='42501',message='PRF job details are not authorized'; end if;
 select * into receipt from public.write_requests w where w.actor_id=auth.uid() and w.request_id=set_staffing_requisition.request_id;
 select * into previous from public.staffing_requisitions where id=rid;
 if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 100 then
  raise exception using errcode='22023',message='Add 1–100 department and position requirements';
 end if;
 if exists(select 1 from jsonb_array_elements(p->'lines') l where jsonb_typeof(l) is distinct from 'object'
  or jsonb_typeof(l->'department') is distinct from 'string' or length(btrim(l->>'department')) not between 1 and 200
  or jsonb_typeof(l->'position') is distinct from 'string' or length(btrim(l->>'position')) not between 1 and 200
  or jsonb_typeof(l->'required_headcount') is distinct from 'number'
  or (l->>'required_headcount')::numeric<>trunc((l->>'required_headcount')::numeric)
  or (l->>'required_headcount')::numeric not between 1 and 100000) then
  raise exception using errcode='22023',message='Complete each department, position and positive whole headcount';
 end if;
 if exists(select 1 from jsonb_array_elements(p->'lines') l group by lower(btrim(l->>'department')),lower(btrim(l->>'position')) having count(*)>1) then raise exception 'Combine duplicate department and position requirements'; end if;
 select sum((l->>'required_headcount')::int) into total from jsonb_array_elements(p->'lines') l;
 if total>100000 then raise exception 'A PRF may request up to 100000 employees'; end if;
 p:=p||jsonb_build_object('required_headcount',total);
 if receipt.actor_id is not null then
  -- The original endpoint performs current authorization and actor/payload-bound replay checks.
  return app_private.set_staffing_requisition_before_lines(p,request_id);
 end if;

 if exists(select 1 from public.employees e join public.staffing_requisition_lines l on l.id=e.prf_line_id where l.requisition_id=rid)
 and (p->>'reference' is distinct from previous.reference or p->>'employment_type' is distinct from previous.employment_type) then
  raise exception 'PRF No. and Employment Type are locked after employees are assigned';
 end if;
 result:=app_private.set_staffing_requisition_before_lines(p,request_id);
 -- Retire omitted lines, preserving every employee relationship and its original job requirement.
 for entry in select value from jsonb_array_elements(p->'lines') loop
  lid:=(entry->>'id')::uuid;
  if lid is null or lid=any(ids) then raise exception 'Each PRF line needs a distinct ID'; end if;
  ids:=array_append(ids,lid);
  select * into existing from public.staffing_requisition_lines where id=lid;
  if existing.id is not null and existing.requisition_id<>rid then raise exception 'PRF line is unavailable'; end if;
  if existing.id is not null and (existing.department is distinct from entry->>'department' or existing.position is distinct from entry->>'position')
   and exists(select 1 from public.employees where prf_line_id=lid) then
   raise exception 'Assigned job details are locked; add another requirement line';
  end if;
 end loop;
 update public.staffing_requisition_lines set active=false where requisition_id=rid;
 for entry in select value from jsonb_array_elements(p->'lines') loop
  insert into public.staffing_requisition_lines(id,requisition_id,department,position,required_headcount)
  values((entry->>'id')::uuid,rid,btrim(entry->>'department'),btrim(entry->>'position'),(entry->>'required_headcount')::int)
  on conflict(id) do update set department=excluded.department,position=excluded.position,required_headcount=excluded.required_headcount,active=true;
 end loop;
 return result;
end $$;

-- Expand the secured page only after filtering and pagination.
do $$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('public.staffing_page(jsonb)'::regprocedure);
 definition:=replace(definition,
 $old$(coalesce(q->>'search','')='' or position(lower(q->>'search') in lower(concat_ws(' ',row->>'reference',row->>'client_label',row->>'employment_type',row->>'context')))>0)$old$,
 $new$(coalesce(q->>'search','')='' or position(lower(q->>'search') in lower(concat_ws(' ',row->>'reference',row->>'client_label',row->>'employment_type',row->>'context')))>0
 or exists(select 1 from public.staffing_requisition_lines l where l.requisition_id=(row->>'id')::uuid and l.active
 and position(lower(q->>'search') in lower(l.department||' '||l.position))>0))$new$);
 needle:='select jsonb_agg(row) from page';
 if strpos(definition,needle)=0 then raise exception 'Inspect staffing pagination before adding job requirements'; end if;
 definition:=replace(definition,needle,$body$select jsonb_agg(row||(select jsonb_build_object(
  'lines',coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('filled_headcount',c.filled,'job_locked',exists(select 1 from public.employees e where e.prf_line_id=l.id)) order by l.department,l.position,l.id),'[]'),
  'job_locked',exists(select 1 from public.employees e join public.staffing_requisition_lines x on x.id=e.prf_line_id where x.requisition_id=(row->>'id')::uuid),
  'filled_headcount',sum(case when c.filled is not null then least(l.required_headcount,c.filled) end))
  from public.staffing_requisition_lines l join app_private.staffing_line_counts((row->>'id')::uuid) c on c.line_id=l.id
  where l.requisition_id=(row->>'id')::uuid and l.active)) from page$body$);
 execute definition;
end $$;

-- Fill rate follows explicit assignments; unrelated employees cannot fill a PRF vacancy.
do $$ declare definition text; first_pos integer; last_pos integer; begin
 definition:=pg_get_functiondef('app_private.dashboard_analytics(jsonb)'::regprocedure);
 first_pos:=strpos(definition,'staffing_candidates as materialized (');
 last_pos:=strpos(definition,'staffing as (');
 if first_pos=0 or last_pos<=first_pos then raise exception 'Inspect analytics before linking PRF fill rate'; end if;
 definition:=overlay(definition placing $body$staffing_visible as materialized (
  select l.required_headcount required,c.filled from app_private.readable_staffing() r
  cross join lateral app_private.staffing_line_counts(r.id) c join public.staffing_requisition_lines l on l.id=c.line_id
  where r.active and r.starts_on<=business_date and (r.ends_on is null or r.ends_on>business_date)
 ), staffing_counts as (select required,least(required,filled) filled from staffing_visible where filled is not null), $body$ from first_pos for last_pos-first_pos);
 execute definition;
end $$;
update public.system_state set revision=revision+1 where id=true;
revoke all on function public.staffing_options(jsonb) from public,anon;
grant execute on function public.staffing_options(jsonb) to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
