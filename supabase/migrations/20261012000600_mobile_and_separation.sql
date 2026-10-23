-- Labels change; immutable keys and existing grants/sync projections are retained.
update public.field_definitions set label='Mobile',row_version=row_version+1 where key='phone';
update public.field_definitions set required=false,row_version=row_version+1 where validation ? 'government_id_digits';
create function app_private.optional_government_ids() returns trigger language plpgsql set search_path='' as $$
begin if new.validation ? 'government_id_digits' then new.required:=false; end if; return new; end $$;
revoke all on function app_private.optional_government_ids() from public,anon,authenticated;
create trigger optional_government_ids before insert or update on public.field_definitions for each row execute function app_private.optional_government_ids();
do $$ declare g uuid; f record; begin
 select group_id into g from public.field_definitions where key='department';
 for f in select * from (values
 ('separation_category','Separation Category','select','["VOLUNTARY","INVOLUNTARY"]'::jsonb),
 ('separation_reason','Reason for Separation','select','["Health Concerns","Better Job Opportunity","Better Pay","Going Abroad","Career Growth","Further Studies","Termination","AWOL","Store Variance","Family Reason","Others (specify)"]'::jsonb),
 ('separation_details','Other Separation Reason','short_text','[]'::jsonb)
 ) d(key,label,type,options) loop
  if not exists(select 1 from public.field_definitions where key=f.key or normalized_label=app_private.normalized(f.label)) then
   insert into public.field_definitions(group_id,key,label,type,options,validation) values(g,f.key,f.label,f.type,f.options,case when f.type='short_text' then '{"max_length":500}'::jsonb else '{}'::jsonb end);
  else
   update public.field_definitions set options=f.options,row_version=row_version+1 where key=f.key and type='select';
  end if;
 end loop;
end $$;
do $$ begin
 execute replace(pg_get_functiondef('app_private.validate_value(public.field_definitions,jsonb)'::regprocedure),'FUNCTION app_private.validate_value(', 'FUNCTION app_private.validate_value_v28(');
 execute replace(pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.patch_employee(', 'FUNCTION app_private.patch_employee_v28(');
end $$;
create or replace function app_private.validate_value(f public.field_definitions,v jsonb) returns void language plpgsql set search_path='' as $$
begin
 if f.type='phone' and v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or (v#>>'{}'<>'' and regexp_replace(v#>>'{}','[ -]','','g') !~ '^09[0-9]{9}$')) then
  raise exception using errcode='22023',message='Mobile must start with 09 and contain 11 digits';
 end if;
 perform app_private.validate_value_v28(f,v);
end $$;
create or replace function app_private.patch_employee(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare kv record; merged jsonb; begin
 for kv in select x.key,x.value from jsonb_each(patch) x join public.field_definitions f on f.key=x.key where f.type='phone' loop
  if jsonb_typeof(kv.value)='string' then patch:=jsonb_set(patch,array[kv.key],to_jsonb(regexp_replace(kv.value#>>'{}','[ -]','','g'))); end if;
 end loop;
 perform app_private.patch_employee_v28(eid,expected,patch,creating,target,b,c);
 select custom_values into merged from public.employees where id=eid;
 if merged->>'separation_reason'='Others (specify)' and nullif(btrim(merged->>'separation_details'),'') is null then
  raise exception using errcode='22023',message='Specify the other separation reason';
 end if;
end $$;
-- Typed separation details are stored in the effective-dated movement payload.
-- Existing history is retained; existing projection redaction remains unchanged.
do $$ declare definition text; needle text:='declare e public.employees;'; begin
 definition:=pg_get_functiondef('app_private.move_employee(jsonb)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Movement function changed; review separation migration'; end if;
 -- Insert validation before existing authorization/transaction logic, without bypassing it.
 if strpos(definition,'if typ=''status'' and coalesce')=0 then raise exception 'Status validation changed'; end if;
 definition:=replace(definition,'if typ=''status'' and coalesce', $replacement$
 if p->>'status' in ('Resigned','Terminated') and (
  coalesce(p->>'separation_category','') not in ('VOLUNTARY','INVOLUNTARY') or
  coalesce(p->>'separation_reason','') not in ('Health Concerns','Better Job Opportunity','Better Pay','Going Abroad','Career Growth','Further Studies','Termination','AWOL','Store Variance','Family Reason','Others (specify)') or
  (p->>'separation_reason'='Others (specify)' and (length(btrim(coalesce(p->>'separation_details',''))) not between 1 and 500))) then
  raise exception using errcode='22023',message='Choose a separation category and reason; specify other reasons';
 end if;
 if typ='status' and coalesce$replacement$);
 definition:=replace(definition,'''status'',''assignment_id''','''status'',''assignment_id'',''separation_category'',''separation_reason'',''separation_details''');
 execute definition;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
