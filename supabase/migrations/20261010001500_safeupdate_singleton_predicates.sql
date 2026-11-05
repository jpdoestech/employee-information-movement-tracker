-- Forward correction for environments with pg-safeupdate enabled by PostgREST.
-- The state table is a singleton, but explicit predicates are still required.
-- Retain the database guard and existing security-definer/EXECUTE boundaries.
create or replace function app_private.changed(e uuid,action text) returns void language plpgsql security definer set search_path = '' as $$
declare r bigint; routes uuid[]; ho boolean; begin
 update public.system_state set revision=revision+1 where public.system_state.id=true returning revision into r;
 if exists(select 1 from public.employees where id=e) then
 select array_agg(distinct branch_id) filter(where branch_id is not null),bool_or(target_level='head_office') into routes,ho from public.employee_assignments where employee_id=e and category='primary';
 else select array_agg(id),true into routes,ho from public.branches; end if;
 insert into public.sync_outbox(entity_id,action,revision,branch_routes,head_office_route) values(e,action,r,coalesce(routes,'{}'),coalesce(ho,false));
end $$;

create or replace function public.worker_command(operation text,p jsonb default '{}') returns jsonb language plpgsql security definer set search_path = '' as $$
declare token uuid; jobs bigint[]; r jsonb; b public.branch_spreadsheets; connection app_private.google_connection; revision bigint; begin
 -- This function has no authenticated/anon EXECUTE grant. Service-role credentials stay backend-only.
 if operation='claim' then
 perform 1 from public.system_state where id for update;
 -- Effective dates change the canonical roster without an application write.
 if exists(select 1 from public.system_state where last_sync_date is distinct from app_private.today()) then
 update public.system_state set last_sync_date=app_private.today() where public.system_state.id=true;
 perform app_private.changed(null,'calendar_reconciliation');
 end if;
 if exists(select 1 from public.sync_outbox where status='processing' and lease_until>now()) then return null; end if;
 token:=gen_random_uuid();
 select array_agg(id) into jobs from(select id from public.sync_outbox where(status='pending' or status='processing' and lease_until<=now()) and next_retry<=now() order by id limit 200 for update skip locked) due;
 if jobs is null then return null; end if;
 update public.sync_outbox set status='processing',lease_token=token,lease_until=now()+interval '15 minutes',attempts=attempts+1 where id=any(jobs);
 return jsonb_build_object('token',token,'job_ids',jobs,'branch_routes',(select coalesce(jsonb_agg(distinct route),'[]') from public.sync_outbox o cross join lateral unnest(o.branch_routes) route where o.id=any(jobs)),'head_office_route',(select bool_or(o.head_office_route) from public.sync_outbox o where o.id=any(jobs)),'revision',(select max(sync_outbox.revision) from public.sync_outbox where id=any(jobs)));
 elsif operation='heartbeat' then
 update public.sync_outbox set lease_until=now()+interval '15 minutes' where lease_token=(p->>'token')::uuid and status='processing' and lease_until>now();
 return jsonb_build_object('valid',found);
 elsif operation in ('complete','retry') then
 if not exists(select 1 from public.sync_outbox where lease_token=(p->>'token')::uuid and status='processing' and lease_until>now()) then raise exception 'Worker lease is expired'; end if;
 update public.sync_outbox set status=case when operation='complete' then 'synced' when attempts>=8 then 'failed' else 'pending' end,lease_until=null,lease_token=null,last_error=case when operation='complete' then null else 'External sync unavailable; review connectivity and approved sharing' end,next_retry=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::int*15)+(random()*20)::int) where lease_token=(p->>'token')::uuid;
 return '{}';
 elsif operation='connection' then return (select to_jsonb(c) from app_private.google_connection c);
 elsif operation='consume_state' then
 delete from app_private.oauth_states where state_hash=p->>'state_hash' and expires_at>now() and exists(select 1 from public.user_profiles u where u.id=user_id and u.active and u.role='superadmin') returning user_id into token;
 if token is null then raise exception 'Authorization state is invalid or expired'; end if;
 return jsonb_build_object('user_id',token);
 elsif operation='store_connection' then
 insert into app_private.google_connection(id,encrypted_refresh_token,owner_email) values(true,p->>'encrypted_refresh_token',p->>'owner_email') on conflict(id) do update set encrypted_refresh_token=excluded.encrypted_refresh_token,owner_email=excluded.owner_email,updated_at=now();
 return '{}';
 elsif operation='folder' then update app_private.google_connection set folder_id=p->>'id' where id;return '{}';
 elsif operation='workbooks' then return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('name',coalesce(orgbranch.code||' - '||orgbranch.name,'Head Office')||' - Employee Tracker')),'[]') from public.branch_spreadsheets w left join public.branches orgbranch on orgbranch.id=w.branch_id where w.branch_id is null or orgbranch.active);
 elsif operation='mapping' then
 update public.branch_spreadsheets set spreadsheet_id=p->>'spreadsheet_id',folder_id=p->>'folder_id',status='Pending' where id=(p->>'id')::uuid and spreadsheet_id is null;
 return '{}';
 elsif operation='book_status' then
 update public.branch_spreadsheets set status=p->>'status',last_success=case when p->>'status'='Synced' then now() else last_success end,last_synced_revision=case when p->>'status'='Synced' then coalesce((p->>'revision')::bigint,last_synced_revision) else last_synced_revision end,last_error=case when p->>'status'='Synced' then null else 'Sync suspended: confirm connectivity and export/sharing policy' end where id=(p->>'id')::uuid;
 return '{}';
 elsif operation='snapshot' then
 select * into b from public.branch_spreadsheets where id=(p->>'id')::uuid;
 if not b.approved or not 'employee_number'=any(b.allowed_fields) then raise exception 'Workbook export policy must explicitly approve employee IDs'; end if;
 if exists(select 1 from public.field_definitions where key=any(b.allowed_fields) and sensitivity='restricted') then raise exception 'Workbook contains restricted or inactive fields; review policy'; end if;
 if exists(select 1 from unnest(b.allowed_clients) c where not exists(select 1 from public.clients where id=c and branch_id=b.branch_id)) then raise exception 'Workbook client policy crosses branch boundary'; end if;
 with rows as (
 select e.*,pl.target,pl.branch_id,pl.client_id from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) pl
 where e.deleted_at is null and (b.branch_id is null and pl.target='head_office' and b.include_branch or b.branch_id=pl.branch_id and (pl.target='branch' and b.include_branch or pl.target='client' and pl.client_id=any(b.allowed_clients)))
 ), projected as (
 select jsonb_build_object('id',e.id,'employee_number',e.employee_number,'row_version',e.row_version,'branch_code',(select code from public.branches where id=e.branch_id),'updated_at',e.updated_at,'sync_time',now(),'active_current',true,'values',(select coalesce(jsonb_object_agg(f.key,app_private.effective_value(jsonb_populate_record(null::public.employees,to_jsonb(e)),f.key,app_private.today())),'{}') from public.field_definitions f where f.active and f.sensitivity='normal' and f.key=any(b.allowed_fields) and app_private.applicable(f,e.target,e.branch_id,e.client_id))) projected_row from rows e
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(projected_row) from projected),'[]'),'revision',(select system_state.revision from public.system_state),
 'fields',(select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',label)),'[]') from public.field_definitions where key=any(b.allowed_fields) and active and sensitivity='normal'),
 'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'category',a.category,'starts_on',a.starts_on,'ends_on',a.ends_on,'client_id',case when 'client'=any(b.allowed_fields) then a.client_id end,'source_version',e.row_version)),'[]') from public.employee_assignments a join rows e on e.id=a.employee_id where not a.voided and a.category='primary' and daterange(a.starts_on,a.ends_on,'[)') @> app_private.today()),
 'movements',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'employee_id',m.employee_id,'type',m.type,'effective_on',m.effective_on,'voided',m.voided_at is not null)),'[]') from public.employee_movements m join rows e on e.id=m.employee_id where 'branch'=any(b.allowed_fields) and (b.branch_id is null and m.payload->>'target_level'='head_office' or(m.payload->>'branch_id')::uuid=b.branch_id) and (m.previous_state->>'branch_id')::uuid is not distinct from b.branch_id)) into r;
 if jsonb_array_length(r->'rows')>1000 then raise exception 'Workbook exceeds bounded snapshot limit; partition or expand sync implementation'; end if;
 return r;
 else raise exception 'Unknown worker command'; end if;
end $$;
revoke all on function public.worker_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.worker_command(text,jsonb) to service_role;
revoke all on all functions in schema app_private from public,anon,authenticated;
