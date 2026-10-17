-- Shared, bounded list reads. Projection precedes search, counts and paging.
create function app_private.movement_rows(e uuid default null,q jsonb default '{}') returns setof jsonb
language sql stable security definer set search_path = '' as $$

 select x from (
 select jsonb_build_object('id',m.id,'employee_id',m.employee_id,'employee_name',app_private.project(emp)->'values'->'name','employee_number',app_private.project(emp)->'values'->'employee_number','created_at',m.created_at,'branch_id',case when app_private.field_access('branch','R',p.target,p.branch_id,p.client_id) then p.branch_id end,'client_id',case when app_private.field_access('client','R',p.target,p.branch_id,p.client_id) then p.client_id end,'type',m.type,'effective_on',m.effective_on,'state',case when m.voided_at is not null then 'Voided' when m.effective_on>app_private.today() then 'Scheduled' when m.effective_on=app_private.today() or exists(select 1 from public.employee_assignments a where a.source_movement_id=m.id and not a.voided and daterange(a.starts_on,a.ends_on,'[)') @> app_private.today()) or (m.type in ('status','position') and not exists(select 1 from public.employee_movements newer where newer.employee_id=m.employee_id and newer.type=m.type and newer.voided_at is null and newer.effective_on<=app_private.today() and (newer.effective_on,newer.created_at,newer.id)>(m.effective_on,m.created_at,m.id))) then 'Effective' else 'Past' end,'reason',case when app_private.is_super() then m.reason else null end,
 'payload',case when app_private.is_super() then m.payload when m.type='status' then jsonb_build_object('status',m.payload->'status') when m.type='position' then jsonb_build_object('position',m.payload->'position') else '{}'::jsonb end) x
 from public.employee_movements m join public.employees emp on emp.id=m.employee_id
 cross join lateral app_private.placement(emp.id,app_private.today()) p
 where emp.deleted_at is null and(e is null or m.employee_id=e) and app_private.employee_access(emp.id,'R')
 and app_private.field_access(case when m.type='status' then 'status' when m.type='position' then 'position' else 'branch' end,'R',p.target,p.branch_id,p.client_id)
 and (app_private.is_super() or (app_private.scope_access('R',coalesce(m.payload->>'target_level',p.target),(m.payload->>'branch_id')::uuid,(m.payload->>'client_id')::uuid) and app_private.scope_access('R',coalesce(m.previous_state->>'target_level',p.target),(m.previous_state->>'branch_id')::uuid,(m.previous_state->>'client_id')::uuid)))
 and(coalesce(q->>'search','')='' or position(lower(q->>'search') in lower(m.type))>0)
 and(coalesce(jsonb_array_length(q->'types'),0)=0 or m.type in(select jsonb_array_elements_text(q->'types')))

 ) results
$$;
create or replace function app_private.history(e uuid,q jsonb default '{}') returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(r order by r->>'effective_on' desc,r->>'created_at' desc,r->>'id'),'[]')
 from (select r from app_private.movement_rows(e,q) r order by r->>'effective_on' desc,r->>'created_at' desc,r->>'id' limit 100) page
$$;
create function public.record_page(q jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare kind text:=q->>'kind'; lim int:=coalesce((q->>'limit')::int,25); off int:=coalesce((q->>'offset')::int,0); sort_key text; result jsonb; begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
 if kind not in ('movements','audit','organization') or kind is null then raise exception 'Invalid list'; end if;
 if lim not in (10,25,50,100) or off<0 or length(coalesce(q->>'search',''))>500 then raise exception 'Invalid pagination or search'; end if;
 if coalesce(q->>'from','')<>'' then perform (q->>'from')::date; end if;
 if coalesce(q->>'to','')<>'' then perform (q->>'to')::date; end if;
 if nullif(q->>'from','')::date>nullif(q->>'to','')::date then raise exception 'Invalid date range'; end if;
 if kind='audit' and not app_private.capability('audit_read') then raise exception using errcode='42501',message='Access denied'; end if;
 sort_key:=coalesce(q->>'sort',case when kind='organization' then 'label' when kind='audit' then 'created_at' else 'effective_on' end);
 if sort_key not in ('label','type','effective_on','created_at','operation','entity') or coalesce(q->>'direction','desc') not in ('asc','desc') then raise exception 'Invalid sort'; end if;
 with authorized as materialized (
 select r from app_private.movement_rows() r where kind='movements'
 union all
 select (to_jsonb(a)||jsonb_build_object('record_on',(a.created_at at time zone 'Asia/Manila')::date))-case when app_private.is_super() then array[]::text[] else array['changed_keys','reason'] end from public.audit_log a
 where kind='audit' and (app_private.is_super() or (a.entity='employee' and app_private.employee_access(a.entity_id,'R')))
 union all
 select jsonb_build_object('id','head_office','kind','head_office','label','Head Office','context','Head Office','active',true) where kind='organization' and app_private.scope_access('R','head_office',null,null)
 union all
 select jsonb_build_object('id',b.id,'kind','branch','label',b.name,'context','Branch','active',b.active,'row_version',b.row_version,'code',b.code) from public.branches b where kind='organization' and (app_private.scope_access('R','branch',b.id,null) or exists(select 1 from public.clients c where c.branch_id=b.id and app_private.scope_access('R','client',b.id,c.id)))
 union all
 select jsonb_build_object('id',c.id,'kind','client','label',c.name,'context',b.name,'branch_id',b.id,'active',c.active and b.active,'row_version',c.row_version,'code',c.code) from public.clients c join public.branches b on b.id=c.branch_id where kind='organization' and app_private.scope_access('R','client',c.branch_id,c.id)
 ), filtered as materialized (
 select r from authorized where
 (coalesce(q->>'search','')='' or position(lower(q->>'search') in lower(concat_ws(' ',r->>'employee_name',r->>'employee_number',r->>'type',r->>'state',r->>'operation',r->>'entity',r->>'label',r->>'context',r->>'code')))>0)
 and (coalesce(jsonb_array_length(q->'types'),0)=0 or coalesce(r->>'type',r->>'kind') in(select jsonb_array_elements_text(q->'types')))
 and (coalesce(jsonb_array_length(q->'states'),0)=0 or r->>'state' in(select jsonb_array_elements_text(q->'states')))
 and (coalesce(jsonb_array_length(q->'branches'),0)=0 or case when kind='organization' and r->>'kind'='branch' then r->>'id' else r->>'branch_id' end in(select jsonb_array_elements_text(q->'branches')))
 and (coalesce(jsonb_array_length(q->'clients'),0)=0 or r->>'client_id' in(select jsonb_array_elements_text(q->'clients')))
 and (coalesce(q->>'from','')='' or left(coalesce(r->>'effective_on',r->>'record_on'),10)::date >=(q->>'from')::date)
 and (coalesce(q->>'to','')='' or left(coalesce(r->>'effective_on',r->>'record_on'),10)::date <=(q->>'to')::date)
 ), page as (
 select r from filtered order by case when q->>'direction'='asc' then r->>sort_key end asc nulls last,
 case when coalesce(q->>'direction','desc')='desc' then r->>sort_key end desc nulls last,r->>'id' limit lim offset off
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(r) from page),'[]'),'total',(select count(*) from filtered),'revision',(select revision from public.system_state)) into result;
 return result;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.record_page(jsonb) from public,anon;
grant execute on function public.record_page(jsonb) to authenticated;
