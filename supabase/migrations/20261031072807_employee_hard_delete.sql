-- Receipts bind destructive work to one superadmin, scope, revision and day.
create table app_private.employee_purge_previews (
 token uuid primary key default gen_random_uuid(), actor_id uuid not null references public.user_profiles(id),
 scope_type text not null, scope_id uuid, revision bigint not null, preview_day date not null,
 employee_ids uuid[] not null, expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table app_private.employee_purge_previews enable row level security;
revoke all on app_private.employee_purge_previews from public,anon,authenticated,service_role;

create function public.preview_employee_purge(q jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope text:=q->>'scope_type'; sid uuid:=(q->>'scope_id')::uuid; label text;
 ids uuid[]; receipt app_private.employee_purge_previews; result jsonb;
begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can permanently delete employee data'; end if;
 if scope is null or scope not in ('all','head_office','branch','client')
  or ((scope in ('branch','client')) is distinct from (sid is not null)) then raise exception using errcode='22023',message='Choose a valid deletion scope'; end if;
 perform 1 from public.system_state where id=true for update;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can permanently delete employee data'; end if;
 if scope='branch' then select name into label from public.branches where id=sid;
 elsif scope='client' then select b.name||' / '||c.name into label from public.clients c join public.branches b on b.id=c.branch_id where c.id=sid;
 else label:=case scope when 'all' then 'All employee data' else 'Head Office' end;
 end if;
 if label is null then raise exception using errcode='22023',message='The selected location no longer exists'; end if;
 select coalesce(array_agg(e.id order by e.id),'{}') into ids from public.employees e
 cross join lateral app_private.placement(e.id,app_private.today()) pl
 where scope='all' or scope='head_office' and pl.target='head_office'
  or scope='branch' and pl.branch_id=sid or scope='client' and pl.target='client' and pl.client_id=sid;
 delete from app_private.employee_purge_previews where expires_at<=now() or actor_id=auth.uid();
 insert into app_private.employee_purge_previews(actor_id,scope_type,scope_id,revision,preview_day,employee_ids)
 select auth.uid(),scope,sid,revision,app_private.today(),ids from public.system_state where id=true returning * into receipt;
 result:=jsonb_build_object('token',receipt.token,'scope_label',label,'scope_type',scope,'expires_at',receipt.expires_at,
  'confirmation','DELETE '||cardinality(ids)||' EMPLOYEES',
  'counts',jsonb_build_object('employees',cardinality(ids),
   'archived',(select count(*) from public.employees where id=any(ids) and deleted_at is not null),
   'assignments',(select count(*) from public.employee_assignments where employee_id=any(ids)),
   'movements',(select count(*) from public.employee_movements where employee_id=any(ids)),
   'other_location_history',(select count(distinct a.employee_id) from public.employee_assignments a where a.employee_id=any(ids) and scope<>'all'
    and not (scope='head_office' and a.target_level='head_office' or scope='branch' and a.branch_id is not distinct from sid or scope='client' and a.client_id is not distinct from sid)),
   'linked_accounts',(select count(*) from app_private.access_record_rules where employee_id=any(ids) or assigned&&ids)),
  'sample',(select coalesce(jsonb_agg(jsonb_build_object('employee_number',s.employee_number,'name',s.name)),'[]') from
   (select employee_number,name from public.employees where id=any(ids) order by employee_number limit 10) s));
 return result;
end $$;

create function public.hard_delete_employees(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt app_private.employee_purge_previews; prior public.write_requests; ids uuid[]; mids uuid[]; audit_ids bigint[];
 result jsonb; actor uuid:=auth.uid();
begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can permanently delete employee data'; end if;
 if request_id is null or nullif(btrim(p->>'reason'),'') is null or length(p->>'reason')>1000 then raise exception using errcode='22023',message='A request ID and deletion reason are required'; end if;
 perform 1 from public.system_state where id=true for update;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can permanently delete employee data'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=hard_delete_employees.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'employee_purge' or prior.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return prior.result;
 end if;
 select * into receipt from app_private.employee_purge_previews where token=(p->>'token')::uuid and actor_id=actor for update;
 if receipt.token is null or receipt.expires_at<=now() or receipt.preview_day<>app_private.today()
  or receipt.revision<>(select revision from public.system_state where id=true) then
  raise exception using errcode='40001',message='Deletion preview expired or data changed. Review a fresh preview before deleting';
 end if;
 ids:=receipt.employee_ids;
 if cardinality(ids)=0 or p->>'confirmation' is distinct from 'DELETE '||cardinality(ids)||' EMPLOYEES' then
  raise exception using errcode='22023',message='Type the exact confirmation phrase from the preview';
 end if;
 perform 1 from public.employees where id=any(ids) order by id for update;
 select coalesce(array_agg(id),'{}') into mids from public.employee_movements where employee_id=any(ids);
 select coalesce(array_agg(a.id),'{}') into audit_ids from public.audit_log a where a.entity_id=any(ids||mids)
  or exists(select 1 from app_private.audit_value_changes v where v.audit_id=a.id and v.employee_id=any(ids));
 -- Null self identity fails open in the legacy evaluator; retain an empty assigned rule instead.
 update app_private.access_record_rules set mode='assigned',employee_id=null,assigned='{}'
  where employee_id=any(ids) and mode in ('self','direct_reports');
 update app_private.access_record_rules r set employee_id=case when employee_id=any(ids) then null else employee_id end,
  assigned=array(select e from unnest(r.assigned) e where not e=any(ids))
  where employee_id=any(ids) or assigned&&ids;
 delete from app_private.employee_reporting where employee_id=any(ids) or manager_id=any(ids);
 delete from app_private.position_text_corrections where employee_id=any(ids);
 delete from app_private.audit_value_changes where employee_id=any(ids) or audit_id=any(audit_ids);
 delete from public.audit_log where id=any(audit_ids);
 -- Tombstone receipts, rather than remove them: retrying an old create must not recreate purged data.
 update public.write_requests w set payload='{"purged":true}',result='{}'
  where exists(select 1 from unnest(ids||mids) e where w.payload::text like '%'||e::text||'%' or w.result::text like '%'||e::text||'%');
 delete from public.employee_client_ids where employee_id=any(ids);
 delete from public.employee_assignments where employee_id=any(ids);
 delete from public.employee_movements where employee_id=any(ids);
 delete from public.sync_outbox where entity_id=any(ids);
 delete from public.employees where id=any(ids);
 -- A full roster reconciliation removes deleted rows from approved managed sheets asynchronously.
 perform app_private.changed(null,'employee_purge');
 result:=jsonb_build_object('deleted_employees',cardinality(ids),'deleted_movements',cardinality(mids));
 insert into public.audit_log(actor_id,entity,operation,changed_keys,reason,previous_reference,next_reference)
 values(actor,'employee_purge','hard_delete',array['employees','history'],btrim(p->>'reason'),
  jsonb_build_object('scope_type',receipt.scope_type,'scope_id',receipt.scope_id),result);
 delete from app_private.employee_purge_previews where token=receipt.token;
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'employee_purge',p,result);
 return result;
end $$;
revoke all on function public.preview_employee_purge(jsonb),public.hard_delete_employees(jsonb,uuid) from public,anon;
grant execute on function public.preview_employee_purge(jsonb),public.hard_delete_employees(jsonb,uuid) to authenticated;
