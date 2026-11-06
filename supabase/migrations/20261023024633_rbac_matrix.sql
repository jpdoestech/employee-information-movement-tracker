-- Additive RBAC catalog. Native profile roles remain the trusted account boundary.
create table app_private.access_roles(code text primary key check(code ~ '^[a-z][a-z0-9_]{0,63}$'), name text not null check(length(btrim(name)) between 1 and 100));
insert into app_private.access_roles values ('superadmin','Superadmin'),('admin','Administrator'),('viewer','Viewer'),('hr_staff','HR Staff'),('manager','Manager'),('employee','Employee');
create table app_private.access_modules(code text primary key, name text not null, display_order int not null);
insert into app_private.access_modules values ('employees','Employees',10),('movements','Movements',20),('organization','Organization',30),('fields','Field definitions',40),('bulk','Bulk updates',50),('audit','Audit log',60),('sync','Workbook synchronization',70),('access','Access administration',80);
create table app_private.access_actions(module text references app_private.access_modules, action text check(action in ('view','create','update','delete','export','approve','manage')), capability text, primary key(module,action));
insert into app_private.access_actions values
 ('employees','view',null),('employees','create','employee_create'),('employees','update',null),('employees','delete','employee_delete'),('employees','export',null),
 ('movements','view',null),('movements','create','movement_create'),('organization','view',null),('organization','manage','organization_manage'),
 ('fields','manage','schema_manage'),('bulk','update','bulk_update'),('audit','view','audit_read'),('sync','manage','sync_manage'),('access','manage',null);
create table app_private.access_role_permissions(role text references app_private.access_roles, module text, action text, effect text not null check(effect in ('allow','deny')), primary key(role,module,action), foreign key(module,action) references app_private.access_actions);
-- These defaults preserve ordinary read/export and Admin update behavior. Capabilities,
-- scope grants, field permissions and restricted-field rules are still required.
insert into app_private.access_role_permissions
 select r,m,a,'allow' from unnest(array['admin','viewer']) r cross join (values('employees','view'),('employees','export'),('movements','view'),('organization','view')) v(m,a);
insert into app_private.access_role_permissions values ('admin','employees','update','allow');
create table app_private.access_memberships(user_id uuid references public.user_profiles, role text references app_private.access_roles, primary key(user_id,role));
create table app_private.access_overrides(user_id uuid references public.user_profiles, module text, action text, effect text not null check(effect in ('allow','deny')), primary key(user_id,module,action), foreign key(module,action) references app_private.access_actions);
create table app_private.access_record_rules(user_id uuid primary key references public.user_profiles, mode text not null check(mode in ('organization','self','direct_reports','department','assigned')), employee_id uuid references public.employees, departments text[] not null default '{}', assigned uuid[] not null default '{}');
create table app_private.employee_reporting(employee_id uuid primary key references public.employees, manager_id uuid not null references public.employees, check(employee_id<>manager_id));
create index on app_private.employee_reporting(manager_id);
alter table public.field_access_policies drop constraint field_access_policies_role_check;
alter table public.field_access_policies add constraint field_policy_role_catalog foreign key(role) references app_private.access_roles(code);
create function app_private.subject_roles() returns text[] language sql stable security definer set search_path='' as $$
 select array(select (app_private.profile()).role union select role from app_private.access_memberships where user_id=auth.uid())
$$;
create function app_private.module_sources(m text,a text) returns table(source text,role text,capability text,effect text) language sql stable security definer set search_path='' as $$
 select 'direct',null::text,null::text,effect from app_private.access_overrides where user_id=auth.uid() and module=m and action=a
 union all select 'role',role,null,effect from app_private.access_role_permissions where role=any(app_private.subject_roles()) and module=m and action=a
 union all select 'capability',null,g.capability,'allow' from public.capability_grants g join app_private.access_actions d on d.capability=g.capability where g.user_id=auth.uid() and d.module=m and d.action=a
