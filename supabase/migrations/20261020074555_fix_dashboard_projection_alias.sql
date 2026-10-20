-- Separate the projected-row column from tracker_query's JSON result variable.
do $$
declare definition text; first_pos integer; last_pos integer; dashboard text;
begin
 definition:=pg_get_functiondef('public.tracker_query(text,jsonb)'::regprocedure);
 first_pos:=strpos(definition,'elsif operation=''dashboard'' then');
 last_pos:=strpos(definition,'elsif operation=''schema'' then');
 if first_pos=0 or last_pos<=first_pos then
  raise exception 'Review dashboard query before applying the alias correction';
 end if;
 dashboard:=substr(definition,first_pos,last_pos-first_pos);
 if strpos(dashboard,'select projected_row r from app_private.readable_employee_rows()')=0 then
  raise exception 'Unexpected dashboard projection; no changes applied';
 end if;
 dashboard:=replace(dashboard,'select projected_row r from','select projected_row dashboard_row from');
 dashboard:=replace(dashboard,'r->','dashboard_row->');
 definition:=overlay(definition placing dashboard from first_pos for last_pos-first_pos);
 execute definition;
end $$;
