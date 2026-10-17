-- One confirmed profile save: field patch and position movement commit or roll back together.
-- Keep the existing request ledger, locks, projection and movement authorization path.
do $$ declare definition text; needle text := 'eid:=(p->>''id'')::uuid;perform app_private.patch_employee(eid,(p->>''expected_version'')::bigint,p->''values'');result:=jsonb_build_object(''id'',eid,''employee_id'',eid);'; begin
 definition:=pg_get_functiondef('app_private.tracker_mutate_v20(text,jsonb,uuid)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Employee update function changed; review profile position migration'; end if;
 definition:=replace(definition,needle,$replacement$
 eid:=(p->>'id')::uuid;
 if p ? 'position_change' then
  if jsonb_typeof(p->'position_change') is distinct from 'string' or length(btrim(p->>'position_change')) not between 1 and 200 then
   raise exception using errcode='22023',message='Enter a position of 1-200 characters';
  end if;
  -- Empty patches are allowed only for a position-only save, which move_employee validates.
  if jsonb_typeof(p->'values') is distinct from 'object' then raise exception using errcode='22023',message='Invalid employee values'; end if;
  if p->'values'<>'{}'::jsonb then
   perform app_private.patch_employee(eid,(p->>'expected_version')::bigint,p->'values');
  end if;
  perform app_private.move_employee(jsonb_build_object(
   'employee_id',eid,'expected_version',case when p->'values'='{}'::jsonb then (p->>'expected_version')::bigint else (select row_version from public.employees where id=eid) end,
   'type','position','position',btrim(p->>'position_change'),'effective_on',app_private.today(),
   'reason','Position updated from employee profile'));
 else
  perform app_private.patch_employee(eid,(p->>'expected_version')::bigint,p->'values');
 end if;
 result:=jsonb_build_object('id',eid,'employee_id',eid);
 $replacement$);
 execute definition;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