$$;
create function app_private.module_decision(m text,a text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sources jsonb; allowed boolean; begin
 if (app_private.profile()).id is null then return jsonb_build_object('allowed',false,'reason','Inactive or unavailable account'); end if;
 if not exists(select 1 from app_private.access_actions where module=m and action=a) then return jsonb_build_object('allowed',false,'reason','Action does not apply to this module'); end if;
 if app_private.is_super() then return jsonb_build_object('allowed',true,'reason','Trusted Superadmin override'); end if;
 if m='access' or (app_private.profile()).role='viewer' and a not in ('view','export') then return jsonb_build_object('allowed',false,'reason','Account role prohibits this action'); end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]') into sources from app_private.module_sources(m,a) s;
 allowed:=app_private.module_access(m,a);
 return jsonb_build_object('allowed',allowed,'sources',sources,'reason',case when exists(select 1 from jsonb_array_elements(sources) s where s->>'effect'='deny') then 'Explicit DENY overrides grants' when allowed then 'Allowed by the listed role, direct grant or existing capability' else 'Default deny: no grant' end);
end $$;
create function app_private.module_access(m text,a text) returns boolean language sql stable security definer set search_path='' as $$
 with subject as materialized(select p.id,p.role from public.user_profiles p where p.id=auth.uid() and p.active),
 rules as materialized(select effect from app_private.module_sources(m,a))
 select exists(select 1 from subject where role='superadmin') or
 (exists(select 1 from subject where m<>'access' and (role<>'viewer' or a in ('view','export'))) and exists(select 1 from app_private.access_actions where module=m and action=a)
 and not (m='employees' and a='create' and exists(select 1 from app_private.access_record_rules where user_id=auth.uid() and mode<>'organization'))
 and exists(select 1 from rules where effect='allow') and not exists(select 1 from rules where effect='deny'))
