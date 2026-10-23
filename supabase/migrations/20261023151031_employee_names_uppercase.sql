-- Canonicalize submitted identity values before the existing permission/validation path.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure);
 if strpos(definition,'p:=app_private.normalize_inputs(p);')=0 then
  raise exception 'Inspect employee mutation path before enforcing uppercase names';
 end if;
 execute replace(definition,'p:=app_private.normalize_inputs(p);',$body$p:=app_private.normalize_inputs(p);
 if operation in ('employee_create','employee_update','bulk_update') and jsonb_typeof(p->'values')='object' then
  p:=jsonb_set(p,'{values}',(select coalesce(jsonb_object_agg(key,case
   when key=any(array['name','last_name','first_name','middle_name','suffix']) and jsonb_typeof(value)='string'
   then to_jsonb(upper(value#>>'{}')) else value end),'{}'::jsonb)
   from jsonb_each(p->'values')));
 end if;
 $body$);
 definition:=pg_get_functiondef('app_private.combined_name(jsonb)'::regprocedure);
 if strpos(definition,'return btrim(v->>''last_name'')')=0 then
  raise exception 'Inspect combined-name validation before enforcing uppercase names';
 end if;
 definition:=replace(definition,
  'return btrim(v->>''last_name'')||'', ''||concat_ws('' '',btrim(v->>''first_name''),nullif(btrim(v->>''middle_name''),''''),nullif(btrim(v->>''suffix''),''''));',
  'return upper(btrim(v->>''last_name'')||'', ''||concat_ws('' '',btrim(v->>''first_name''),nullif(btrim(v->>''middle_name''),''''),nullif(btrim(v->>''suffix''),'''')));');
 execute definition;
end $$;
