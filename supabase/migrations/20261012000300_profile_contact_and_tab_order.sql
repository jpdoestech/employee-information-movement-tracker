-- Presentation changes only; retain each field's group and authorization identity.
-- Contact defaults must also exist on hosted installations without sample seed data.
insert into public.field_groups(id,name,description,display_order,tab_name,tab_order)
 values('10000000-0000-0000-0000-000000000002','Contact information','Contact details',1,'Profile',0)
 on conflict do nothing;
do $$ declare g uuid; f record; begin
 select id into g from public.field_groups where normalized_name=app_private.normalized('Contact information');
 for f in select * from (values ('email','Email','email',0),('phone','Phone','phone',1)) defaults(key,label,type,display_order) loop
  if not exists(select 1 from public.field_definitions where key=f.key or normalized_label=app_private.normalized(f.label)) then
   insert into public.field_definitions(group_id,key,label,type,display_order) values(g,f.key,f.label,f.type,f.display_order);
  end if;
 end loop;
end $$;
update public.field_groups set tab_name='Profile',tab_order=0,row_version=row_version+1
 where normalized_name=app_private.normalized('Contact information');
update public.field_groups set tab_name='Government ID',tab_order=10,row_version=row_version+1
 where normalized_name=app_private.normalized('Government IDs');
insert into public.field_groups(name,description,display_order,tab_name,tab_order)
 values('Additional information','Administrator-added fields',40,'Additional information',30)
 on conflict(normalized_name) do nothing;
