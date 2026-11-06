-- An editable employee attribute, independent of placement and login roles.
-- Existing records stay unclassified until an authorized operator chooses a value.
do $$ declare employment public.field_definitions; begin
 select * into employment from public.field_definitions where key='employment_type';
 if employment.id is null then raise exception 'Employment metadata is required'; end if;
 if exists(select 1 from public.field_definitions where key='employee_category'
  or normalized_label=app_private.normalized('Employee Category')) then
  raise exception 'Employee Category already exists; review its identity before migration';
 end if;
 insert into public.field_definitions(group_id,form_group_id,key,label,type,options,display_order)
 values(employment.group_id,employment.form_group_id,'employee_category','Employee Category','select','["Admin","Agency"]',0);
 perform app_private.changed(null,'schema');
end $$;
