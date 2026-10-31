-- Preserve omitted security metadata; authorization checks the resulting value.
do $$ declare definition text; begin
 definition:=replace(pg_get_functiondef('app_private.tracker_mutate_v20(text,jsonb,uuid)'::regprocedure),chr(13),'');
 if strpos(definition,'sensitivity=coalesce(p->>''sensitivity'',''normal'')')=0 then raise exception 'Review field update before integrity fixes'; end if;
 definition:=replace(definition,'sensitivity=coalesce(p->>''sensitivity'',''normal'')','sensitivity=coalesce(p->>''sensitivity'',f.sensitivity)');
 definition:=replace(definition,'scope_mode=coalesce(p->>''scope_mode'',''all'')','scope_mode=coalesce(p->>''scope_mode'',f.scope_mode)');
 definition:=replace(definition,'delete from public.field_scope_targets where field_id=eid;','if not(p ? ''id'') or p ? ''targets'' then delete from public.field_scope_targets where field_id=eid;');
 definition:=replace(definition,E'end loop;\n if p->>''scope_mode''=''selected''',E'end loop;\n end if;\n if (select scope_mode from public.field_definitions where id=eid)=''selected''');
 execute definition;
end $$;

-- One required-data rule, including configured separation choices.
create or replace function app_private.validate_employment(status text,position_value text,v jsonb) returns void language plpgsql set search_path='' as $$
declare k text; f public.field_definitions; begin
 if status not in ('Active','Inactive','Separated') or status is null then raise exception using errcode='22023',message='Choose Active, Inactive or Separated'; end if;
 if status<>'Active' then
  if nullif(btrim(position_value),'') is null then raise exception using errcode='22023',message='Complete the required employment information'; end if;
  foreach k in array array['department','date_hired','employment_type','status_effective_date','separation_category','separation_reason'] loop
   if nullif(btrim(v->>k),'') is null then raise exception using errcode='22023',message='Complete the required employment information'; end if;
   select * into f from public.field_definitions where key=k;
   if f.id is not null then perform app_private.validate_value(f,v->k); end if;
  end loop;
  if v->>'separation_reason'='Others (specify)' and nullif(btrim(v->>'separation_details'),'') is null then raise exception using errcode='22023',message='Specify the other reason'; end if;
 end if;
end $$;

-- Ordinary and bulk edits share the guard. Unrelated edits to legacy profiles
-- do not force new employment data, and profile transitions validate their target state.
do $$ begin
 execute replace(pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.patch_employee(', 'FUNCTION app_private.patch_employee_before_integrity(');
end $$;
create or replace function app_private.patch_employee(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees; begin
 perform app_private.patch_employee_before_integrity(eid,expected,patch,creating,target,b,c);
 if not creating and patch ?| array['department','date_hired','employment_type','status_effective_date','separation_category','separation_reason','separation_details'] then
  select * into e from public.employees where id=eid;
  perform app_private.validate_employment(app_private.effective_value(e,'status',app_private.today())#>>'{}',app_private.effective_value(e,'position',app_private.today())#>>'{}',e.custom_values);
 end if;
end $$;
do $$ declare definition text; begin
 definition:=replace(pg_get_functiondef('app_private.apply_profile_employment(uuid,bigint,jsonb,jsonb)'::regprocedure),chr(13),'');
 definition:=replace(definition,'perform app_private.patch_employee(eid,expected,patch);','perform app_private.patch_employee_before_integrity(eid,expected,patch);');
 execute definition;
end $$;

do $$ declare definition text; needle text; begin
 definition:=replace(pg_get_functiondef('app_private.move_employee(jsonb)'::regprocedure),chr(13),'');
 needle:=$old$ if p->>'status' in ('Separated','Resigned','Terminated') and (
  coalesce(p->>'separation_category','') not in ('VOLUNTARY','INVOLUNTARY') or
  coalesce(p->>'separation_reason','') not in ('Health Concerns','Better Job Opportunity','Better Pay','Going Abroad','Career Growth','Further Studies','Termination','AWOL','Store Variance','Family Reason','Others (specify)') or
  (p->>'separation_reason'='Others (specify)' and (length(btrim(coalesce(p->>'separation_details',''))) not between 1 and 500))) then
  raise exception using errcode='22023',message='Choose a separation category and reason; specify other reasons';
 end if;$old$;
 needle:=replace(needle,chr(13),'');
 if strpos(definition,needle)=0 then raise exception 'Review separation validation before integrity fixes'; end if;
 definition:=replace(definition,needle,'');
 needle:='if typ not in (''position'',''status'',''temporary'') and cat=''primary'' then merged:=';
 if strpos(definition,needle)=0 then raise exception 'Review movement validation order before integrity fixes'; end if;
 definition:=replace(definition,needle,$new$
 if typ='status' and p->>'status'<>'Active' then
  merged:=e.custom_values||jsonb_build_object('status_effective_date',d::text);
  foreach separation_key in array array['separation_category','separation_reason','separation_details'] loop
   if p ? separation_key then
    select * into f from public.field_definitions where key=separation_key and active;
    if f.id is null or not app_private.field_access(separation_key,case when p->separation_key='null'::jsonb then 'D' else 'U' end,old.target,old.branch_id,old.client_id) then raise exception using errcode='42501',message='Separation field is not authorized'; end if;
    perform app_private.validate_value(f,p->separation_key);
    merged:=merged||jsonb_build_object(separation_key,p->separation_key);
   end if;
  end loop;
  perform app_private.validate_employment(case when p->>'status' in ('Resigned','Terminated') then 'Separated' else p->>'status' end,app_private.effective_value(e,'position',d)#>>'{}',merged);
  update public.employees set custom_values=merged where id=e.id;
 end if;
 $new$||needle);
 definition:=replace(definition,'merged jsonb; begin','merged jsonb; separation_key text; f public.field_definitions; begin');
 definition:=replace(definition,'and not voided and starts_on>=d) then raise exception using errcode=''23P01'',message=''Cancel or reschedule future placements before separation''','and not voided and (starts_on>d or starts_on=d and source_movement_id is not null)) then raise exception using errcode=''23P01'',message=''Cancel or reschedule future placements before separation''');
 needle:='update public.employee_assignments set ends_on=d where employee_id=e.id and not voided and starts_on<d';
 if strpos(definition,needle)=0 then raise exception 'Review status closure before integrity fixes'; end if;
 definition:=replace(definition,needle,'update public.employee_assignments set voided=true where employee_id=e.id and not voided and starts_on=d and source_movement_id is null; '||needle);
 execute definition;
end $$;

-- Reversing an official department event must reverse its current value, too.
do $$ declare definition text; needle text:='update public.employee_movements set voided_at=now() where id=m.id;'; begin
 definition:=replace(pg_get_functiondef('app_private.void_movement(jsonb)'::regprocedure),chr(13),'');
 if strpos(definition,needle)=0 then raise exception 'Review movement correction before integrity fixes'; end if;
 definition:=replace(definition,needle,$new$
 if m.payload ? 'department' then
  if e.custom_values->'department' is distinct from m.payload->'department' then raise exception using errcode='40001',message='Department changed after this movement; resolve the later change first'; end if;
  update public.employees set custom_values=case when m.previous_state->'department' is null or m.previous_state->'department'='null'::jsonb then custom_values-'department' else jsonb_set(custom_values,'{department}',m.previous_state->'department') end where id=e.id;
 end if;
 update public.employee_movements set voided_at=now() where id=m.id;
 $new$);
 execute definition;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
