-- Expand metadata without rewriting historical employee values.
alter table public.field_definitions add column is_unique boolean not null default false;
alter table public.field_definitions add column unique_scope text not null default 'global' check(unique_scope in ('global','client'));

-- New policy: all four Government IDs are required; historical gaps are retained.
drop trigger optional_government_ids on public.field_definitions;
drop function app_private.optional_government_ids();
create function app_private.required_government_ids() returns trigger language plpgsql set search_path='' as $$
begin if new.validation ? 'government_id_digits' then new.required:=true; end if; return new; end $$;
create trigger required_government_ids before insert or update on public.field_definitions
 for each row execute function app_private.required_government_ids();
update public.field_definitions set required=true,row_version=row_version+1 where validation ? 'government_id_digits';

do $$ declare access_group uuid; form_group uuid; begin
 select group_id into access_group from public.field_definitions where key='name';
 select coalesce(form_group_id,group_id) into form_group from public.field_definitions where key='department';
 insert into public.field_definitions(group_id,form_group_id,key,label,type,required,options,default_value,display_order,help_text)
 values(access_group,form_group,'manpower_classification','Employment Manpower Classification','select',true,
 '["New/Additional","Replacement"]','"New/Additional"',5,'Replacement requires an authorized employee who is not active.');
 insert into public.field_definitions(group_id,form_group_id,key,label,type,list_eligible,validation,display_order)
 values(access_group,form_group,'replaced_employee_id','Employee replaced','short_text',false,'{"max_length":36}',6);
end $$;

-- Metadata readers already project to_jsonb(field); older callers can omit the flag.
do $$ declare d text; needle text; begin
 d:=pg_get_functiondef('app_private.tracker_mutate_v20(text,jsonb,uuid)'::regprocedure);
 needle:='update public.field_definitions set group_id=';
 if strpos(d,needle)=0 then raise exception 'Review field mutation before adding uniqueness'; end if;
 d:=replace(d,needle,'update public.field_definitions set is_unique=case when p ? ''is_unique'' then (p->>''is_unique'')::boolean else f.is_unique end,unique_scope=coalesce(p->>''unique_scope'',f.unique_scope),group_id=');
 needle:='insert into public.field_definitions(group_id,key,label,type,';
 if strpos(d,needle)=0 then raise exception 'Review field creation before adding uniqueness'; end if;
 d:=replace(d,needle,'insert into public.field_definitions(is_unique,unique_scope,group_id,key,label,type,');
 d:=replace(d,'values((p->>''group_id'')::uuid,p->>''key'',p->>''label'',p->>''type'',',
 'values(coalesce((p->>''is_unique'')::boolean,false),coalesce(p->>''unique_scope'',''global''),(p->>''group_id'')::uuid,p->>''key'',p->>''label'',p->>''type'',');
 d:=replace(d,'array[''label'',''group_id'',''scope_mode'',''sensitivity'']','array[''label'',''group_id'',''scope_mode'',''sensitivity'',''is_unique'',''unique_scope'']');
 execute d;
end $$;

create function app_private.unique_value(f public.field_definitions,v jsonb) returns bytea
language plpgsql immutable set search_path='' as $$
declare text_value text; begin
 if v is null or v='null'::jsonb then return null; end if;
 text_value:=v#>>'{}';
 if nullif(app_private.normalized(text_value),'') is null then return null; end if;
 if f.validation ? 'government_id_digits' or f.type='phone' then
  text_value:=regexp_replace(text_value,'[ -]','','g');
 elsif jsonb_typeof(v)='number' then text_value:=trim_scale(text_value::numeric)::text;
 else text_value:=app_private.normalized(text_value); end if;
 -- A fixed-size key supports long text without PostgreSQL's btree text-size limit.
 return sha256(convert_to(text_value,'UTF8'));
end $$;

create table app_private.unique_field_values(
 field_id uuid not null references public.field_definitions(id) on delete cascade,
 scope_id uuid not null,
 employee_id uuid not null references public.employees(id) on delete cascade,
 value_hash bytea not null,
 primary key(field_id,scope_id,value_hash), unique(field_id,employee_id,scope_id)
);
alter table app_private.unique_field_values enable row level security;
revoke all on app_private.unique_field_values from public,anon,authenticated,service_role;

create function app_private.unique_field_settings() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed boolean; begin
 changed:=case when tg_op='INSERT' then new.is_unique or new.unique_scope<>'global'
  else new.is_unique is distinct from old.is_unique or new.unique_scope is distinct from old.unique_scope end;
 if changed and auth.uid() is not null and not app_private.is_super() then
  raise exception using errcode='42501',message='Only a Superadmin may configure unique fields';
 end if;
 if new.is_unique and new.type='system' then
  raise exception using errcode='22023',message='System IDs retain their existing allocation and uniqueness rules';
 end if;
 return new;
end $$;
create trigger unique_field_settings before insert or update on public.field_definitions
 for each row execute function app_private.unique_field_settings();

