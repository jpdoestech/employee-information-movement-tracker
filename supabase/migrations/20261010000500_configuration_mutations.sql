create function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); result jsonb; existing public.write_requests; eid uuid; f public.field_definitions; g public.field_groups; item jsonb; target jsonb; b uuid; c uuid; kind text; expected bigint; affected int; begin
 if (app_private.profile()).id is null or ((app_private.profile()).role='viewer' and operation<>'save_view') then raise exception using errcode='42501',message='Account cannot perform this action'; end if;
 if operation in ('field','group','organization','employee_delete') and p ? 'id' and p->>'expected_version' is null then raise exception using errcode='40001',message='An expected revision is required'; end if;
 if request_id is null then raise exception 'A request ID is required'; end if;
 -- Global configuration lock serializes policy changes with writes. Employee locks retain fine revision checks.
 perform 1 from public.system_state where id for update;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 select * into existing from public.write_requests where actor_id=actor and write_requests.request_id=tracker_mutate.request_id;
 if existing.actor_id is not null then
 if existing.operation<>operation or existing.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
 -- Replay only non-PII IDs; still require live capability and affected record scope.
 if existing.result ? 'employee_id' and not app_private.employee_access((existing.result->>'employee_id')::uuid,'U') then raise exception using errcode='42501',message='Access denied'; end if;
 return existing.result;
 end if;
 if operation='employee_create' then
 if not app_private.capability('employee_create') then raise exception using errcode='42501',message='Access denied'; end if;
 kind:=coalesce(p->>'target_level','unassigned');b:=(p->>'branch_id')::uuid;c:=(p->>'client_id')::uuid;
 if not ((kind in ('head_office','unassigned') and b is null and c is null) or (kind='branch' and b is not null and c is null) or (kind='client' and b is not null and c is not null)) then raise exception using errcode='22023',message='Initial organization target is inconsistent'; end if;
 if not app_private.scope_access('C',kind,b,c) or not app_private.field_access('name','C',kind,b,c) then raise exception using errcode='42501',message='Creation scope is not authorized'; end if;
 if kind not in ('unassigned','head_office','branch','client') then raise exception 'Invalid initial placement'; end if;
 if b is not null and not exists(select 1 from public.branches where id=b and active) or c is not null and not exists(select 1 from public.clients where id=c and branch_id=b and active) then raise exception 'Initial destination is inactive or invalid'; end if;
 insert into public.employees(name) values(p->'values'->>'name') returning id into eid;
 if kind<>'unassigned' then insert into public.employee_assignments(employee_id,target_level,branch_id,client_id,category,starts_on) values(eid,kind,b,c,'primary',app_private.today()); end if;
 perform app_private.patch_employee(eid,1,p->'values',true,kind,b,c);
 result:=jsonb_build_object('id',eid,'employee_id',eid);
 elsif operation='employee_update' then
 eid:=(p->>'id')::uuid;perform app_private.patch_employee(eid,(p->>'expected_version')::bigint,p->'values');result:=jsonb_build_object('id',eid,'employee_id',eid);
 elsif operation='employee_delete' then
 eid:=(p->>'id')::uuid;
 if not app_private.capability('employee_delete') or not app_private.employee_access(eid,'D') then raise exception using errcode='42501',message='Access denied'; end if;
 update public.employees set deleted_at=now(),row_version=row_version+1,updated_at=now() where id=eid and row_version=(p->>'expected_version')::bigint and deleted_at is null;
 if not found then raise exception using errcode='40001',message='Revision conflict'; end if;
 perform app_private.audit('employee',eid,'archive','{}');perform app_private.changed(eid,'archive');result:=jsonb_build_object('id',eid);
 elsif operation='bulk_update' then
 if not app_private.capability('bulk_update') then raise exception using errcode='42501',message='Access denied'; end if;
 if jsonb_array_length(p->'rows') not between 1 and 100 or jsonb_typeof(p->'values')<>'object' then raise exception 'Select between 1 and 100 employees'; end if;
 if (select count(distinct r->>'id') from jsonb_array_elements(p->'rows') r)<>jsonb_array_length(p->'rows') then raise exception 'Duplicate bulk target'; end if;
 for item in select value from jsonb_array_elements(p->'rows') order by value->>'id' loop
 perform app_private.patch_employee((item->>'id')::uuid,(item->>'row_version')::bigint,p->'values');
 end loop;
 result:=jsonb_build_object('updated',jsonb_array_length(p->'rows'));
 elsif operation='movement' then result:=app_private.move_employee(p);
 elsif operation='void_movement' then result:=app_private.void_movement(p);
 elsif operation='organization' then
 if not app_private.capability('organization_manage') then raise exception using errcode='42501',message='Access denied'; end if;
 kind:=p->>'kind';eid:=coalesce((p->>'id')::uuid,gen_random_uuid());b:=(p->>'branch_id')::uuid;
 if kind not in ('branch','client') then raise exception 'Choose branch or client'; end if;
 if not app_private.scope_access(case when p ? 'id' then 'U' else 'C' end,case when kind='client' then 'branch' else kind end,case when kind='client' then b else eid end,null) and not app_private.is_super() then raise exception using errcode='42501',message='Organization scope is not authorized'; end if;
 if length(trim(coalesce(p->>'name','')))=0 or length(trim(coalesce(p->>'code','')))=0 then raise exception 'Enter a code and name'; end if;
 if p ? 'id' then
 if kind='branch' then update public.branches set name=p->>'name',code=p->>'code',active=(p->>'active')::boolean,row_version=row_version+1 where id=eid and row_version=(p->>'expected_version')::bigint;
 else update public.clients set name=p->>'name',code=p->>'code',active=(p->>'active')::boolean,row_version=row_version+1 where id=eid and branch_id=b and row_version=(p->>'expected_version')::bigint; end if;
 if not found then raise exception using errcode='40001',message='Revision conflict'; end if;
 else
 if kind='branch' then insert into public.branches(id,code,name) values(eid,p->>'code',p->>'name');insert into public.branch_spreadsheets(branch_id) values(eid);
 else insert into public.clients(id,branch_id,code,name) values(eid,b,p->>'code',p->>'name'); end if;
 end if;
 perform app_private.audit(kind,eid,'configure',array['name','active']);perform app_private.changed(eid,'organization');result:=jsonb_build_object('id',eid);
 elsif operation='group' then
 if not app_private.capability('schema_manage') then raise exception using errcode='42501',message='Access denied'; end if;
 if p ? 'id' then
 eid:=(p->>'id')::uuid;
 update public.field_groups set name=p->>'name',description=coalesce(p->>'description',''),active=coalesce((p->>'active')::boolean,true),display_order=coalesce((p->>'display_order')::int,0),row_version=row_version+1 where id=eid and row_version=(p->>'expected_version')::bigint;
 if not found then raise exception using errcode='40001',message='Revision conflict'; end if;
 else insert into public.field_groups(name,description) values(p->>'name',coalesce(p->>'description','')) returning id into eid; end if;
 perform app_private.audit('group',eid,'configure',array['name','active']);perform app_private.changed(eid,'schema');result:=jsonb_build_object('id',eid);
 elsif operation='field' then
 if not app_private.capability('schema_manage') then raise exception using errcode='42501',message='Access denied'; end if;
 if p ? 'id' then
 select * into f from public.field_definitions where id=(p->>'id')::uuid for update;
 if f.id is null or f.type='system' then raise exception 'System field definitions cannot be changed'; end if;
 if f.row_version<>(p->>'expected_version')::bigint then raise exception using errcode='40001',message='Field definition changed; retain draft and reload'; end if;
 if p->>'key'<>f.key then raise exception 'Field keys are immutable'; end if;
 if f.group_id<>(p->>'group_id')::uuid and not app_private.is_super() then raise exception using errcode='42501',message='Moving groups changes inheritance; a Superadmin must perform this action'; end if;
 if f.sensitivity='restricted' and p->>'sensitivity'='normal' and not app_private.is_super() then raise exception using errcode='42501',message='Reducing field sensitivity requires Superadmin'; end if;
 if f.type<>p->>'type' and exists(select 1 from public.employees where custom_values ? f.key) then raise exception 'Populated field types require an explicit migration'; end if;
 eid:=f.id;
 update public.field_definitions set group_id=(p->>'group_id')::uuid,label=p->>'label',type=p->>'type',required=coalesce((p->>'required')::boolean,false),active=coalesce((p->>'active')::boolean,true),sensitivity=coalesce(p->>'sensitivity','normal'),scope_mode=coalesce(p->>'scope_mode','all'),default_value=p->'default_value',options=coalesce(p->'options','[]'),validation=coalesce(p->'validation','{}'),help_text=coalesce(p->>'help_text',''),display_order=coalesce((p->>'display_order')::int,0),list_eligible=coalesce((p->>'list_eligible')::boolean,true),row_version=row_version+1 where id=eid;
 else
 if p->>'type'='system' then raise exception 'Custom fields cannot be system fields'; end if;
 insert into public.field_definitions(group_id,key,label,type,required,sensitivity,scope_mode,options,validation,help_text,default_value,active,display_order,list_eligible) values((p->>'group_id')::uuid,p->>'key',p->>'label',p->>'type',coalesce((p->>'required')::boolean,false),coalesce(p->>'sensitivity','normal'),coalesce(p->>'scope_mode','all'),coalesce(p->'options','[]'),coalesce(p->'validation','{}'),coalesce(p->>'help_text',''),p->'default_value',coalesce((p->>'active')::boolean,true),coalesce((p->>'display_order')::int,0),coalesce((p->>'list_eligible')::boolean,true)) returning id into eid;
 end if;
 delete from public.field_scope_targets where field_id=eid;
 for target in select value from jsonb_array_elements(coalesce(p->'targets','[]')) loop
 kind:=target->>'scope_type';b:=(target->>'scope_id')::uuid;
 if not app_private.scope_access('U',kind,case when kind='branch' then b when kind='client' then(select branch_id from public.clients where id=b) end,case when kind='client' then b end) then raise exception using errcode='42501',message='Field applicability target is not authorized'; end if;
 insert into public.field_scope_targets(field_id,scope_type,scope_id,include_descendants) values(eid,kind,b,coalesce((target->>'include_descendants')::boolean,false));
 end loop;
 if p->>'scope_mode'='selected' and not exists(select 1 from public.field_scope_targets where field_id=eid) then raise exception 'Select at least one applicability target'; end if;
 perform app_private.audit('field',eid,'configure',array['label','group_id','scope_mode','sensitivity']);perform app_private.changed(eid,'schema');result:=jsonb_build_object('id',eid);
 elsif operation in ('profile','scope','policy','capability','workbook') then
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can administer permissions and export policy'; end if;
 if length(trim(coalesce(p->>'reason','')))=0 then raise exception 'A configuration reason is required'; end if;
 if operation='profile' then
 eid:=(p->>'id')::uuid;
 if exists(select 1 from public.user_profiles where id=eid) and not exists(select 1 from public.user_profiles where id=eid and row_version=coalesce((p->>'expected_version')::bigint,(p->>'row_version')::bigint)) then raise exception using errcode='40001',message='Account policy changed; reload before saving'; end if;
 if eid=actor and (p->>'role'<>'superadmin' or not (p->>'active')::boolean) then raise exception 'Another Superadmin must change your own trusted access'; end if;
 insert into public.user_profiles(id,display_name,role,active) values(eid,p->>'display_name',p->>'role',(p->>'active')::boolean) on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,active=excluded.active,row_version=user_profiles.row_version+1;
 elsif operation='scope' then
 eid:=(p->>'id')::uuid;
 if p ? 'id' then delete from public.user_scope_grants where id=(p->>'id')::uuid; end if;
 if not coalesce((p->>'remove')::boolean,false) then
 insert into public.user_scope_grants(user_id,scope_type,scope_id,include_descendants,actions,starts_on,ends_on,active) values((p->>'user_id')::uuid,p->>'scope_type',(p->>'scope_id')::uuid,coalesce((p->>'include_descendants')::boolean,false),array(select jsonb_array_elements_text(p->'actions')),coalesce((p->>'starts_on')::date,app_private.today()),(p->>'ends_on')::date,coalesce((p->>'active')::boolean,true)) returning id into eid; end if;
 elsif operation='policy' then
 eid:=(p->>'id')::uuid;
 if p ? 'id' then delete from public.field_access_policies where id=(p->>'id')::uuid; end if;
 if not coalesce((p->>'remove')::boolean,false) then
 insert into public.field_access_policies(user_id,role,field_id,group_id,action,effect,inherit_new,scope_type,scope_id,include_descendants) values((p->>'user_id')::uuid,p->>'role',(p->>'field_id')::uuid,(p->>'group_id')::uuid,p->>'action',p->>'effect',coalesce((p->>'inherit_new')::boolean,false),coalesce(p->>'scope_type','all'),(p->>'scope_id')::uuid,coalesce((p->>'include_descendants')::boolean,false)) returning id into eid; end if;
 elsif operation='capability' then
 delete from public.capability_grants where user_id=(p->>'user_id')::uuid and capability=p->>'capability';
 if not coalesce((p->>'remove')::boolean,false) then insert into public.capability_grants values((p->>'user_id')::uuid,p->>'capability'); end if;
 elsif operation='workbook' then
 eid:=(p->>'id')::uuid;
 if not exists(select 1 from public.branch_spreadsheets where id=eid and row_version=coalesce((p->>'expected_version')::bigint,(p->>'row_version')::bigint)) then raise exception using errcode='40001',message='Workbook policy changed; reload before approving'; end if;
 if exists(select 1 from jsonb_array_elements_text(p->'allowed_clients') k where not exists(select 1 from public.clients c join public.branch_spreadsheets w on w.id=eid where c.id=k::uuid and c.branch_id=w.branch_id)) then raise exception 'Approved clients must belong to this workbook branch'; end if;
 if exists(select 1 from jsonb_array_elements_text(p->'allowed_fields') k where not exists(select 1 from public.field_definitions where key=k and active and sensitivity='normal')) then raise exception 'Only approved active non-sensitive fields may be exported'; end if;
 update public.branch_spreadsheets set approved=coalesce((p->>'approved')::boolean,false),allowed_fields=array(select jsonb_array_elements_text(p->'allowed_fields')),allowed_clients=array(select jsonb_array_elements_text(p->'allowed_clients'))::uuid[],include_branch=coalesce((p->>'include_branch')::boolean,false),sharing_emails=array(select jsonb_array_elements_text(p->'sharing_emails')),status='Pending',row_version=row_version+1 where id=eid;
 end if;
 insert into public.audit_log(actor_id,entity,entity_id,operation,changed_keys,reason,previous_reference,next_reference) values(actor,operation,eid,'permission_change',array['policy_reference'],p->>'reason',case when p ? 'id' then jsonb_build_object('policy_id',p->>'id','revision',p->'row_version') else '{}'::jsonb end,case when coalesce((p->>'remove')::boolean,false) then '{}'::jsonb else jsonb_build_object('policy_id',eid) end);perform app_private.changed(eid,'policy');result:=jsonb_build_object('id',eid);
 elsif operation='save_view' then
 if length(trim(coalesce(p->>'name','')))=0 then raise exception 'Enter a view name'; end if;
 insert into public.user_table_views(user_id,name,config) values(actor,p->>'name',p->'config') on conflict(user_id,name) do update set config=excluded.config,row_version=user_table_views.row_version+1 returning id into eid;result:=jsonb_build_object('id',eid);
 elsif operation='sync_now' then
 if not app_private.is_super() then raise exception using errcode='42501',message='Access denied'; end if;
 perform app_private.changed(null,'reconcile');result:='{"queued":true}';
 else raise exception 'Unknown mutation'; end if;
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,operation,p,result);
 return result;
exception when unique_violation then raise exception using errcode='23505',message='An existing active or inactive record matches this name or key. Reuse, expand applicability, or reactivate it.';
end $$;
revoke all on function public.tracker_mutate(text,jsonb,uuid) from public,anon;
grant execute on function public.tracker_mutate(text,jsonb,uuid) to authenticated;
