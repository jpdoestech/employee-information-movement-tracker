-- Employment presentation keeps immutable field IDs and legacy values/policies.
update public.field_definitions set active=false,required=false,row_version=row_version+1 where key='status_reason';
update public.field_definitions set label='Specify reason',row_version=row_version+1 where key='separation_details';
update public.field_definitions set label='Effective Date',help_text='Official status changes take effect on this date.',row_version=row_version+1 where key='status_effective_date';
-- Merge the former reason choices without deleting recorded values.
update public.field_definitions set options=(select jsonb_agg(v order by v) from (select distinct v from jsonb_array_elements_text(options||'["Personal reasons","End of contract","Resignation","Retirement"]'::jsonb) v) x),row_version=row_version+1 where key='separation_reason';
alter table public.employees drop constraint employees_initial_status_check;
alter table public.employees add constraint employees_initial_status_check check(initial_status in ('Active','Inactive','Separated','Resigned','Terminated'));

-- Corrections overlay the specific effective position event, never overwrite its history.
create table app_private.position_text_corrections(
 id bigint generated always as identity primary key,
 employee_id uuid not null references public.employees(id),
 movement_id uuid references public.employee_movements(id),
 value text not null check(length(btrim(value)) between 1 and 200),
 actor_id uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now()
);
alter table app_private.position_text_corrections enable row level security;
revoke all on app_private.position_text_corrections from public,anon,authenticated;
create index on app_private.position_text_corrections(employee_id,movement_id,id desc);

do $$ declare def text; begin
 execute replace(pg_get_functiondef('app_private.effective_value(public.employees,text,date)'::regprocedure),'FUNCTION app_private.effective_value(', 'FUNCTION app_private.effective_value_v30(');
 def:=pg_get_functiondef('app_private.effective_value_v30(public.employees,text,date)'::regprocedure);
 def:=replace(def,'and voided_at is null and effective_on<=d','and payload ? k and voided_at is null and effective_on<=d');
 execute def;
