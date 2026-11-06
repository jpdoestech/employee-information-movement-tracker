create function app_private.patch_employee(eid uuid, expected bigint, patch jsonb, creating boolean default false, target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path = '' as $$
declare e public.employees; p record; f public.field_definitions; kv record; action text; merged jsonb; begin
 select * into e from public.employees where id=eid and deleted_at is null for update;
 if e.id is null then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if not creating then select * into p from app_private.placement(eid,app_private.today()); end if;
 -- p uses positional attributes only for create; normalize via explicit target variables.
 if not creating then target:=p.target;b:=p.branch_id;c:=p.client_id; end if;
 if creating and not app_private.scope_access('C',target,b,c) then raise exception using errcode='42501',message='Access denied'; end if;
 if not creating and not (app_private.scope_access('U',target,b,c) or app_private.scope_access('D',target,b,c)) then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if expected is null or expected<>e.row_version then raise exception using errcode='40001',message='Revision conflict: reload before reapplying your draft'; end if;
 if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb or patch ?| array['employee_number','status','position','branch','client','id','row_version'] then raise exception using errcode='22023',message='System fields require a movement transaction'; end if;
 merged:=e.custom_values;
 if creating then for f in select * from public.field_definitions where active and type<>'system' and default_value is not null and app_private.field_access(key,'C',target,b,c) loop if not patch ? f.key then perform app_private.validate_value(f,f.default_value);merged:=merged||jsonb_build_object(f.key,f.default_value); end if;end loop;end if;
 for kv in select * from jsonb_each(patch) loop
 select * into f from public.field_definitions where key=kv.key and active;
 action:=case when creating then 'C' when kv.value='null'::jsonb then 'D' else 'U' end;
 if f.id is null or not app_private.field_access(kv.key,action,target,b,c) then raise exception using errcode='42501',message='One or more requested fields are not authorized'; end if;
 if kv.key='name' then
 if kv.value='null'::jsonb or jsonb_typeof(kv.value)<>'string' or length(trim(kv.value#>>'{}')) not between 1 and 200 then raise exception 'Enter an employee name'; end if;
 else perform app_private.validate_value(f,kv.value); if kv.value='null'::jsonb then merged:=merged-kv.key; else merged:=merged||jsonb_build_object(kv.key,kv.value); end if; end if;
 end loop;
 for f in select * from public.field_definitions where required and active and type<>'system' and app_private.applicable(field_definitions,target,b,c) and exists(select 1 from public.field_groups fg where fg.id=group_id and fg.active) loop
 if not merged ? f.key or merged->f.key='null'::jsonb then
 -- Required values cannot be silently bypassed because the operator cannot see them.
 if not app_private.field_access(f.key,case when creating then 'C' else 'U' end,target,b,c) then raise exception using errcode='42501',message='Required data needs an authorized administrator'; end if;
 raise exception using errcode='22023',message='Complete the applicable required fields'; end if;
 end loop;
 update public.employees set name=coalesce(patch->>'name',name),custom_values=merged,row_version=row_version+case when creating then 0 else 1 end,updated_at=now() where id=eid;
 perform app_private.audit('employee',eid,case when creating then 'create' else 'update' end,array(select jsonb_object_keys(patch)));
 perform app_private.changed(eid,'employee');
end $$;

create function app_private.move_employee(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.employees; old record; atdate record; m public.employee_movements; typ text:=p->>'type'; d date:=(p->>'effective_on')::date; dest text:=p->>'target_level'; b uuid:=(p->>'branch_id')::uuid; c uuid:=(p->>'client_id')::uuid; cat text:=coalesce(p->>'category','primary'); mid uuid:=gen_random_uuid(); prev jsonb; enddate date:=(p->>'ends_on')::date; a public.employee_assignments; merged jsonb; begin
 if not app_private.capability('movement_create') then raise exception using errcode='42501',message='Access denied'; end if;
 select * into e from public.employees where id=(p->>'employee_id')::uuid and deleted_at is null for update;
 if e.id is null or not app_private.employee_access(e.id,'U') then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if p->>'expected_version' is null or e.row_version<>(p->>'expected_version')::bigint then raise exception using errcode='40001',message='Movement preview is stale; reload before confirming'; end if;
 if d is null or typ not in ('transfer','deployment','reassignment','return','temporary','position','status') then raise exception 'Choose a supported movement and date'; end if;
 select * into old from app_private.placement(e.id,app_private.today());
 select * into atdate from app_private.placement(e.id,d);
 if not app_private.scope_access('U',atdate.target,atdate.branch_id,atdate.client_id) or not app_private.field_access(case when typ='status' then 'status' when typ='position' then 'position' else 'branch' end,'U',old.target,old.branch_id,old.client_id) then raise exception using errcode='42501',message='Movement scope is not authorized'; end if;
 if typ='return' and p ? 'assignment_id' then select * into a from public.employee_assignments where id=(p->>'assignment_id')::uuid and employee_id=e.id and not voided for update; if a.id is null then raise exception 'Selected placement is unavailable'; end if; if a.category<>'primary' then cat:='additional'; end if; end if;
 prev:=jsonb_build_object('target_level',atdate.target,'branch_id',atdate.branch_id,'client_id',atdate.client_id,'status',app_private.effective_value(e,'status',d),'position',app_private.effective_value(e,'position',d),'closed_intervals',(select coalesce(jsonb_agg(jsonb_build_object('id',closed.id,'ends_on',closed.ends_on,'voided',closed.voided)),'[]') from public.employee_assignments closed where closed.employee_id=e.id and not closed.voided and closed.starts_on<=d and(closed.ends_on is null or closed.ends_on>d)));
 if typ in ('position','status') then
 if typ='position' and length(trim(coalesce(p->>'position',''))) not between 1 and 200 then raise exception 'Enter a position'; end if;
 if typ='status' and coalesce(p->>'status','') not in ('Active','Inactive','Resigned','Terminated') then raise exception 'Choose a supported status'; end if;
 if exists(select 1 from public.employee_movements where employee_id=e.id and type=typ and effective_on>=d and voided_at is null) then raise exception using errcode='23P01',message='Resolve the conflicting scheduled event first'; end if;
 if typ='status' and p->>'status'<>'Active' then
 if exists(select 1 from public.employee_assignments where employee_id=e.id and not voided and starts_on>=d) then raise exception using errcode='23P01',message='Cancel or reschedule future placements before separation'; end if;
 end if;
 else
 if dest='unassigned' and typ<>'return' then raise exception 'Only return/pull-out can mark unassigned'; end if;
 if dest not in ('head_office','branch','client','unassigned') or dest is null then raise exception 'Choose a destination'; end if;
 if dest in ('head_office','unassigned') and(b is not null or c is not null) or dest='branch' and(b is null or c is not null) or dest='client' and(b is null or c is null) then raise exception 'Destination relationships are invalid'; end if;
 if not app_private.scope_access('U',dest,b,c) then raise exception using errcode='42501',message='Destination is not authorized'; end if;
 if b is not null and not exists(select 1 from public.branches where id=b and active) or c is not null and not exists(select 1 from public.clients where id=c and branch_id=b and active) then raise exception 'Destination is inactive or invalid'; end if;
 if typ='deployment' and dest<>'client' then raise exception 'Deployment requires a client'; end if;
 if typ='transfer' and b is not distinct from atdate.branch_id then raise exception 'Transfer requires a different branch'; end if;
 if typ='temporary' then cat:='temporary'; if enddate is null then raise exception 'Temporary assignment requires an end date'; end if; end if;
 if cat not in ('primary','additional','temporary') or enddate is not null and enddate<=d then raise exception 'Assignment category or interval is invalid'; end if;
 if app_private.effective_value(e,'status',d)#>>'{}'<>'Active' then raise exception 'Employee is not active on the movement date'; end if;
 if exists(select 1 from public.employee_movements where employee_id=e.id and type='status' and payload->>'status'<>'Active' and effective_on>d and voided_at is null and(enddate is null or effective_on<enddate)) then raise exception 'Placement crosses a scheduled separation; resolve schedules first'; end if;
 if cat='primary' and exists(select 1 from public.employee_assignments where employee_id=e.id and category='primary' and not voided and starts_on>=d and source_movement_id is not null) then raise exception using errcode='23P01',message='Resolve the conflicting scheduled primary placement first'; end if;
 end if;
 if typ not in ('position','status','temporary') and cat='primary' then merged:=app_private.destination_values(e,coalesce(p->'values','{}'),dest,b,c); update public.employees set custom_values=merged where id=e.id; end if;
 insert into public.employee_movements(id,employee_id,type,effective_on,reason,payload,previous_state,actor_id) values(mid,e.id,typ,d,p->>'reason',(select jsonb_object_agg(k,v) from jsonb_each(p) x(k,v) where k in ('target_level','branch_id','client_id','category','ends_on','position','status','assignment_id')),prev,auth.uid());
 if typ='status' and p->>'status'<>'Active' then
 update public.employee_assignments set ends_on=d where employee_id=e.id and not voided and starts_on<d and(ends_on is null or ends_on>d);
 elsif typ not in ('status','position') then
 if typ='return' and p ? 'assignment_id' then
 select * into a from public.employee_assignments where id=(p->>'assignment_id')::uuid and employee_id=e.id and not voided for update;
 if a.id is null or a.starts_on>=d or(a.ends_on is not null and a.ends_on<=d) or not app_private.scope_access('U',a.target_level,a.branch_id,a.client_id) then raise exception 'Selected placement cannot be ended'; end if;
 update public.employee_assignments set ends_on=d where id=a.id;
 -- Ending an additional/temporary assignment does not change primary.
 if a.category<>'primary' then dest:='unassigned';cat:='additional'; end if;
 end if;
 if cat='primary' then update public.employee_assignments set voided=true where employee_id=e.id and category='primary' and not voided and starts_on=d and source_movement_id is null; update public.employee_assignments set ends_on=d where employee_id=e.id and category='primary' and not voided and starts_on<d and(ends_on is null or ends_on>d); end if;
 if dest<>'unassigned' then insert into public.employee_assignments(employee_id,target_level,branch_id,client_id,category,starts_on,ends_on,notes,source_movement_id) values(e.id,dest,b,c,cat,d,enddate,coalesce(p->>'notes',''),mid); end if;
 end if;
 update public.employees set row_version=row_version+1,updated_at=now() where id=e.id;
 perform app_private.audit('employee',e.id,'movement',array[typ]||array(select jsonb_object_keys(coalesce(p->'values','{}'))),p->>'reason'); perform app_private.changed(e.id,'movement');
 return jsonb_build_object('id',mid,'employee_id',e.id);
end $$;

create function app_private.void_movement(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.employee_movements; e public.employees; begin
 if not app_private.capability('movement_correct') or not app_private.is_super() then raise exception using errcode='42501',message='Correction requires trusted administrator access'; end if;
 select * into m from public.employee_movements where id=(p->>'id')::uuid;
 select * into e from public.employees where id=m.employee_id for update;
 if m.id is null or m.voided_at is not null then raise exception 'Movement is unavailable'; end if;
 if p->>'expected_version' is null or e.row_version<>(p->>'expected_version')::bigint then raise exception using errcode='40001',message='Revision conflict'; end if;
 if length(trim(coalesce(p->>'reason','')))=0 then raise exception 'Enter a correction reason'; end if;
 if exists(select 1 from public.employee_movements where employee_id=e.id and voided_at is null and id<>m.id and(effective_on>m.effective_on or effective_on=m.effective_on and created_at>m.created_at)) then raise exception 'Correct later dependent movements first'; end if;
 update public.employee_movements set voided_at=now() where id=m.id;
 update public.employee_assignments set voided=true where source_movement_id=m.id;
 -- Restore intervals closed by the last event; no destructive timeline deletion.
 update public.employee_assignments a set ends_on=(saved->>'ends_on')::date,voided=coalesce((saved->>'voided')::boolean,false) from jsonb_array_elements(coalesce(m.previous_state->'closed_intervals','[]')) saved where a.id=(saved->>'id')::uuid and a.employee_id=e.id and(a.ends_on=m.effective_on or a.voided and a.source_movement_id is null and a.starts_on=m.effective_on);
 update public.employees set row_version=row_version+1,updated_at=now() where id=e.id;
 perform app_private.audit('employee',e.id,'void',array[m.type],p->>'reason'); perform app_private.changed(e.id,'void');
 return jsonb_build_object('id',m.id);
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
