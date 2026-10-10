create function app_private.targets() returns table(target text,branch_id uuid,client_id uuid) language sql stable security definer set search_path = '' as $$
 select 'head_office',null::uuid,null::uuid union all select 'unassigned',null,null
 union all select 'branch',id,null from public.branches union all select 'client',branch_id,id from public.clients
$$;
create function app_private.catalog(e uuid default null) returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(to_jsonb(f)-'normalized_label' || jsonb_build_object('group_name',g.name,'actions',(
 select coalesce(jsonb_agg(distinct a),'[]') from unnest(array['C','R','U','D']) a where exists(select 1 from app_private.targets() t where (e is null or exists(select 1 from app_private.placement(e,app_private.today()) p where (p.target,p.branch_id,p.client_id) is not distinct from (t.target,t.branch_id,t.client_id))) and app_private.field_access(f.key,a,t.target,t.branch_id,t.client_id)))) order by g.display_order,f.display_order),'[]')
 from public.field_definitions f join public.field_groups g on g.id=f.group_id
 where (false or (f.active and g.active and exists(select 1 from app_private.targets() t,unnest(array['C','R','U','D']) a where app_private.field_access(f.key,a,t.target,t.branch_id,t.client_id) and (e is null or exists(select 1 from app_private.placement(e,app_private.today()) p where (p.target,p.branch_id,p.client_id) is not distinct from(t.target,t.branch_id,t.client_id))))))
$$;
create function app_private.predicate(v jsonb, f jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare op text:=f->>'op'; rhs jsonb:=f->'value'; s text:=v#>>'{}'; begin
 if op='empty' then return v is null or v='null'::jsonb or s=''; end if;
 if v is null or v='null'::jsonb then return false; end if;
 if op='eq' then return v=rhs; elsif op='contains' then return position(lower(rhs#>>'{}') in lower(s))>0;
 elsif op='in' then return rhs @> jsonb_build_array(v);
 elsif op in ('before','after','between') then
 if jsonb_typeof(v)='number' then
 return case when op='before' then s::numeric<(rhs#>>'{}')::numeric when op='after' then s::numeric>(rhs#>>'{}')::numeric else s::numeric between (rhs->>0)::numeric and (rhs->>1)::numeric end;
 else return case when op='before' then s<(rhs#>>'{}') when op='after' then s>(rhs#>>'{}') else s between rhs->>0 and rhs->>1 end; end if;
 end if;
 raise exception using errcode='22023',message='Unsupported filter operator';
end $$;
create function app_private.employee_page(q jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; lim int:=coalesce((q->>'limit')::int,25); off int:=coalesce((q->>'offset')::int,0); begin
 if lim not in (10,25,50,100) or off<0 then raise exception 'Invalid pagination'; end if;
 with projected as (
 select e.id,app_private.project(e) row,p.* from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p
 where e.deleted_at is null and app_private.employee_access(e.id,'R')
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
create function public.tracker_query(operation text,q jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
 with rows as(select app_private.project(e) r from public.employees e where deleted_at is null and app_private.employee_access(e.id,'R'))
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
create function app_private.history(e uuid,q jsonb default '{}') returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(x),'[]') from (
 select jsonb_build_object('id',m.id,'employee_id',m.employee_id,'employee_name',app_private.project(emp)->'values'->'name','type',m.type,'effective_on',m.effective_on,'state',case when m.voided_at is not null then 'Voided' when m.effective_on>app_private.today() then 'Scheduled' else 'Effective / past' end,'reason',case when app_private.is_super() then m.reason else null end,
 'payload',case when app_private.is_super() then m.payload when m.type='status' then jsonb_build_object('status',m.payload->'status') when m.type='position' then jsonb_build_object('position',m.payload->'position') else '{}'::jsonb end) x
 from public.employee_movements m join public.employees emp on emp.id=m.employee_id
 cross join lateral app_private.placement(emp.id,app_private.today()) p
 where emp.deleted_at is null and(e is null or m.employee_id=e) and app_private.employee_access(emp.id,'R')
 and app_private.field_access(case when m.type='status' then 'status' when m.type='position' then 'position' else 'branch' end,'R',p.target,p.branch_id,p.client_id)
 and (app_private.is_super() or (app_private.scope_access('R',coalesce(m.payload->>'target_level',p.target),(m.payload->>'branch_id')::uuid,(m.payload->>'client_id')::uuid) and app_private.scope_access('R',coalesce(m.previous_state->>'target_level',p.target),(m.previous_state->>'branch_id')::uuid,(m.previous_state->>'client_id')::uuid)))
 and(coalesce(q->>'search','')='' or position(lower(q->>'search') in lower(m.type))>0)
 and(coalesce(jsonb_array_length(q->'types'),0)=0 or m.type in(select jsonb_array_elements_text(q->'types')))
 order by m.effective_on desc,m.created_at desc,m.id limit 100
 ) results
$$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.tracker_query(text,jsonb) from public,anon;
grant execute on function public.tracker_query(text,jsonb) to authenticated;
