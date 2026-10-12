-- Core name parts remain independently authorized metadata values. Never infer
-- components from legacy full names: their spelling and meaning are preserved.
do $$ declare core uuid; k text; labels text[]:=array['Last Name','First Name','Middle Name','Suffix']; i int:=0; begin
 select group_id into core from public.field_definitions where key='name';
 foreach k in array array['last_name','first_name','middle_name','suffix'] loop
  i:=i+1;
  if exists(select 1 from public.field_definitions where key=k) then
   raise exception 'Existing name-part definition % needs an explicit migration before enabling structured names',k;
  end if;
  insert into public.field_definitions(group_id,key,label,type,display_order,validation)
   values(core,k,labels[i],'system',i,jsonb_build_object('max_length',80));
  -- Preserve explicit name grants/denials and their exact organization boundaries.
  insert into public.field_access_policies(user_id,role,field_id,action,effect,scope_type,scope_id,include_descendants)
   select p.user_id,p.role,f.id,p.action,p.effect,p.scope_type,p.scope_id,p.include_descendants
   from public.field_access_policies p join public.field_definitions n on n.id=p.field_id and n.key='name'
   cross join public.field_definitions f where f.key=k;
 end loop;
end $$;

alter table public.field_groups add column tab_name text not null default '' check(length(tab_name)<=60);
alter table public.field_groups add column tab_order integer not null default 0 check(tab_order between 0 and 999);
update public.field_groups set tab_name=case when id=(select group_id from public.field_definitions where key='name') then 'Profile' else name end,
 tab_order=case when id=(select group_id from public.field_definitions where key='name') then 0 when name='Address' then 20 else 10 end where true;

create function app_private.combined_name(v jsonb) returns text language plpgsql immutable set search_path='' as $$
declare k text; begin
 foreach k in array array['last_name','first_name','middle_name','suffix'] loop
  if v ? k and v->k<>'null'::jsonb and (jsonb_typeof(v->k)<>'string' or length(v->>k)>80) then
   raise exception using errcode='22023',message='Name parts must be text of at most 80 characters';
  end if;
 end loop;
 if nullif(btrim(v->>'last_name'),'') is null or nullif(btrim(v->>'first_name'),'') is null then
  raise exception using errcode='22023',message='Last Name and First Name are required';
 end if;
 return btrim(v->>'last_name')||', '||concat_ws(' ',btrim(v->>'first_name'),nullif(btrim(v->>'middle_name'),''),nullif(btrim(v->>'suffix'),''));
end $$;