create function app_private.unique_scopes(f public.field_definitions,eid uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
 select '00000000-0000-0000-0000-000000000000'::uuid where f.unique_scope='global'
 union all select distinct client_id from public.employee_assignments
 where f.unique_scope='client' and employee_id=eid and category='primary' and not voided and client_id is not null
$$;

create function app_private.rebuild_unique_field() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.is_unique=old.is_unique and new.unique_scope=old.unique_scope and new.type=old.type
  and new.key=old.key and new.validation=old.validation then return new; end if;
 -- Reuse the existing mutation serialization boundary, also for trusted SQL callers.
 perform 1 from public.system_state where id=true for update;
 delete from app_private.unique_field_values where field_id=new.id;
 if new.is_unique then
  insert into app_private.unique_field_values(field_id,scope_id,employee_id,value_hash)
   select new.id,scope,e.id,app_private.unique_value(new,e.custom_values->new.key)
   from public.employees e cross join lateral app_private.unique_scopes(new,e.id) scope
   where app_private.unique_value(new,e.custom_values->new.key) is not null;
 end if;
 return new;
exception when unique_violation then
 raise exception using errcode='23505',message='Cannot enable uniqueness: existing non-empty values are duplicated. Resolve them first.';
end $$;
create trigger rebuild_unique_field after insert or update on public.field_definitions
 for each row execute function app_private.rebuild_unique_field();

create function app_private.sync_employee_unique(eid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.field_definitions; e public.employees; hash bytea; begin
 perform 1 from public.system_state where id=true for update;
 select * into e from public.employees where id=eid;
 if not found then return; end if;
 for f in select * from public.field_definitions where is_unique order by id loop
  hash:=app_private.unique_value(f,e.custom_values->f.key);
  delete from app_private.unique_field_values where field_id=f.id and employee_id=eid;
  if hash is not null then
   begin
    insert into app_private.unique_field_values(field_id,scope_id,employee_id,value_hash)
     select f.id,scope,eid,hash from app_private.unique_scopes(f,eid) scope;
   exception when unique_violation then
    raise exception using errcode='23505',message=format('%s must have a unique value.',f.label);
   end;
  end if;
 end loop;
end $$;
create function app_private.sync_unique_values() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='employees' then
  if tg_op='UPDATE' and new.custom_values=old.custom_values then return new; end if;
  perform app_private.sync_employee_unique(new.id);
 elsif tg_op='DELETE' then perform app_private.sync_employee_unique(old.employee_id); return old;
 else perform app_private.sync_employee_unique(new.employee_id); end if;
 return new;
end $$;
create trigger sync_unique_values after insert or update of custom_values on public.employees
 for each row execute function app_private.sync_unique_values();
-- Reserve per-client values for non-voided primary placements, including scheduled
-- placements and archived employees, just as client-issued IDs retain their history.
create trigger sync_assignment_unique_values after insert or update or delete on public.employee_assignments
 for each row execute function app_private.sync_unique_values();

create function app_private.validate_manpower(eid uuid,v jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare replaced public.employees; projected jsonb; begin
 if v->>'manpower_classification' is null or v->>'manpower_classification' not in ('New/Additional','Replacement') then
  raise exception using errcode='22023',message='Choose New/Additional or Replacement for Employment Manpower Classification';
 end if;
 if v->>'manpower_classification'='Replacement' then
  if nullif(v->>'replaced_employee_id','') is null then
   raise exception using errcode='22023',message='Select the employee being replaced';
  end if;
  select * into replaced from public.employees where id=(v->>'replaced_employee_id')::uuid and deleted_at is null for share;
  if replaced.id is null or replaced.id=eid then
   raise exception using errcode='42501',message='Replacement employee is unavailable';
  end if;
  projected:=app_private.project(replaced);
  if nullif(projected->'values'->>'name','') is null or projected->'values'->>'status' is null then
   raise exception using errcode='42501',message='Replacement employee is unavailable';
  end if;
  if app_private.effective_value(replaced,'status',app_private.today())#>>'{}' not in ('Inactive','Separated') then
   raise exception using errcode='22023',message='Only an employee who is not active can be replaced';
  end if;
 elsif nullif(v->>'replaced_employee_id','') is not null then
  raise exception using errcode='22023',message='An employee being replaced is only valid for Replacement';
 end if;
end $$;

-- Keep incomplete historical records editable, without bypassing the new create rule.
do $$ declare d text; needle text:='where required and active and type<>''system'''; begin
 d:=pg_get_functiondef('app_private.patch_employee_v20(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure);
 if strpos(d,needle)=0 then raise exception 'Review required-field validation before manpower migration'; end if;
 d:=replace(d,needle,needle||' and (key<>''manpower_classification'' or creating or e.custom_values ? key or patch ? key)');
 d:=replace(d,'e.custom_values ? key','nullif(e.custom_values->>key,'''') is not null');
 execute d;
 execute replace(pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),
  'FUNCTION app_private.patch_employee(', 'FUNCTION app_private.patch_employee_before_manpower(');
end $$;
create or replace function app_private.patch_employee(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare e public.employees; begin
 perform app_private.patch_employee_before_manpower(eid,expected,patch,creating,target,b,c);
 if creating or patch ?| array['manpower_classification','replaced_employee_id'] then
  select * into e from public.employees where id=eid;
  perform app_private.validate_manpower(eid,e.custom_values);
 end if;
end $$;
-- Movement destination patches also write custom_values, sharing the same validation.
create function app_private.manpower_values_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.custom_values->'manpower_classification' is distinct from old.custom_values->'manpower_classification'
  or new.custom_values->'replaced_employee_id' is distinct from old.custom_values->'replaced_employee_id' then
  perform app_private.validate_manpower(new.id,new.custom_values);
 end if;
 return new;
end $$;
create trigger manpower_values_changed before update of custom_values on public.employees
 for each row execute function app_private.manpower_values_changed();
revoke all on all functions in schema app_private from public,anon,authenticated;
