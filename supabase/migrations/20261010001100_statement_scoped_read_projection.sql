-- Evaluate policies once per distinct effective placement within this statement.
-- No authorization result survives the request or principal. Values remain projected
-- before search, sorting, counts and pagination, including blind-update fields.
create function app_private.readable_employee_rows() returns table(id uuid, projected_row jsonb,target text,branch_id uuid,client_id uuid)
language sql stable security definer set search_path = '' as $$
 with placed as materialized (
 select e.*,p.target,p.branch_id,p.client_id from public.employees e
 cross join lateral app_private.placement(e.id,app_private.today()) p where e.deleted_at is null
 ), targets as materialized (
 select distinct p.target,p.branch_id,p.client_id from placed p
 ), authorized as materialized (
 select t.*,array(select f.key from public.field_definitions f where f.active
 and app_private.field_access(f.key,'R',t.target,t.branch_id,t.client_id)) keys
 from targets t where app_private.scope_access('R',t.target,t.branch_id,t.client_id)
 )
 select e.id,jsonb_build_object('id',e.id,'row_version',e.row_version,'values',
 coalesce((select jsonb_object_agg(k,app_private.effective_value(jsonb_populate_record(null::public.employees,to_jsonb(e)),k,app_private.today())) from unnest(a.keys) k),'{}')),
 e.target,e.branch_id,e.client_id from placed e join authorized a
 on (e.target,e.branch_id,e.client_id) is not distinct from (a.target,a.branch_id,a.client_id)
$$;
revoke all on function app_private.readable_employee_rows() from public,anon,authenticated;

create or replace function app_private.employee_page(q jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; lim int:=coalesce((q->>'limit')::int,25); off int:=coalesce((q->>'offset')::int,0); begin
 if lim not in (10,25,50,100) or off<0 then raise exception 'Invalid pagination'; end if;
 with projected as materialized (
 select id,projected_row row,target,branch_id,client_id from app_private.readable_employee_rows()
 ), filtered as (
 select * from projected x where row is not null
 and (coalesce(q->>'search','')='' or exists(select 1 from jsonb_each_text(row->'values') v where position(lower(q->>'search') in lower(v.value))>0))
 and (coalesce(jsonb_array_length(q->'branches'),0)=0 or ((row->'values') ? 'branch' and branch_id::text in(select jsonb_array_elements_text(q->'branches'))))
 and (coalesce(jsonb_array_length(q->'clients'),0)=0 or ((row->'values') ? 'client' and client_id::text in(select jsonb_array_elements_text(q->'clients'))))
 and (coalesce(jsonb_array_length(q->'statuses'),0)=0 or row->'values'->>'status' in(select jsonb_array_elements_text(q->'statuses')))
 and (q->'quick' is null or q->'quick'='null'::jsonb or ((row->'values') ? case when q->'quick'->>'kind'='client' then 'client' else 'branch' end and app_private.scope_matches(q->'quick'->>'kind',nullif(q->'quick'->>'id','head_office')::uuid,true,target,branch_id,client_id)))
 and not exists(select 1 from jsonb_array_elements(coalesce(q->'predicates','[]')) f where not coalesce(((row->'values') ? (f->>'key') and app_private.predicate(row->'values'->(f->>'key'),f)),false))
 ), ordered as (
 select *,row->'values'->coalesce(q->>'sort','employee_number') sort_value from filtered
 where coalesce(q->>'sort','employee_number')='id' or (row->'values') ? coalesce(q->>'sort','employee_number')
 ), page as (
 select row from ordered order by case when coalesce(q->>'direction','asc')='asc' then sort_value end asc nulls last,case when q->>'direction'='desc' then sort_value end desc nulls last,id limit lim offset off
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(row) from page),'[]'),'total',(select count(*) from ordered),'revision',(select revision from public.system_state)) into result;
 return result;
end $$;

