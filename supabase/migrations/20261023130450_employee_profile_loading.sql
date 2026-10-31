-- Old callers retain the full response. Overview reads opt out of history;
-- the history tab uses the existing secured detail path and redaction rules.
do $$
declare definition text; previous text := 'else result:=app_private.tracker_query_before_matrix(operation,q); end if;'; begin
 definition:=pg_get_functiondef('public.tracker_query(text,jsonb)'::regprocedure);
 if strpos(definition,previous)=0 or strpos(definition,'declare result jsonb; catalog jsonb; begin')=0 then
  raise exception 'Unexpected tracker_query definition; inspect before applying profile loading change';
 end if;
 definition:=replace(definition,'declare result jsonb; catalog jsonb; begin','declare result jsonb; catalog jsonb; e public.employees; begin');
 definition:=replace(definition,previous,$replacement$
 elsif operation='employee' and q->'include_history'='false'::jsonb then
  select * into e from public.employees where id=(q->>'id')::uuid and deleted_at is null;
  if e.id is null or not coalesce(app_private.employee_access(e.id,'R'),false) then
   raise exception using errcode='42501',message='Record is unavailable';
  end if;
  result:=jsonb_build_object('employee',app_private.project(e),'fields',app_private.catalog(e.id));
 elsif operation='employee_history' then
  result:=app_private.tracker_query_before_matrix('employee',q);
  result:=jsonb_build_object('assignments',result->'assignments','movements',result->'movements');
 else result:=app_private.tracker_query_before_matrix(operation,q); end if;
 $replacement$);
 execute definition;
end $$;
