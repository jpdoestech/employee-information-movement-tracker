-- Independent emergency address; reuse the existing permission group and form section.
do $$ declare anchor public.field_definitions; address_key text; field_label text; i int:=0; begin
 select * into anchor from public.field_definitions where key in ('emergency_contact_name','emergency_name') order by (key='emergency_contact_name') desc,id limit 1;
 if anchor.id is null then raise exception 'Emergency contact metadata is required'; end if;
 foreach address_key in array array['address','province','city_municipality','barangay','postal_code'] loop
  field_label:=case address_key when 'address' then 'Street / building' when 'province' then 'Province' when 'city_municipality' then 'City / municipality' when 'barangay' then 'Barangay' else 'Postal code' end;
  if exists(select 1 from public.field_definitions where field_definitions.key='emergency_'||address_key or normalized_label=app_private.normalized('Emergency '||field_label)) then raise exception 'Emergency address metadata already exists'; end if;
  insert into public.field_definitions(group_id,form_group_id,key,label,type,options,display_order)
  values(anchor.group_id,anchor.form_group_id,'emergency_'||address_key,'Emergency '||field_label,'short_text','[]',40+i);
  i:=i+1;
 end loop;
 perform app_private.changed(null,'schema');
end $$;
create or replace function app_private.validate_employee_addresses() returns trigger language plpgsql set search_path = '' as $$
declare prefix text; key text; touched boolean; begin
 foreach prefix in array array['','current_','emergency_'] loop
  touched := TG_OP='INSERT';
  if TG_OP='UPDATE' then foreach key in array array['address','province','city_municipality','barangay','postal_code'] loop touched := touched or ((new.custom_values->(prefix||key)) is distinct from (old.custom_values->(prefix||key))); end loop; end if;
  if touched then perform app_private.validate_address(new.custom_values,prefix); end if;
 end loop;
 return new;
end $$;
