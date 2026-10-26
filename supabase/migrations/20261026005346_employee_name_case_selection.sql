-- Case is an entry choice. Preserve submitted spelling through the existing guards.
do $$ declare definition text; forced_case text:=$forced$
 if operation in ('employee_create','employee_update','bulk_update') and jsonb_typeof(p->'values')='object' then
  p:=jsonb_set(p,'{values}',(select coalesce(jsonb_object_agg(key,case
   when key=any(array['name','last_name','first_name','middle_name','suffix']) and jsonb_typeof(value)='string'
   then to_jsonb(upper(value#>>'{}')) else value end),'{}'::jsonb)
   from jsonb_each(p->'values')));
 end if;
 $forced$; upper_name text:='return upper(btrim(v->>''last_name'')||'', ''||concat_ws('' '',btrim(v->>''first_name''),nullif(btrim(v->>''middle_name''),''''),nullif(btrim(v->>''suffix''),'''')));';
begin
 forced_case:=replace(forced_case,chr(13),'');
 definition:=replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),chr(13),'');
 if strpos(definition,forced_case)=0 then raise exception 'Inspect mutation dispatcher before allowing name case choices'; end if;
 execute replace(definition,forced_case,'');
 definition:=pg_get_functiondef('app_private.combined_name(jsonb)'::regprocedure);
 if strpos(definition,upper_name)=0 then raise exception 'Inspect combined-name validation before preserving name case'; end if;
 execute replace(definition,upper_name,'return btrim(v->>''last_name'')||'', ''||concat_ws('' '',btrim(v->>''first_name''),nullif(btrim(v->>''middle_name''),''''),nullif(btrim(v->>''suffix''),''''));');
end $$;
