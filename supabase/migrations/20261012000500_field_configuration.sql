-- Display sizing is numeric metadata, separate from stored value length.
-- Existing authorization, definition validation and permission inheritance remain in force.
create function app_private.validate_field_configuration() returns trigger
language plpgsql set search_path='' as $$
declare rule record; n numeric; configuration_changed boolean;
begin
 configuration_changed := case when tg_op='INSERT' then
   new.options<>'[]'::jsonb or new.validation<>'{}'::jsonb or (new.default_value is not null and new.default_value<>'null'::jsonb)
  else new.options is distinct from old.options or new.validation is distinct from old.validation
   or nullif(new.default_value,'null'::jsonb) is distinct from nullif(old.default_value,'null'::jsonb) end;
 if auth.uid() is not null and configuration_changed and not app_private.is_super() then
  raise exception using errcode='42501',message='Only a Superadmin may configure choices, defaults and validation';
 end if;
 if jsonb_typeof(new.validation)<>'object' then
  raise exception using errcode='22023',message='Validation must be an object';
 end if;
 for rule in select key,value from jsonb_each(new.validation) loop
  if jsonb_typeof(rule.value)<>'number' then
   raise exception using errcode='22023',message='Validation values must be numbers';
  end if;
  n:=(rule.value#>>'{}')::numeric;
  if rule.key='input_width' and (n<>trunc(n) or n<10 or n>80) then
   raise exception using errcode='22023',message='Input width must be a whole number from 10 to 80 characters';
  elsif rule.key='max_length' and (n<>trunc(n) or n<1 or n>10000) then
   raise exception using errcode='22023',message='Maximum length must be a whole number from 1 to 10000';
  end if;
 end loop;
 if new.type='select' and (select count(*) from jsonb_array_elements_text(new.options))<>
   (select count(distinct lower(trim(value))) from jsonb_array_elements_text(new.options)) then
  raise exception using errcode='22023',message='Dropdown choices must be distinct';
 end if;
 return new;
end $$;
revoke all on function app_private.validate_field_configuration() from public,anon,authenticated;
create trigger validate_field_configuration before insert or update on public.field_definitions
for each row execute function app_private.validate_field_configuration();
