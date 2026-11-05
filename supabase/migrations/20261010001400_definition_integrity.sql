-- Metadata is data: validate definitions without ALTER TABLE per custom field.
create function app_private.validate_definition() returns trigger language plpgsql
set search_path = '' as $$ begin
 if new.type='select' then
  if jsonb_array_length(new.options)=0 or exists(select 1 from jsonb_array_elements(new.options) o where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}'))=0)
   or (select count(*) from jsonb_array_elements(new.options))<>(select count(distinct o) from jsonb_array_elements(new.options) o)
  then raise exception using errcode='22023',message='Dropdown choices must be nonempty, distinct strings'; end if;
 end if;
 if new.validation ? 'min' and new.validation ? 'max' and (new.validation->>'min')::numeric>(new.validation->>'max')::numeric then
  raise exception using errcode='22023',message='Minimum must not exceed maximum';
 end if;
 if new.default_value is not null and new.default_value<>'null'::jsonb and new.type<>'system' then
  perform app_private.validate_value(new,new.default_value);
 end if;
 return new;
end $$;
revoke all on function app_private.validate_definition() from public,anon,authenticated;
create trigger validate_field_definition before insert or update on public.field_definitions
for each row execute function app_private.validate_definition();

create function app_private.validate_scope_reference() returns trigger language plpgsql
set search_path = '' as $$ begin
 if new.scope_type='branch' and not exists(select 1 from public.branches where id=new.scope_id)
  or new.scope_type='client' and not exists(select 1 from public.clients where id=new.scope_id) then
  raise exception using errcode='23503',message='Organization scope does not exist';
 end if;
 return new;
end $$;
revoke all on function app_private.validate_scope_reference() from public,anon,authenticated;
create trigger scope_grant_reference before insert or update on public.user_scope_grants for each row execute function app_private.validate_scope_reference();
create trigger field_policy_reference before insert or update on public.field_access_policies for each row execute function app_private.validate_scope_reference();
create trigger field_target_reference before insert or update on public.field_scope_targets for each row execute function app_private.validate_scope_reference();
