-- Normalize submitted text only; existing rows and exact credentials stay intact.
create function app_private.normalize_inputs(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; item record; text_value text;
begin
 case jsonb_typeof(value)
 when 'string' then
  text_value:=btrim(regexp_replace(value#>>'{}',E'[ \t\u00a0]+',' ','g'),E' \t\r\n\u00a0');
  return to_jsonb(regexp_replace(text_value,E' *\r?\n *',E'\n','g'));
 when 'object' then
  result:='{}';
  for item in select key,v from jsonb_each(value) x(key,v) loop
   result:=result||jsonb_build_object(item.key,case when item.key=any(array['password','new_password','current_password','token','access_token','refresh_token','duplicate_review','config']) then item.v else app_private.normalize_inputs(item.v) end);
  end loop;
  return result;
 when 'array' then
  select coalesce(jsonb_agg(app_private.normalize_inputs(v) order by ord),'[]') into result from jsonb_array_elements(value) with ordinality x(v,ord);
  return result;
 else return value;
 end case;
end $$;
revoke all on function app_private.normalize_inputs(jsonb) from public,anon,authenticated;

do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure);
 if strpos(definition,'if operation=''access_role'' then')=0 then raise exception 'Inspect mutation dispatcher before normalizing inputs'; end if;
 definition:=regexp_replace(definition,'\mBEGIN\M',$body$BEGIN
 p:=app_private.normalize_inputs(p);
 if operation='employee_create' and p->>'target_level' in ('head_office','branch','client') then
  p:=jsonb_set(p,'{values}',coalesce(p->'values','{}')||jsonb_build_object('employee_category',case when p->>'target_level'='head_office' then 'Admin' else 'Agency' end));
 end if;
 $body$,'i');
 execute definition;
 -- Direct client-settings saves use a separate secured endpoint.
 definition:=pg_get_functiondef('public.set_client_settings(jsonb,uuid)'::regprocedure);
 execute regexp_replace(definition,'\mBEGIN\M','BEGIN p:=app_private.normalize_inputs(p);','i');
end $$;

-- Initial classification is generated, not a user-selectable field write.
-- Existing record edits still pass the unchanged field authorization path.
do $$ declare definition text; call text:='perform app_private.patch_employee_before_matrix(eid,expected,patch,creating,target,b,c);'; generated text:=$generated$
 if creating and target in ('head_office','branch','client') then
  update public.employees set custom_values=custom_values||jsonb_build_object('employee_category',case when target='head_office' then 'Admin' else 'Agency' end) where id=eid and deleted_at is null;
 end if;
 $generated$;
begin
 definition:=pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure);
 if strpos(definition,call)=0 then raise exception 'Inspect employee patch authorization before generating category'; end if;
 definition:=replace(definition,call,generated||'if creating and target in (''head_office'',''branch'',''client'') then patch:=patch-''employee_category''; end if;'||call||generated);
 execute definition;
end $$;