$$;
create or replace function app_private.capability(c text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_super() or ((app_private.profile()).role='admin' and case when exists(select 1 from app_private.access_actions where capability=c)
 then exists(select 1 from app_private.access_actions d where d.capability=c and app_private.module_access(d.module,d.action))
 else exists(select 1 from public.capability_grants where user_id=auth.uid() and capability=c) end)
$$;
create function app_private.record_access(e uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_super() or ((app_private.profile()).id is not null and coalesce((select case r.mode
 when 'organization' then true when 'self' then r.employee_id=e
 when 'direct_reports' then exists(select 1 from app_private.employee_reporting where employee_id=e and manager_id=r.employee_id)
 when 'department' then exists(select 1 from public.employees where id=e and custom_values->>'department'=any(r.departments))
 when 'assigned' then e=any(r.assigned) else false end from app_private.access_record_rules r where r.user_id=auth.uid()),true))
$$;
-- Keep every existing caller on the same scope, record and projection helpers.
do $$ begin
 execute replace(pg_get_functiondef('app_private.scope_access(text,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.scope_access(', 'FUNCTION app_private.scope_access_before_matrix(');
 execute replace(pg_get_functiondef('app_private.patch_employee(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure),'FUNCTION app_private.patch_employee(', 'FUNCTION app_private.patch_employee_before_matrix(');
 execute replace(pg_get_functiondef('app_private.project(public.employees)'::regprocedure),'FUNCTION app_private.project(', 'FUNCTION app_private.project_before_matrix(');
 execute replace(replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),'FUNCTION public.tracker_mutate(', 'FUNCTION app_private.tracker_mutate_before_matrix('),'tracker_mutate.request_id','tracker_mutate_before_matrix.request_id');
 execute replace(pg_get_functiondef('public.tracker_query(text,jsonb)'::regprocedure),'FUNCTION public.tracker_query(', 'FUNCTION app_private.tracker_query_before_matrix(');
 execute replace(pg_get_functiondef('public.access_change_preview(text,jsonb)'::regprocedure),'FUNCTION public.access_change_preview(', 'FUNCTION app_private.access_change_preview_before_matrix(');
end $$;
create or replace function app_private.scope_access(a text,target text,b uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.module_access('employees',case a when 'R' then 'view' when 'C' then 'create' else 'update' end) and app_private.scope_access_before_matrix(a,target,b,c)
$$;
create or replace function app_private.employee_access(e uuid,a text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.record_access(e) and app_private.scope_access(a,p.target,p.branch_id,p.client_id) from app_private.placement(e,app_private.today()) p
$$;
create or replace function app_private.patch_employee(eid uuid,expected bigint,patch jsonb,creating boolean default false,target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if not creating and not app_private.record_access(eid) then raise exception using errcode='42501',message='Record is unavailable'; end if;
 perform app_private.patch_employee_before_matrix(eid,expected,patch,creating,target,b,c);
end $$;
do $$ declare definition text; begin
 -- Module visibility must also gate history embedded in the employee editor.
 definition:=pg_get_functiondef('app_private.movement_rows(uuid,jsonb)'::regprocedure);
 execute replace(definition,'where emp.deleted_at is null','where app_private.module_access(''movements'',''view'') and emp.deleted_at is null');
 definition:=pg_get_functiondef('public.export_employees(jsonb)'::regprocedure);
 execute replace(definition,'if (app_private.profile()).id is null then','if not app_private.module_access(''employees'',''export'') then');
 definition:=pg_get_functiondef('public.record_page(jsonb)'::regprocedure);
 execute replace(definition,'if kind not in', 'if not app_private.module_access(case when kind=''audit'' then ''audit'' when kind=''organization'' then ''organization'' else ''movements'' end,''view'') then raise exception using errcode=''42501'',message=''Access denied''; end if; if kind not in');
end $$;
-- One relational evaluator serves both individual checks and bulk projections.
-- Materialized inputs last for this SQL statement only; revocations remain immediate.
create function app_private.field_policy_grid(target text,b uuid,c uuid,wanted_keys text[] default null)
returns table(key text,action text,allowed boolean,reason text,policy_id uuid)
language sql stable security definer set search_path='' as $$
 with subject as materialized(select app_private.is_super() super),
 gates as materialized(select a,app_private.scope_access(a,target,b,c) allowed from unnest(array['C','R','U','D']) a),
 policies as materialized(select p.* from public.field_access_policies p where (p.user_id=auth.uid() or p.role=any(app_private.subject_roles())) and app_private.scope_matches(p.scope_type,p.scope_id,p.include_descendants,target,b,c)),
 legacy as materialized(select l.* from app_private.address_legacy_groups l join public.field_groups g on g.id=l.group_id and g.active),
 fields as materialized(select f.*,f.scope_mode='all' or exists(select 1 from public.field_scope_targets t where t.field_id=f.id and app_private.scope_matches(t.scope_type,t.scope_id,t.include_descendants,target,b,c)) applicable from public.field_definitions f join public.field_groups g on g.id=f.group_id where f.active and g.active and (wanted_keys is null or f.key=any(wanted_keys) or wanted_keys && array['name','last_name','first_name','middle_name','suffix'] and f.key=any(array['name','last_name','first_name','middle_name','suffix']))),
 raw as materialized(
 select f.key,g.a action,g.allowed and f.applicable and (s.super or coalesce(p.effect='allow',false)) allowed,
 case when not g.allowed then 'Organization action denied or inactive account' when not f.applicable then 'Field does not apply at this primary placement'
 when s.super then 'Trusted Superadmin override within applicability'
 when p.id is null and f.sensitivity='restricted' then 'Restricted field requires explicit field allow'
 when p.id is null then 'Default deny: no matching inherited group policy'
 when p.field_id is not null then 'Direct field '||p.effect else 'Group '||p.effect end reason,p.id policy_id
 from fields f cross join gates g cross join subject s left join lateral(
  select p.* from policies p where p.action=g.a and (p.field_id=f.id or (p.group_id=f.group_id or exists(select 1 from legacy l where l.field_id=f.id and l.destination_group=f.group_id and l.group_id=p.group_id)) and (p.effect='deny' or p.inherit_new and f.sensitivity<>'restricted'))
  order by (p.effect='deny') desc,(p.field_id is not null) desc,p.id limit 1
 ) p on true),
 names as materialized(select action,bool_or(key='name' and allowed) name_allowed,count(*) filter(where key=any(array['last_name','first_name','middle_name','suffix']) and allowed)=4 components_allowed from raw group by action),
 resolved as(select r.*,r.allowed and case when r.action='R' and r.key='name' then n.components_allowed when r.action='R' and r.key=any(array['last_name','first_name','middle_name','suffix']) then n.name_allowed when r.action<>'R' and r.key=any(array['last_name','first_name','middle_name','suffix']) then (select name_allowed from names where action=case r.action when 'D' then 'U' else r.action end) else true end final_allowed from raw r join names n on n.action=r.action)
 select key,action,coalesce(final_allowed,false),case when allowed and not coalesce(final_allowed,false) then 'Combined name and component identity permissions must both allow this action' else reason end,policy_id from resolved
$$;
create or replace function app_private.field_access(k text,a text,target text,b uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select allowed from app_private.field_policy_grid(target,b,c,array[k]) where key=k and action=a),false)
$$;
create or replace function app_private.field_decision(k text,a text,target text,b uuid,c uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('allowed',allowed,'reason',reason,'policy_id',policy_id) from app_private.field_policy_grid(target,b,c,array[k]) where key=k and action=a),'{"allowed":false,"reason":"Inactive or unavailable field/group"}'::jsonb)
$$;
create or replace function app_private.catalog(e uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 with targets as materialized(select t.* from app_private.targets() t where e is null or exists(select 1 from app_private.placement(e,app_private.today()) p where (p.target,p.branch_id,p.client_id) is not distinct from(t.target,t.branch_id,t.client_id))),
 permissions as materialized(select distinct x.key,x.action from targets t cross join lateral app_private.field_policy_grid(t.target,t.branch_id,t.client_id) x where x.allowed),
 visible as(select f.*,g.name group_name,g.display_order group_order,(select jsonb_agg(p.action order by p.action) from permissions p where p.key=f.key) actions from public.field_definitions f join public.field_groups g on g.id=f.group_id where exists(select 1 from permissions p where p.key=f.key))
 select coalesce(jsonb_agg((to_jsonb(f)-array['normalized_label','group_order']) order by group_order,display_order),'[]') from visible f
$$;
create or replace function app_private.readable_employee_rows()
returns table(id uuid,projected_row jsonb,target text,branch_id uuid,client_id uuid)
language sql stable security definer set search_path='' as $$
 with placed as materialized(select e employee,p.target,p.branch_id,p.client_id from public.employees e cross join lateral app_private.placement(e.id,app_private.today()) p where e.deleted_at is null and app_private.record_access(e.id)),
 targets as materialized(select distinct p.target,p.branch_id,p.client_id from placed p),
 authorized as materialized(select t.*,array(select key from app_private.field_policy_grid(t.target,t.branch_id,t.client_id) where action='R' and allowed) keys from targets t where app_private.scope_access('R',t.target,t.branch_id,t.client_id))
 select (e.employee).id,jsonb_build_object('id',(e.employee).id,'row_version',(e.employee).row_version,'values',coalesce((select jsonb_object_agg(k,app_private.effective_value(e.employee,k,app_private.today())) from unnest(a.keys) k),'{}')),
 e.target,e.branch_id,e.client_id from placed e join authorized a on (e.target,e.branch_id,e.client_id) is not distinct from(a.target,a.branch_id,a.client_id)
$$;
create or replace function app_private.project(e public.employees) returns jsonb language sql stable security definer set search_path='' as $$
 select case when app_private.employee_access(e.id,'R') then jsonb_build_object('id',e.id,'row_version',e.row_version,'values',coalesce((select jsonb_object_agg(x.key,app_private.effective_value(e,x.key,app_private.today())) from app_private.field_policy_grid(p.target,p.branch_id,p.client_id) x where action='R' and allowed),'{}')) end from app_private.placement(e.id,app_private.today()) p
$$;
create or replace function app_private.access_review_snapshot(subject uuid,targets jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare original text:=current_setting('request.jwt.claim.sub',true); result jsonb; scopes jsonb; subject_label text; begin
 select display_name into subject_label from public.user_profiles where id=subject;
 perform set_config('request.jwt.claim.sub',subject::text,true);
 select coalesce(jsonb_agg(jsonb_build_object('user_id',subject,'user_label',subject_label,'target',t->>'label','target_id',t->>'id','key',x.key,'label',f.label,'action',x.action,'allowed',x.allowed,'reason',x.reason,'restricted',f.sensitivity='restricted')),'[]') into result from jsonb_array_elements(targets) t cross join lateral app_private.field_policy_grid(t->>'kind',(t->>'branch_id')::uuid,(t->>'client_id')::uuid) x join public.field_definitions f on f.key=x.key;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',subject,'user_label',subject_label,'target',t->>'label','target_id',t->>'id','key','_scope','label','Organization access','action',a,'allowed',app_private.scope_access(a,t->>'kind',(t->>'branch_id')::uuid,(t->>'client_id')::uuid),'restricted',false,'reason','An active scope grant and account role must permit this action')),'[]') into scopes from jsonb_array_elements(targets) t cross join unnest(array['C','R','U','D']) a;
 perform set_config('request.jwt.claim.sub',original,true); return result||scopes;
exception when others then perform set_config('request.jwt.claim.sub',original,true); raise;
end $$;
create function app_private.effective_field_grid(target text,b uuid,c uuid,e uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with restriction as materialized(select e is null or app_private.record_access(e) allowed), fields as (
 select f.key,f.label,jsonb_object_agg(x.action,jsonb_build_object('allowed',x.allowed and r.allowed,'reason',case when x.allowed and not r.allowed then 'Record restriction denies this employee' else x.reason end,'policy',to_jsonb(p))) actions
 from app_private.field_policy_grid(target,b,c) x join public.field_definitions f on f.key=x.key cross join restriction r left join public.field_access_policies p on p.id=x.policy_id group by f.key,f.label)
 select coalesce(jsonb_agg(to_jsonb(f) order by label),'[]') from fields f
$$;
-- Read-only configuration and effective decisions; no employee values in configuration.
create function public.access_configuration(q jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=(q->>'user_id')::uuid; begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can administer access'; end if;
 return jsonb_build_object('modules',(select jsonb_agg(to_jsonb(m)||jsonb_build_object('actions',(select jsonb_agg(action order by action) from app_private.access_actions where module=m.code)) order by display_order) from app_private.access_modules m),
 'roles',(select jsonb_agg(to_jsonb(r) order by name) from app_private.access_roles r),
 'memberships',coalesce((select jsonb_agg(role) from app_private.access_memberships where user_id=u),'[]'),
 'role_permissions',coalesce((select jsonb_agg(to_jsonb(p)) from app_private.access_role_permissions p),'[]'),
 'overrides',coalesce((select jsonb_agg(to_jsonb(p)) from app_private.access_overrides p where user_id=u),'[]'),
 'record_rule',coalesce((select to_jsonb(r) from app_private.access_record_rules r where user_id=u),'{"mode":"organization","departments":[],"assigned":[]}'),
 'reporting',coalesce((select jsonb_agg(employee_id) from app_private.employee_reporting where manager_id=(select employee_id from app_private.access_record_rules where user_id=u)),'[]'),
 'departments',coalesce((select jsonb_agg(d order by d) from(select distinct custom_values->>'department' d from public.employees where deleted_at is null and nullif(custom_values->>'department','') is not null) x),'[]'),
 'policies',coalesce((select jsonb_agg(to_jsonb(p)) from public.field_access_policies p),'[]'),
 'scopes',coalesce((select jsonb_agg(to_jsonb(g)) from public.user_scope_grants g where user_id=u),'[]'),
 'revision',(select revision from public.system_state where id=true),'today',app_private.today());
end $$;
create function public.effective_access(q jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare original text:=current_setting('request.jwt.claim.sub',true); u uuid:=(q->>'user_id')::uuid; result jsonb; e uuid:=(q->>'employee_id')::uuid; place record; target text:=q->>'target_level'; b uuid:=(q->>'branch_id')::uuid; c uuid:=(q->>'client_id')::uuid; begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can inspect effective access'; end if;
 if not exists(select 1 from public.user_profiles where id=u) then raise exception 'Select an existing account'; end if;
 result:=public.access_configuration(q);
 if e is not null then
  if not exists(select 1 from public.employees where id=e and deleted_at is null) then raise exception 'Select an active employee record'; end if;
  select * into place from app_private.placement(e,app_private.today()); target:=place.target;b:=place.branch_id;c:=place.client_id;
 end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 result:=result||jsonb_build_object('roles',app_private.subject_roles(),'profile',(select to_jsonb(p) from public.user_profiles p where id=u),
 'modules',(select jsonb_agg(jsonb_build_object('module',d.module,'action',d.action,'decision',app_private.module_decision(d.module,d.action)) order by m.display_order,d.action) from app_private.access_actions d join app_private.access_modules m on m.code=d.module),
 'record_allowed',case when e is not null then app_private.employee_access(e,'R') end,
 'fields',case when target is null or target='all' then '[]'::jsonb else
 app_private.effective_field_grid(target,b,c,e) end);
 perform set_config('request.jwt.claim.sub',original,true); return result;
exception when others then perform set_config('request.jwt.claim.sub',original,true); raise;
end $$;
create or replace function public.tracker_query(operation text,q jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; catalog jsonb; begin
 if operation='context' then
  if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
  catalog:=app_private.catalog();
  result:=jsonb_build_object('profile',to_jsonb(app_private.profile()),'revision',(select revision from public.system_state),'today',app_private.today(),'fields',catalog,
   'groups',(select coalesce(jsonb_agg(to_jsonb(g)-'normalized_name' order by display_order),'[]') from public.field_groups g where g.id::text in(select f->>'group_id' from jsonb_array_elements(catalog) f)),
   'capabilities',(select coalesce(jsonb_agg(c),'[]') from unnest(array['employee_create','employee_delete','organization_manage','schema_manage','movement_create','movement_correct','bulk_update','audit_read','sync_manage']) c where app_private.capability(c)),
   'views',(select coalesce(jsonb_agg(to_jsonb(v)-'user_id'),'[]') from public.user_table_views v where user_id=auth.uid()));
 else result:=app_private.tracker_query_before_matrix(operation,q); end if;
 if operation='context' then result:=result||jsonb_build_object('module_permissions',(select jsonb_object_agg(module||'.'||action,app_private.module_access(module,action)) from app_private.access_actions)); end if;
 return result;
end $$;
-- One transaction for every matrix cell, scope grant, role and record restriction.
create or replace function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); u uuid:=(p->>'user_id')::uuid; r text:=p->>'role_id'; item jsonb; existing public.write_requests; result jsonb; idx int:=0; e uuid; rule jsonb; manager uuid; begin
 if operation='access_role' then
  if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can create roles'; end if;
  if request_id is null or length(btrim(coalesce(p->>'reason',''))) not between 1 and 500 then raise exception 'A request ID and reason are required'; end if;
  perform 1 from public.system_state where id=true for update;
  select * into existing from public.write_requests w where w.actor_id=actor and w.request_id=tracker_mutate.request_id;
  if found then if existing.operation<>operation or existing.payload<>p then raise exception 'Request ID was already used with a different payload'; end if; return existing.result; end if;
  insert into app_private.access_roles values(p->>'code',p->>'name');
  perform app_private.audit('user_profile',null,'access_role',array['role'],p->>'reason'); perform app_private.changed(null,'policy');
  result:=jsonb_build_object('code',p->>'code'); insert into public.write_requests values(actor,request_id,operation,p,result,now()); return result;
 end if;
 if operation<>'access_matrix' then
  if operation='employee_create' and exists(select 1 from app_private.access_record_rules where user_id=actor and mode<>'organization') and not app_private.is_super() then raise exception using errcode='42501',message='Record-restricted accounts cannot create employee records'; end if;
  if operation='employee_delete' and not app_private.record_access((p->>'id')::uuid) then raise exception using errcode='42501',message='Record is unavailable'; end if;
  return app_private.tracker_mutate_before_matrix(operation,p,request_id);
 end if;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can administer permissions'; end if;
 if request_id is null or length(btrim(coalesce(p->>'reason',''))) not between 1 and 500 then raise exception 'A request ID and reason are required'; end if;
 if num_nonnulls(u,r)<>1 or (u is not null and not exists(select 1 from public.user_profiles where id=u)) or (r is not null and not exists(select 1 from app_private.access_roles where code=r)) then raise exception 'Select one existing user or role'; end if;
 perform 1 from public.system_state where id=true for update;
 select * into existing from public.write_requests w where w.actor_id=actor and w.request_id=tracker_mutate.request_id;
 if found then if existing.operation<>operation or existing.payload<>p then raise exception 'Request ID was already used with a different payload'; end if; return existing.result; end if;
 if (p->>'review_revision')::bigint is distinct from (select revision from public.system_state where id=true) or (p->>'review_date')::date is distinct from app_private.today() then raise exception using errcode='40001',message='Access review is stale. Review again before saving'; end if;
 if jsonb_array_length(coalesce(p->'modules','[]'))>1000 or jsonb_array_length(coalesce(p->'fields','[]'))>2000 then raise exception 'Too many permission changes'; end if;
 for item in select * from jsonb_array_elements(coalesce(p->'modules','[]')) loop
  if item->>'effect' not in ('inherit','allow','deny') or item->>'effect' is null or not exists(select 1 from app_private.access_actions where module=item->>'module' and action=item->>'action') then raise exception 'Invalid module permission'; end if;
  if u is not null then
   delete from app_private.access_overrides where user_id=u and module=item->>'module' and action=item->>'action';
   if item->>'effect'<>'inherit' then insert into app_private.access_overrides values(u,item->>'module',item->>'action',item->>'effect'); end if;
  else
   delete from app_private.access_role_permissions where role=r and module=item->>'module' and action=item->>'action';
   if item->>'effect'<>'inherit' then insert into app_private.access_role_permissions values(r,item->>'module',item->>'action',item->>'effect'); end if;
  end if;
 end loop;
 for item in select * from jsonb_array_elements(coalesce(p->'fields','[]')) loop
  if item->>'effect' not in ('inherit','allow','deny') or item->>'effect' is null or item->>'action' not in ('C','R','U','D') or item->>'action' is null or num_nonnulls(item->>'group_id',item->>'field_id')<>1 then raise exception 'Invalid field permission'; end if;
  if p->>'scope_type' is null or not (p->>'scope_type'='all' and p->>'scope_id' is null or exists(select 1 from app_private.targets() t where t.target=p->>'scope_type' and coalesce(t.client_id,t.branch_id) is not distinct from (p->>'scope_id')::uuid)) then raise exception 'Invalid field permission scope'; end if;
  delete from public.field_access_policies x where (x.user_id=u or x.role=r) and coalesce(x.group_id,x.field_id)=coalesce((item->>'group_id')::uuid,(item->>'field_id')::uuid) and x.action=item->>'action' and x.scope_type=p->>'scope_type' and x.scope_id is not distinct from (p->>'scope_id')::uuid;
  if item->>'effect'<>'inherit' then
   insert into public.field_access_policies(user_id,role,group_id,field_id,action,effect,inherit_new,scope_type,scope_id,include_descendants) values(u,r,(item->>'group_id')::uuid,(item->>'field_id')::uuid,item->>'action',item->>'effect',coalesce((item->>'inherit_new')::boolean,true),p->>'scope_type',(p->>'scope_id')::uuid,coalesce((p->>'include_descendants')::boolean,false));
  end if;
 end loop;
 if p ? 'memberships' then
  if u is null then raise exception 'Role memberships require a user'; end if;
  delete from app_private.access_memberships where user_id=u;
  insert into app_private.access_memberships select u,value from jsonb_array_elements_text(p->'memberships');
 end if;
 if p ? 'record_rule' then
  if u is null then raise exception 'Record restrictions require a user'; end if;
  rule:=p->'record_rule'; manager:=(rule->>'employee_id')::uuid;
  if manager is not null and not exists(select 1 from public.employees where id=manager and deleted_at is null) then raise exception 'Linked employee is unavailable'; end if;
  if jsonb_array_length(coalesce(rule->'assigned','[]'))>1000 or jsonb_array_length(coalesce(rule->'departments','[]'))>100 or jsonb_array_length(coalesce(p->'reports','[]'))>1000 then raise exception 'Too many record restrictions'; end if;
  if rule->>'mode' in ('self','direct_reports') and manager is null then raise exception 'Link the account to an employee first'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(rule->'assigned','[]')) x where not exists(select 1 from public.employees where id=x::uuid and deleted_at is null)) then raise exception 'Assigned record is unavailable'; end if;
  insert into app_private.access_record_rules values(u,rule->>'mode',manager,array(select jsonb_array_elements_text(coalesce(rule->'departments','[]'))),array(select jsonb_array_elements_text(coalesce(rule->'assigned','[]')))::uuid[]) on conflict(user_id) do update set mode=excluded.mode,employee_id=excluded.employee_id,departments=excluded.departments,assigned=excluded.assigned;
  if p ? 'reports' then
   if manager is null then raise exception 'Link a manager employee first'; end if;
   if exists(select 1 from jsonb_array_elements_text(p->'reports') x join app_private.employee_reporting t on t.employee_id=x::uuid where t.manager_id<>manager) then raise exception 'A selected employee already reports to another manager'; end if;
   delete from app_private.employee_reporting where manager_id=manager;
   insert into app_private.employee_reporting select value::uuid,manager from jsonb_array_elements_text(p->'reports');
  end if;
 end if;
 if p ? 'scope_grant' then
  if u is null then raise exception 'Organization grants require a user'; end if;
  perform app_private.tracker_mutate_before_matrix('scope',p->'scope_grant'||jsonb_build_object('user_id',u,'reason',p->>'reason'),gen_random_uuid());
 end if;
 for item in select * from jsonb_array_elements(coalesce(p->'revoke_scopes','[]')) loop
  if not exists(select 1 from public.user_scope_grants where id=(item#>>'{}')::uuid and user_id=u) then raise exception 'Scope grant is unavailable'; end if;
  perform app_private.tracker_mutate_before_matrix('scope',jsonb_build_object('id',item,'remove',true,'reason',p->>'reason'),gen_random_uuid());
 end loop;
 perform app_private.audit('user_profile',u,'access_matrix',array['modules','fields','roles','record_rules'],p->>'reason');
 perform app_private.changed(u,'policy'); result:=jsonb_build_object('saved',true);
 insert into public.write_requests values(actor,request_id,operation,p,result,now()); return result;
end $$;
create function app_private.matrix_snapshot(subject uuid, targets jsonb, include_fields boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare original text:=current_setting('request.jwt.claim.sub',true); result jsonb; begin
 perform set_config('request.jwt.claim.sub',subject::text,true);
 select coalesce(jsonb_agg(jsonb_build_object('user_id',subject,'target_id',d.module,'target',m.name,'key','_module','label',m.name,'action',d.action,'allowed',app_private.module_access(d.module,d.action),'reason',app_private.module_decision(d.module,d.action)->>'reason','restricted',false)),'[]') into result from app_private.access_actions d join app_private.access_modules m on m.code=d.module;
 if include_fields then result:=result||app_private.access_review_snapshot(subject,targets); end if;
 perform set_config('request.jwt.claim.sub',original,true); return result;
exception when others then perform set_config('request.jwt.claim.sub',original,true); raise;
end $$;
create or replace function public.access_change_preview(operation text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; revision bigint; subjects uuid[]; subject uuid; targets jsonb; before_values jsonb:='[]'; after_values jsonb:='[]'; include_fields boolean:=jsonb_array_length(coalesce(p->'fields','[]'))>0 or p ? 'scope_grant' or jsonb_array_length(coalesce(p->'revoke_scopes','[]'))>0; begin
 if operation<>'access_matrix' then return app_private.access_change_preview_before_matrix(operation,p); end if;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can review permissions'; end if;
 select s.revision into revision from public.system_state s where id=true for update;
 if p->>'user_id' is not null then subjects:=array[(p->>'user_id')::uuid]; else select array_agg(id) into subjects from public.user_profiles u where u.role=p->>'role_id' or exists(select 1 from app_private.access_memberships where user_id=u.id and role=p->>'role_id'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(client_id::text,branch_id::text,target),'label',coalesce((select name from public.clients where id=t.client_id),(select name from public.branches where id=t.branch_id),case target when 'head_office' then 'Head Office' else 'Unassigned' end),'kind',target,'branch_id',branch_id,'client_id',client_id)),'[]') into targets from app_private.targets() t
 where coalesce(p->>'scope_type','all')='all' or app_private.scope_matches(p->>'scope_type',(p->>'scope_id')::uuid,coalesce((p->>'include_descendants')::boolean,false),target,branch_id,client_id);
 foreach subject in array coalesce(subjects,'{}'::uuid[]) loop before_values:=before_values||app_private.matrix_snapshot(subject,targets,include_fields); end loop;
 begin
  perform public.tracker_mutate(operation,p||jsonb_build_object('review_revision',revision,'review_date',app_private.today()),gen_random_uuid());
  foreach subject in array coalesce(subjects,'{}'::uuid[]) loop after_values:=after_values||app_private.matrix_snapshot(subject,targets,include_fields); end loop;
  result:=jsonb_build_object('revision',revision,'today',app_private.today(),'validated',true,'targets',case when include_fields then targets else '[]'::jsonb end,'user_count',coalesce(cardinality(subjects),0),'modules',p->'modules','fields',p->'fields','record_rule',p->'record_rule','memberships',p->'memberships',
   'changes',(select coalesce(jsonb_agg(a||jsonb_build_object('before',b->'allowed','after',a->'allowed')),'[]') from jsonb_array_elements(after_values) a join jsonb_array_elements(before_values) b on (a->>'user_id',a->>'target_id',a->>'key',a->>'action')=(b->>'user_id',b->>'target_id',b->>'key',b->>'action') where a->'allowed' is distinct from b->'allowed'));
  raise exception using errcode='PT001',message='Rollback matrix validation';
 exception when sqlstate 'PT001' then return result; end;
end $$;
-- Private tables and helpers cannot be used to bypass the RPC boundary.
alter table app_private.access_roles enable row level security;
alter table app_private.access_modules enable row level security;
alter table app_private.access_actions enable row level security;
alter table app_private.access_role_permissions enable row level security;
alter table app_private.access_memberships enable row level security;
alter table app_private.access_overrides enable row level security;
alter table app_private.access_record_rules enable row level security;
alter table app_private.employee_reporting enable row level security;
revoke all on all tables in schema app_private from public,anon,authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.access_configuration(jsonb),public.effective_access(jsonb) from public,anon;
grant execute on function public.access_configuration(jsonb),public.effective_access(jsonb) to authenticated;