-- Keep existing function OIDs so SQL projection callers use the new guard.
do $$ begin
 execute replace(pg_get_functiondef('app_private.field_decision(text,text,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.field_decision(', 'FUNCTION app_private.field_decision_v20(');
 execute replace(replace(pg_get_functiondef('app_private.field_access(text,text,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.field_access(', 'FUNCTION app_private.field_access_v20('),'app_private.field_decision(', 'app_private.field_decision_v20(');
 execute replace(pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.patch_employee(', 'FUNCTION app_private.patch_employee_v20(');
 execute replace(replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),'FUNCTION public.tracker_mutate(', 'FUNCTION app_private.tracker_mutate_v20('),'tracker_mutate.request_id','tracker_mutate_v20.request_id');
end $$;

create or replace function app_private.field_access(k text,a text,target text,b uuid,c uuid) returns boolean language plpgsql stable security definer set search_path='' as $$ begin
 if not app_private.field_access_v20(k,a,target,b,c) then return false; end if;
 -- A combined name cannot reveal a component denied by column policy, even in
 -- counts/search/export. Component reads also require the existing identity grant.
 if a='R' and k='name' then
  return not exists(select 1 from unnest(array['last_name','first_name','middle_name','suffix']) part
   where not app_private.field_access_v20(part,'R',target,b,c));
 end if;
 if a='R' and k=any(array['last_name','first_name','middle_name','suffix']) then
  return app_private.field_access_v20('name','R',target,b,c);
 end if;
 if a<>'R' and k=any(array['last_name','first_name','middle_name','suffix']) then
  return app_private.field_access_v20('name',case when a='D' then 'U' else a end,target,b,c);
 end if;
 return true;
end $$;

create or replace function app_private.field_decision(k text,a text,target text,b uuid,c uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare decision jsonb; begin
 decision:=app_private.field_decision_v20(k,a,target,b,c);
 if (decision->>'allowed')::boolean and not app_private.field_access(k,a,target,b,c) then
  return decision||jsonb_build_object('allowed',false,'reason','Combined name and component identity permissions must both allow this action');
 end if;
 return decision;
end $$;

create or replace function app_private.patch_employee(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare e public.employees; merged jsonb; placement record; kv record; begin
 select * into e from public.employees where id=eid and deleted_at is null for update;
 if e.id is null then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if not creating and not (app_private.employee_access(eid,'U') or app_private.employee_access(eid,'D')) then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if creating and not app_private.scope_access('C',target,b,c) then raise exception using errcode='42501',message='Access denied'; end if;
 if expected is null or expected<>e.row_version then raise exception using errcode='40001',message='Revision conflict: reload before reapplying your draft'; end if;
 if patch ?| array['last_name','first_name','middle_name','suffix'] then
  if not creating then
   select * into placement from app_private.placement(eid,app_private.today());
   target:=placement.target;b:=placement.branch_id;c:=placement.client_id;
  end if;
  for kv in select * from jsonb_each(patch) where key=any(array['last_name','first_name','middle_name','suffix']) loop
   if not app_private.field_access(kv.key,case when creating then 'C' when kv.value='null'::jsonb then 'D' else 'U' end,target,b,c) then raise exception using errcode='42501',message='One or more requested fields are not authorized'; end if;
  end loop;
  merged:=e.custom_values||patch;
  patch:=patch||jsonb_build_object('name',app_private.combined_name(merged));
 elsif not creating and patch ? 'name' and e.custom_values ?| array['last_name','first_name'] then
  raise exception using errcode='22023',message='Edit the separate name fields to change a structured employee name';
 end if;
 -- Original atomic authorization, validation, version check, audit and outbox.
 perform app_private.patch_employee_v20(eid,expected,patch,creating,target,b,c);
end $$;

create or replace function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.write_requests; item jsonb; gid uuid; affected int; begin
 if operation='employee_create' then
  if not app_private.capability('employee_create') or not app_private.scope_access('C',coalesce(p->>'target_level','unassigned'),(p->>'branch_id')::uuid,(p->>'client_id')::uuid)
   or not app_private.field_access('name','C',coalesce(p->>'target_level','unassigned'),(p->>'branch_id')::uuid,(p->>'client_id')::uuid) then raise exception using errcode='42501',message='Creation scope is not authorized'; end if;
  p:=jsonb_set(p,'{values}',p->'values'||jsonb_build_object('name',app_private.combined_name(p->'values')));
 elsif operation='form_layout' then
  if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin may configure form tabs'; end if;
  if request_id is null or jsonb_typeof(p->'groups') is distinct from 'array' or jsonb_array_length(p->'groups') not between 1 and 100 then
   raise exception using errcode='22023',message='Choose between 1 and 100 groups'; end if;
  perform 1 from public.system_state where id for update;
  select * into existing from public.write_requests w where w.actor_id=auth.uid() and w.request_id=tracker_mutate.request_id;
  if existing.actor_id is not null then
   if existing.operation<>operation or existing.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
   return existing.result;
  end if;
  if (select count(distinct g->>'id') from jsonb_array_elements(p->'groups') g)<>jsonb_array_length(p->'groups') then raise exception 'Duplicate group'; end if;
  if exists(select 1 from jsonb_array_elements(p->'groups') g group by app_private.normalized(g->>'tab_name')
   having count(distinct g->>'tab_name')>1 or count(distinct g->>'tab_order')>1) then raise exception 'Groups in a tab must use the same name and order'; end if;
  for item in select * from jsonb_array_elements(p->'groups') loop
   if jsonb_typeof(item->'tab_name') is distinct from 'string' or length(btrim(item->>'tab_name')) not between 1 and 60
    or item->>'tab_name'<>btrim(item->>'tab_name') or item->>'tab_name'='Record history' then raise exception 'Enter a tab name of 1-60 characters; Record history is reserved'; end if;
   gid:=(item->>'id')::uuid;
   update public.field_groups set tab_name=item->>'tab_name',tab_order=(item->>'tab_order')::int,row_version=row_version+1
    where id=gid and row_version=(item->>'expected_version')::bigint;
   get diagnostics affected=row_count;
   if affected<>1 then raise exception using errcode='40001',message='Field groups changed; reload before applying tabs'; end if;
   perform app_private.audit('group',gid,'form_layout',array['tab_name','tab_order']);
  end loop;
  if exists(select 1 from public.field_groups where tab_name<>'' group by app_private.normalized(tab_name)
   having count(distinct tab_name)>1 or count(distinct tab_order)>1) then raise exception 'Groups in a tab must use the same name and order'; end if;
  perform app_private.changed(null,'schema');
  insert into public.write_requests(actor_id,request_id,operation,payload,result) values(auth.uid(),request_id,operation,p,'{"saved":true}');
  return '{"saved":true}';
 end if;
 return app_private.tracker_mutate_v20(operation,p,request_id);
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
