-- Form hierarchy is presentation metadata. Existing access groups remain the
-- permission boundary, so regrouping cannot grant access or change inheritance.
alter table public.field_groups add column parent_group_id uuid references public.field_groups(id);
alter table public.field_groups add constraint field_group_reserved_form_names check(normalized_name not in(app_private.normalized('Overview'),app_private.normalized('Record history'),app_private.normalized('Edit details')));
alter table public.field_definitions add column form_group_id uuid references public.field_groups(id);
create index on public.field_groups(parent_group_id);
create index on public.field_definitions(form_group_id);

create function app_private.validate_group_parent() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.system_state where id for update;
 if new.parent_group_id is not null then
  if new.parent_group_id=new.id or not exists(select 1 from public.field_groups where id=new.parent_group_id and parent_group_id is null)
   or exists(select 1 from public.field_groups where parent_group_id=new.id) then
   raise exception using errcode='22023',message='Choose a top-level parent group. Sub-groups cannot contain other sub-groups.';
  end if;
 end if;
 return new;
end $$;
create trigger field_group_parent before insert or update of parent_group_id on public.field_groups
 for each row execute function app_private.validate_group_parent();

-- Keep all field IDs, values, applicability and access-group memberships intact.
do $$ declare personal uuid; employment uuid; details uuid; emergency uuid; gid uuid; begin
 select group_id into personal from public.field_definitions where key='name';
 select group_id into employment from public.field_definitions where key='department';
 select id into details from public.field_groups where normalized_name=app_private.normalized('Personal information') and id<>personal;
 if details is not null then
  update public.field_groups set name=case when exists(select 1 from public.field_groups where normalized_name=app_private.normalized('Personal details') and id<>details) then 'Personal details '||details::text else 'Personal details' end,parent_group_id=personal,row_version=row_version+1 where id=details;
 end if;
 update public.field_groups set name='Personal Information',tab_name='Personal Information',tab_order=0,row_version=row_version+1 where id=personal;
 update public.field_groups set name='Employment Details',tab_name='Employment Details',tab_order=10,row_version=row_version+1 where id=employment;
 update public.field_groups set parent_group_id=personal,row_version=row_version+1
 where id in(select group_id from public.field_definitions where key in('email','phone','bir_tin','sss_number','philhealth_pin','pagibig_mid','address')) and id<>personal;
 insert into public.field_groups(name,parent_group_id,tab_name,tab_order,display_order)
 values('Emergency Information',personal,'Personal Information',0,40) on conflict(normalized_name) do update set parent_group_id=excluded.parent_group_id,row_version=field_groups.row_version+1 returning id into emergency;
 insert into public.field_groups(name,parent_group_id,tab_name,tab_order,display_order)
 values('Compensation',employment,'Employment Details',10,50),('Allowances',employment,'Employment Details',10,60) on conflict(normalized_name) do update set parent_group_id=excluded.parent_group_id,row_version=field_groups.row_version+1;
 update public.field_definitions set form_group_id=personal,row_version=row_version+1
 where key in('last_name','first_name','middle_name','suffix','email','phone','birth_date','gender','civil_status');
 update public.field_definitions set form_group_id=employment,row_version=row_version+1
 where key in('employee_number','client_employee_number','status','position','branch','client');
 update public.field_definitions set form_group_id=emergency,row_version=row_version+1 where key like 'emergency_contact_%';
end $$;

-- Extend the existing versioned/idempotent configuration mutation, rather than
-- adding a second write path or changing its permission checks.
do $$ declare d text; begin
 d:=pg_get_functiondef('app_private.tracker_mutate_v20(text,jsonb,uuid)'::regprocedure);
 if strpos(d,'update public.field_groups set name=')=0 then raise exception 'Review group mutation before applying hierarchy'; end if;
 d:=replace(d,'update public.field_groups set name=', 'update public.field_groups set parent_group_id=case when p ? ''parent_group_id'' then nullif(p->>''parent_group_id'','''')::uuid else parent_group_id end,name=');
 d:=replace(d,'insert into public.field_groups(name,description) values(p->>''name'',coalesce(p->>''description'',''''))', 'insert into public.field_groups(name,description,parent_group_id) values(p->>''name'',coalesce(p->>''description'',''''),nullif(p->>''parent_group_id'','''')::uuid)');
 -- Both field create/update branches return the configured field ID in eid.
 if strpos(d,'perform app_private.audit(''field'',eid')=0 then raise exception 'Review field mutation before applying form section'; end if;
 d:=replace(d,'perform app_private.audit(''field'',eid', 'if p ? ''form_group_id'' then update public.field_definitions set form_group_id=nullif(p->>''form_group_id'','''')::uuid where id=eid; end if; perform app_private.audit(''field'',eid');
 execute d;
end $$;

-- Include only the presentation sections and their parent names needed by the
-- authorized field catalog. No additional fields or employee values are exposed.
do $$ declare d text; needle text:='g.id::text in(select f->>''group_id'' from jsonb_array_elements(app_private.catalog()) f)'; begin
 d:=pg_get_functiondef('public.tracker_query(text,jsonb)'::regprocedure);
 if strpos(d,needle)=0 then raise exception 'Review context projection before applying hierarchy'; end if;
 d:=replace(d,needle,$predicate$
 g.id in(select section.id from public.field_groups section where
 section.id::text in(select coalesce(f->>'form_group_id',f->>'group_id') from jsonb_array_elements(app_private.catalog()) f)
 or section.id in(select child.parent_group_id from public.field_groups child where child.id::text in(select coalesce(f->>'form_group_id',f->>'group_id') from jsonb_array_elements(app_private.catalog()) f)))
 or g.id::text in(select f->>'group_id' from jsonb_array_elements(app_private.catalog()) f)
 $predicate$);
 execute d;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
