-- Rename a group's own tab in the existing authorized, versioned transaction.
-- Explicit custom names and tabs shared by several groups retain their layout.
create function app_private.follow_group_tab_name() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.name is distinct from old.name and new.tab_name=old.tab_name
    and old.tab_name=old.name
    and not exists(select 1 from public.field_groups g
      where g.id<>old.id and g.tab_name=old.tab_name) then
   new.tab_name:=new.name;
 end if;
 return new;
end $$;
revoke all on function app_private.follow_group_tab_name() from public,anon,authenticated;
create trigger follow_group_tab_name before update of name on public.field_groups
for each row execute function app_private.follow_group_tab_name();