create or replace function public.tracker_query(operation text,q jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; e public.employees; begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
 if operation='context' then
 return jsonb_build_object('profile',to_jsonb(app_private.profile()),'revision',(select revision from public.system_state),'today',app_private.today(),
 'capabilities',(select coalesce(jsonb_agg(c),'[]') from unnest(array['employee_create','employee_delete','organization_manage','schema_manage','movement_create','movement_correct','bulk_update','audit_read','sync_manage']) c where app_private.capability(c)),
 'fields',app_private.catalog(),
 'groups',(select coalesce(jsonb_agg(to_jsonb(g)-'normalized_name' order by display_order),'[]') from public.field_groups g where g.id::text in(select f->>'group_id' from jsonb_array_elements(app_private.catalog()) f)),
 'views',(select coalesce(jsonb_agg(to_jsonb(v)-'user_id'),'[]') from public.user_table_views v where user_id=auth.uid()));
 elsif operation='options' then
 select coalesce(jsonb_agg(x order by x->>'label'),'[]') into r from (
 select jsonb_build_object('id','head_office','kind','head_office','label','Head Office','context','Head Office') x where app_private.scope_access('R','head_office',null,null)
 union all select jsonb_build_object('id',b.id,'kind','branch','label',b.name,'context','Branch','active',b.active,'row_version',b.row_version,'code',b.code) from public.branches b where app_private.scope_access('R','branch',b.id,null) or exists(select 1 from public.clients c where c.branch_id=b.id and app_private.scope_access('R','client',b.id,c.id))
 union all select jsonb_build_object('id',c.id,'kind','client','label',c.name,'context',b.name,'branch_id',b.id,'active',c.active and b.active,'row_version',c.row_version,'code',c.code) from public.clients c join public.branches b on b.id=c.branch_id where app_private.scope_access('R','client',c.branch_id,c.id)
 ) options where position(lower(coalesce(q->>'search','')) in lower(x->>'label'||' '||x->>'context'))>0 and(coalesce(jsonb_array_length(q->'branches'),0)=0 or x->>'kind'<>'client' or x->>'branch_id' in(select jsonb_array_elements_text(q->'branches'))) limit 1;
 -- Cap returned options, with explicit visible-result selection in UI.
 return coalesce((select jsonb_agg(v) from(select v from jsonb_array_elements(r) v limit 100) capped),'[]');
 elsif operation='employees' then return app_private.employee_page(q);
 elsif operation='employee' then
 select * into e from public.employees where id=(q->>'id')::uuid and deleted_at is null;
 if e.id is null or not app_private.employee_access(e.id,'R') then raise exception using errcode='42501',message='Record is unavailable'; end if;
 return jsonb_build_object('employee',app_private.project(e),'fields',app_private.catalog(e.id),'assignments',(
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'category',a.category,'target_level',a.target_level,'branch_id',a.branch_id,'client_id',case when app_private.field_access('client','R',a.target_level,a.branch_id,a.client_id) then a.client_id end,'starts_on',a.starts_on,'ends_on',a.ends_on)),'[]') from public.employee_assignments a
 where a.employee_id=e.id and not a.voided and app_private.scope_access('R',a.target_level,a.branch_id,a.client_id) and app_private.field_access('branch','R',a.target_level,a.branch_id,a.client_id)),
 'movements',app_private.history(e.id));
 elsif operation='movements' then return app_private.history(null,q);
 elsif operation='dashboard' then
 with rows as materialized(select projected_row r from app_private.readable_employee_rows())
 select jsonb_build_object('total',count(*),'statuses',(select coalesce(jsonb_object_agg(status,n),'{}') from(select r->'values'->>'status' status,count(*) n from rows where (r->'values') ? 'status' group by 1) s),'placements',(select coalesce(jsonb_object_agg(placement,n),'{}') from(select r->'values'->>'branch' placement,count(*) n from rows where(r->'values') ? 'branch' group by 1) s),'today',app_private.today()) into r from rows;
 return r;
 elsif operation='schema' then
 if not app_private.capability('schema_manage') then raise exception using errcode='42501',message='Access denied'; end if;
 return jsonb_build_object('fields',(select coalesce(jsonb_agg(to_jsonb(f)-'normalized_label'||jsonb_build_object('group_name',g.name,'actions',array['C','R','U','D'])),'[]') from public.field_definitions f join public.field_groups g on g.id=f.group_id),'groups',(select coalesce(jsonb_agg(to_jsonb(g)-'normalized_name'),'[]') from public.field_groups g),'targets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.field_scope_targets t));
 elsif operation='security' then
 if not app_private.is_super() then raise exception using errcode='42501',message='Access denied'; end if;
 return jsonb_build_object('users',(select coalesce(jsonb_agg(to_jsonb(u)),'[]') from public.user_profiles u),'scopes',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from public.user_scope_grants g),'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.field_access_policies p),'capabilities',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.capability_grants c));
 elsif operation='audit' then
 if not app_private.capability('audit_read') then raise exception using errcode='42501',message='Access denied'; end if;
 -- Ordinary delegated audit readers get operational references only, no sensitive keys/reasons.
 return (select coalesce(jsonb_agg(to_jsonb(a)-case when app_private.is_super() then array[]::text[] else array['changed_keys','reason'] end),'[]') from(select * from public.audit_log where app_private.is_super() or(entity='employee' and app_private.employee_access(entity_id,'R')) order by id desc limit 100) a);
 elsif operation='sync' then
 if not app_private.capability('sync_manage') then raise exception using errcode='42501',message='Access denied'; end if;
 return jsonb_build_object('workbooks',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from public.branch_spreadsheets b where app_private.is_super()),'pending',(select count(*) from public.sync_outbox where status<>'synced'),'connected',exists(select 1 from app_private.google_connection));
 else raise exception 'Unknown query'; end if;
end $$;
-- Historical data is separately scope/column checked, including original placement.
