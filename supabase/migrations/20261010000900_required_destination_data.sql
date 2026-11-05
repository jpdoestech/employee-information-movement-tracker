create function app_private.destination_values(e public.employees,patch jsonb,target text,b uuid,c uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare merged jsonb:=e.custom_values; f public.field_definitions; kv record; action text; begin
 if patch is null or jsonb_typeof(patch)<>'object' then raise exception 'Destination values must be an object'; end if;
 for kv in select * from jsonb_each(patch) loop
 select * into f from public.field_definitions where key=kv.key and active and type<>'system';
 action:=case when kv.value='null'::jsonb then 'D' else 'U' end;
 if f.id is null or not app_private.field_access(kv.key,action,target,b,c) then raise exception using errcode='42501',message='Destination field is not authorized'; end if;
 perform app_private.validate_value(f,kv.value);
 if kv.value='null'::jsonb then merged:=merged-kv.key;else merged:=merged||jsonb_build_object(kv.key,kv.value); end if;
 end loop;
 for f in select * from public.field_definitions where active and required and type<>'system' and app_private.applicable(field_definitions,target,b,c) and exists(select 1 from public.field_groups g where g.id=group_id and g.active) loop
 if not merged ? f.key or merged->f.key='null'::jsonb then raise exception using errcode='22023',message='Destination requires additional data from an authorized administrator'; end if;
 perform app_private.validate_value(f,merged->f.key);
 end loop;
 return merged;
end $$;
revoke all on function app_private.destination_values(public.employees,jsonb,text,uuid,uuid) from public,anon,authenticated;
