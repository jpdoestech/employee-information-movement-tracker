create function app_private.movement_endpoint(m public.employee_movements,side text) returns text
language plpgsql stable security definer set search_path='' as $$
declare s jsonb:=case when side='from' then m.previous_state else m.payload end; p record; k text; parts text[]:='{}'; label text; b uuid; c uuid; target text; begin
 select * into p from app_private.placement(m.employee_id,app_private.today());
 if not app_private.employee_access(m.employee_id,'R') then return null; end if;
 if m.type in ('position','status') then
  foreach k in array case when m.type='status' then array['status'] else array['position','department'] end loop
   if m.payload ? k and app_private.field_access(k,'R',p.target,p.branch_id,p.client_id) and s->>k is not null then
    label:=s->>k;
    if k='status' and label in ('Resigned','Terminated') then label:='Separated'; end if;
    parts:=array_append(parts,case when k='department' then 'Department: '||label else label end);
   end if;
  end loop;
  return nullif(array_to_string(parts,' / '),'');
 end if;
 target:=s->>'target_level'; b:=(s->>'branch_id')::uuid; c:=(s->>'client_id')::uuid;
 if target is null or not app_private.scope_access('R',target,b,c) or not app_private.field_access('branch','R',p.target,p.branch_id,p.client_id) or not app_private.field_access('branch','R',target,b,c) then return null; end if;
 if target='head_office' then return 'Head Office'; elsif target='unassigned' then return 'Unassigned'; end if;
 select name into label from public.branches where id=b;
 if target='client' and app_private.field_access('client','R',p.target,p.branch_id,p.client_id) and app_private.field_access('client','R',target,b,c) then
  label:=concat_ws(' / ',label,(select name from public.clients where id=c and branch_id=b));
 end if;
 return label;
end $$;

do $$ declare def text; needle text:='''payload'',case when app_private.is_super()'; begin
 def:=pg_get_functiondef('app_private.movement_rows(uuid,jsonb)'::regprocedure);
 if strpos(def,needle)=0 then raise exception 'Review movement projection before adding endpoints'; end if;
 def:=replace(def,needle,'''from_value'',app_private.movement_endpoint(m,''from''),''to_value'',app_private.movement_endpoint(m,''to''),'||needle);
 execute def;
 def:=pg_get_functiondef('public.record_page(jsonb)'::regprocedure);
 needle:='r->>''employee_number'',r->>''type''';
 if strpos(def,needle)=0 then raise exception 'Review authorized record search before adding endpoints'; end if;
 def:=replace(def,needle,'r->>''employee_number'',r->>''from_value'',r->>''to_value'',r->>''type''');
 execute def;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
