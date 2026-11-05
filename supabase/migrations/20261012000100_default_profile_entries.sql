-- Default profile entries use existing applicability, CRUD, projection and validation.
-- Do not fabricate personal information or impose new required rules on old records.
do $$ declare personal uuid; employment uuid; f record; gid uuid; begin
 insert into public.field_groups(name,description,display_order,tab_name,tab_order)
 values('Personal information','Personal profile details',10,'Profile',0)
 on conflict(normalized_name) do nothing;
 select id into personal from public.field_groups where normalized_name=app_private.normalized('Personal information');
 insert into public.field_groups(name,description,display_order,tab_name,tab_order)
 values('Employment information','Employment profile details; changes in status and position retain movement history',20,'Profile',0)
 on conflict(normalized_name) do nothing;
 select id into employment from public.field_groups where normalized_name=app_private.normalized('Employment information');
 for f in select * from (values
 ('birth_date','Birth Date','date',false,'[]'::jsonb,10,''),
 ('gender','Gender','select',false,'["Male","Female","Other","Prefer not to say"]'::jsonb,20,''),
 ('civil_status','Civil Status','select',false,'["Single","Married","Separated","Divorced","Widowed"]'::jsonb,30,''),
 ('department','Department','short_text',true,'[]'::jsonb,10,''),
 ('date_hired','Date Hired','date',true,'[]'::jsonb,20,''),
 ('employment_type','Employment Type','select',true,'["Regular","Probationary","Contractual","Project-based","Casual","Seasonal","Part-time"]'::jsonb,30,''),
 ('status_reason','Status Reason','select',true,'["Active / Normal","Personal reasons","End of contract","Resignation","Retirement","Other"]'::jsonb,40,'Profile context only. Record employment status changes through Movements.'),
 ('status_effective_date','Status Effective Date','date',true,'[]'::jsonb,50,'Profile reference date; it does not schedule a status change.'),
 ('remarks','Remarks','long_text',true,'[]'::jsonb,60,'')
 ) as defaults(key,label,type,employment,options,display_order,help_text) loop
  gid:=case when f.employment then employment else personal end;
  -- Reuse existing identities, including inactive or differently keyed matching labels.
  -- Preserve their configuration, explicit policies, stored values and group inheritance.
  if not exists(select 1 from public.field_definitions where key=f.key or normalized_label=app_private.normalized(f.label)) then
   insert into public.field_definitions(group_id,key,label,type,options,display_order,help_text)
   values(gid,f.key,f.label,f.type,f.options,f.display_order,f.help_text);
  end if;
 end loop;
end $$;

-- Set initial position in the existing create transaction, after scope checks and
-- within its idempotency branch. Later changes still require movement transactions.
do $$ declare definition text; needle text:='insert into public.employees(name) values(p->''values''->>''name'') returning id into eid;'; begin
 definition:=pg_get_functiondef('app_private.tracker_mutate_v20(text,jsonb,uuid)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Employee creation function changed; review initial position migration'; end if;
 definition:=replace(definition,needle,$replacement$
 if p ? 'initial_position' then
  if not app_private.field_access('position','C',kind,b,c) then raise exception using errcode='42501',message='Initial position is not authorized'; end if;
  if jsonb_typeof(p->'initial_position') is distinct from 'string' or length(btrim(p->>'initial_position')) not between 1 and 200 then raise exception using errcode='22023',message='Enter a position of 1-200 characters'; end if;
 end if;
 insert into public.employees(name,initial_position) values(p->'values'->>'name',coalesce(btrim(p->>'initial_position'),'')) returning id into eid;
 $replacement$);
 execute definition;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
