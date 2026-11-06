do $$ declare g uuid; f record; existing public.field_definitions; begin
 insert into public.field_groups(name,description,display_order,tab_name,tab_order)
 values('Government IDs','Official member and taxpayer identifiers',30,'Government IDs',15)
 on conflict(normalized_name) do nothing;
 select id into g from public.field_groups where normalized_name=app_private.normalized('Government IDs');
 for f in select * from (values
 ('bir_tin','BIR TIN',9,'9-digit personal TIN; exclude the branch code.'),
 ('sss_number','SSS Number',10,'10 digits.'),
 ('philhealth_pin','PhilHealth PIN',12,'12 digits.'),
 ('pagibig_mid','Pag-IBIG MID',12,'12 digits; use the MID, not the registration tracking number.')
 ) defaults(key,label,digits,help_text) loop
  select * into existing from public.field_definitions where key=f.key or normalized_label=app_private.normalized(f.label) order by (key=f.key) desc limit 1;
  if existing.id is null then
   insert into public.field_definitions(group_id,key,label,type,required,sensitivity,list_eligible,validation,help_text)
   values(g,f.key,f.label,'short_text',true,'restricted',false,jsonb_build_object('government_id_digits',f.digits,'max_length',f.digits),f.help_text);
  else
   if existing.type<>'short_text' then raise exception 'Existing government ID % must be reviewed before adding digit validation',f.label; end if;
   update public.field_definitions set required=true,sensitivity='restricted',list_eligible=false,
    validation=validation||jsonb_build_object('government_id_digits',f.digits,'max_length',f.digits),row_version=row_version+1 where id=existing.id;
  end if;
 end loop;
end $$;

-- Extend the existing validator: IDs stay strings so leading zeroes survive.
do $$ begin
 execute replace(pg_get_functiondef('app_private.validate_value(public.field_definitions,jsonb)'::regprocedure),
  'FUNCTION app_private.validate_value(', 'FUNCTION app_private.validate_value_v22(');
end $$;
create or replace function app_private.validate_value(f public.field_definitions,v jsonb) returns void language plpgsql set search_path='' as $$
begin
 if f.validation ? 'government_id_digits' and v<>'null'::jsonb and
  (jsonb_typeof(v)<>'string' or v#>>'{}' !~ ('^[0-9]{'||(f.validation->>'government_id_digits')||'}$')) then
  raise exception using errcode='22023',message='Government ID has an invalid digit count or characters';
 end if;
 perform app_private.validate_value_v22(f,v);
end $$;

-- Canonicalize only authorized incoming values through the existing atomic patch.
-- Do not backfill IDs or require missing historical values on unrelated updates.
do $$ declare definition text; needle text:='where required and active and type<>''system'' and app_private.applicable'; begin
 definition:=pg_get_functiondef('app_private.patch_employee_v20(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Required-field validator changed; review government ID migration'; end if;
 execute replace(definition,needle,'where required and active and type<>''system'' and (not (validation ? ''government_id_digits'') or creating or e.custom_values ? key or patch ? key) and app_private.applicable');
 execute replace(pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),
  'FUNCTION app_private.patch_employee(', 'FUNCTION app_private.patch_employee_v22(');
end $$;
create or replace function app_private.patch_employee(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare kv record; begin
 for kv in select x.key,x.value from jsonb_each(patch) x join public.field_definitions f on f.key=x.key where f.validation ? 'government_id_digits' loop
  if jsonb_typeof(kv.value)='string' then patch:=jsonb_set(patch,array[kv.key],to_jsonb(regexp_replace(kv.value#>>'{}','[ -]','','g'))); end if;
 end loop;
 perform app_private.patch_employee_v22(eid,expected,patch,creating,target,b,c);
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