end $$;
create or replace function app_private.effective_value(e public.employees,k text,d date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare mid uuid; v jsonb; begin
 if k='position' then
  select id into mid from public.employee_movements where employee_id=e.id and type='position' and payload ? 'position' and voided_at is null and effective_on<=d order by effective_on desc,created_at desc,id desc limit 1;
  select to_jsonb(value) into v from app_private.position_text_corrections where employee_id=e.id and movement_id is not distinct from mid order by id desc limit 1;
  if v is not null then return v; end if;
 end if;
 v:=app_private.effective_value_v30(e,k,d);
 if k='status' and v#>>'{}' in ('Resigned','Terminated') then return '"Separated"'::jsonb; end if;
 return v;
end $$;

create function app_private.validate_employment(status text,position_value text,v jsonb) returns void language plpgsql set search_path='' as $$
declare k text; begin
 if status not in ('Active','Inactive','Separated') then raise exception using errcode='22023',message='Choose Active, Inactive or Separated'; end if;
 if status<>'Active' then
  if nullif(btrim(position_value),'') is null then raise exception using errcode='22023',message='Complete the required employment information'; end if;
  foreach k in array array['department','date_hired','employment_type','status_effective_date','separation_category','separation_reason'] loop
   if nullif(btrim(v->>k),'') is null then raise exception using errcode='22023',message='Complete the required employment information'; end if;
  end loop;
  if v->>'separation_category' not in ('VOLUNTARY','INVOLUNTARY') then raise exception using errcode='22023',message='Choose a separation category'; end if;
  if v->>'separation_reason'='Others (specify)' and nullif(btrim(v->>'separation_details'),'') is null then raise exception using errcode='22023',message='Specify the other reason'; end if;
 end if;
end $$;

create function app_private.apply_profile_employment(eid uuid,expected bigint,patch jsonb,change jsonb) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees; placement record; k text; pos text; status text; merged jsonb; mid uuid; mode text:=change->>'change_kind'; olddept jsonb; department_changed boolean; result jsonb; begin
 if mode is null or mode not in ('official','correction') or jsonb_typeof(change) is distinct from 'object' or exists(select 1 from jsonb_object_keys(change) x where x not in ('change_kind','position','status')) then raise exception using errcode='22023',message='Choose official change or typo correction'; end if;
 select * into e from public.employees where id=eid and deleted_at is null for update;
 if e.id is null or not app_private.employee_access(eid,'U') then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if e.row_version<>expected then raise exception using errcode='40001',message='Revision conflict'; end if;
 select * into placement from app_private.placement(eid,app_private.today());
 foreach k in array array['position','status'] loop
  if change ? k and not app_private.field_access(k,'U',placement.target,placement.branch_id,placement.client_id) then raise exception using errcode='42501',message='Employment field is not authorized'; end if;
 end loop;
 if change ? 'status' and mode='correction' then raise exception using errcode='22023',message='Status changes require an official movement'; end if;
 if change ? 'position' and (jsonb_typeof(change->'position')<>'string' or length(btrim(change->>'position')) not between 1 and 200) then raise exception using errcode='22023',message='Enter a position of 1-200 characters'; end if;
 pos:=coalesce(change->>'position',app_private.effective_value(e,'position',app_private.today())#>>'{}');
 status:=coalesce(change->>'status',app_private.effective_value(e,'status',app_private.today())#>>'{}');
 merged:=e.custom_values||patch;
 perform app_private.validate_employment(status,pos,merged);
 olddept:=e.custom_values->'department';
 department_changed:=patch ? 'department' and patch->'department' is distinct from olddept;
 if jsonb_typeof(patch) is distinct from 'object' then raise exception using errcode='22023',message='Invalid employee values'; end if;
 if patch<>'{}'::jsonb then perform app_private.patch_employee(eid,expected,patch); end if;
 select * into e from public.employees where id=eid;
 if change ? 'position' then
  if mode='official' then
   result:=app_private.move_employee(jsonb_build_object('employee_id',eid,'expected_version',e.row_version,'type','position','position',pos,'effective_on',app_private.today(),'reason','Official employment change from profile'));
   if department_changed then update public.employee_movements set payload=payload||jsonb_build_object('department',patch->'department'),previous_state=previous_state||jsonb_build_object('department',olddept) where id=(result->>'id')::uuid; end if;
  else
   select id into mid from public.employee_movements where employee_id=eid and type='position' and payload ? 'position' and voided_at is null and effective_on<=app_private.today() order by effective_on desc,created_at desc,id desc limit 1;
   insert into app_private.position_text_corrections(employee_id,movement_id,value,actor_id) values(eid,mid,pos,auth.uid());
   update public.employees set row_version=row_version+1,updated_at=now() where id=eid;
   perform app_private.audit('employee',eid,'typo_correction',array['position']);
   perform app_private.changed(eid,'employee');
  end if;
 end if;
 if department_changed and mode='official' and not(change ? 'position') then
  if not app_private.capability('movement_create') then raise exception using errcode='42501',message='Official changes require movement access'; end if;
  insert into public.employee_movements(employee_id,type,effective_on,reason,payload,previous_state,actor_id) values(eid,'position',app_private.today(),'Official department change from profile',jsonb_build_object('department',patch->'department'),jsonb_build_object('department',olddept),auth.uid());
  perform app_private.audit('employee',eid,'department_movement',array['department']);
 end if;
 if department_changed and mode='correction' then perform app_private.audit('employee',eid,'typo_correction',array['department']); end if;
 if change ? 'status' and change->>'status' is distinct from app_private.effective_value(e,'status',app_private.today())#>>'{}' then
  select * into e from public.employees where id=eid;
  perform app_private.move_employee(jsonb_build_object('employee_id',eid,'expected_version',e.row_version,'type','status','status',status,'effective_on',case when status='Active' then app_private.today()::text else merged->>'status_effective_date' end,'reason',coalesce(merged->>'separation_details',merged->>'separation_reason','Official employment status change'),'separation_category',merged->'separation_category','separation_reason',merged->'separation_reason','separation_details',merged->'separation_details'));
 end if;
end $$;

-- Keep the existing request ledger, global configuration lock, authorization and replay checks.
do $$ declare def text; needle text:='if p ? ''position_change'' then'; begin
 def:=pg_get_functiondef('app_private.tracker_mutate_v20(text,jsonb,uuid)'::regprocedure);
 if strpos(def,needle)=0 then raise exception 'Review employee update branch before employment changes'; end if;
 def:=replace(def,needle,'if p ? ''employment'' then perform app_private.apply_profile_employment(eid,(p->>''expected_version'')::bigint,p->''values'',p->''employment''); elsif p ? ''position_change'' then');
 needle:='perform app_private.patch_employee(eid,1,p->''values'',true,kind,b,c);';
 if strpos(def,needle)=0 then raise exception 'Review employee create branch before employment changes'; end if;
 def:=replace(def,needle,needle||' if p ? ''initial_employment'' and p->''initial_employment''->>''status''<>''Active'' then perform app_private.apply_profile_employment(eid,(select row_version from public.employees where id=eid),''{}''::jsonb,p->''initial_employment''); end if;');
 execute def;
 -- Retain legacy statuses in historical payloads and accepted old clients, expose Separated in current projections.
 def:=pg_get_functiondef('app_private.move_employee(jsonb)'::regprocedure);
 def:=replace(def,'''Active'',''Inactive'',''Resigned'',''Terminated''','''Active'',''Inactive'',''Separated'',''Resigned'',''Terminated''');
 def:=replace(def,'if p->>''status'' in (''Resigned'',''Terminated'')','if p->>''status'' in (''Separated'',''Resigned'',''Terminated'')');
 execute def;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
