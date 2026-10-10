create function app_private.profile() returns public.user_profiles language sql stable security definer set search_path = '' as $$ select p from public.user_profiles p where p.id=auth.uid() and p.active $$;
create function app_private.is_super() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce((app_private.profile()).role='superadmin',false) $$;
create function app_private.capability(c text) returns boolean language sql stable security definer set search_path = '' as $$ select app_private.is_super() or ((app_private.profile()).role='admin' and exists(select 1 from public.capability_grants where user_id=auth.uid() and capability=c)) $$;
create function app_private.scope_matches(st text, sid uuid, descendants boolean, target text, b uuid, c uuid) returns boolean language sql immutable set search_path = '' as $$
 select st='all' or (st=target and st in ('head_office','unassigned')) or(st='branch' and sid=b and(target='branch' or descendants)) or(st='client' and target='client' and sid=c)
$$;
create function app_private.scope_access(a text, target text,b uuid,c uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select app_private.is_super() or ((app_private.profile()).id is not null and (a='R' or (app_private.profile()).role<>'viewer') and exists(
 select 1 from public.user_scope_grants g where g.user_id=auth.uid() and g.active and g.starts_on<=app_private.today() and(g.ends_on is null or g.ends_on>app_private.today()) and a=any(g.actions) and app_private.scope_matches(g.scope_type,g.scope_id,g.include_descendants,target,b,c)))
$$;
create function app_private.placement(e uuid, d date) returns table(target text,branch_id uuid,client_id uuid) language sql stable security definer set search_path = '' as $$
 select coalesce(a.target_level,'unassigned'),a.branch_id,a.client_id from (select 1) x left join lateral(select * from public.employee_assignments where employee_id=e and category='primary' and not voided and daterange(starts_on,ends_on,'[)') @> d limit 1) a on true
$$;
create function app_private.applicable(f public.field_definitions,target text,b uuid,c uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select f.scope_mode='all' or exists(select 1 from public.field_scope_targets t where t.field_id=f.id and app_private.scope_matches(t.scope_type,t.scope_id,t.include_descendants,target,b,c))
$$;
-- Explicit precedence: direct deny, direct allow, group deny, inherited group allow, deny.
create function app_private.field_access(k text,a text,target text,b uuid,c uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare f public.field_definitions; effect text; begin
 if not app_private.scope_access(a,target,b,c) then return false; end if;
 select * into f from public.field_definitions where key=k and active and exists(select 1 from public.field_groups where id=group_id and active);
 if f.id is null or not app_private.applicable(f,target,b,c) then return false; end if;
 if app_private.is_super() then return true; end if;
 select p.effect into effect from public.field_access_policies p where(p.user_id=auth.uid() or p.role=(app_private.profile()).role) and p.action=a and p.field_id=f.id and app_private.scope_matches(p.scope_type,p.scope_id,p.include_descendants,target,b,c) order by (p.effect='deny') desc limit 1;
 if effect is not null then return effect='allow'; end if;
 if f.sensitivity='restricted' then return false; end if;
 select p.effect into effect from public.field_access_policies p where(p.user_id=auth.uid() or p.role=(app_private.profile()).role) and p.action=a and p.group_id=f.group_id and (p.effect='deny' or p.inherit_new) and app_private.scope_matches(p.scope_type,p.scope_id,p.include_descendants,target,b,c) order by (p.effect='deny') desc limit 1;
 return coalesce(effect='allow',false);
end $$;
create function app_private.employee_access(e uuid,a text) returns boolean language sql stable security definer set search_path = '' as $$ select app_private.scope_access(a,p.target,p.branch_id,p.client_id) from app_private.placement(e,app_private.today()) p $$;
create function app_private.effective_value(e public.employees,k text,d date) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; p record; begin
 if k='employee_number' then return to_jsonb(e.employee_number); elsif k='name' then return to_jsonb(e.name);
 elsif k in ('status','position') then
 select payload->k into v from public.employee_movements where employee_id=e.id and type=case when k='status' then 'status' else 'position' end and voided_at is null and effective_on<=d order by effective_on desc,created_at desc,id desc limit 1;
 return coalesce(v,to_jsonb(case when k='status' then e.initial_status else e.initial_position end));
 elsif k in ('branch','client') then
 select * into p from app_private.placement(e.id,d);
 if k='branch' then return to_jsonb(case when p.target='head_office' then 'Head Office' when p.target='unassigned' then 'Unassigned' else (select name from public.branches where id=p.branch_id) end); end if;
 return coalesce((select to_jsonb(name) from public.clients where id=p.client_id),'null'::jsonb);
 else return coalesce(e.custom_values->k,'null'::jsonb); end if;
end $$;
create function app_private.project(e public.employees) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p record; f record; values jsonb:='{}'; begin
 select * into p from app_private.placement(e.id,app_private.today());
 if not app_private.scope_access('R',p.target,p.branch_id,p.client_id) then return null; end if;
 for f in select key from public.field_definitions where active loop
 if app_private.field_access(f.key,'R',p.target,p.branch_id,p.client_id) then values:=values||jsonb_build_object(f.key,app_private.effective_value(e,f.key,app_private.today())); end if;
 end loop;
 return jsonb_build_object('id',e.id,'row_version',e.row_version,'values',values);
end $$;
create function app_private.audit(entity text,id uuid,op text,keys text[],reason text default '') returns void language plpgsql security definer set search_path = '' as $$ begin
 insert into public.audit_log(actor_id,entity,entity_id,operation,changed_keys,reason) values(auth.uid(),entity,id,op,keys,reason);
end $$;
create function app_private.changed(e uuid,action text) returns void language plpgsql security definer set search_path = '' as $$ declare r bigint; begin
 update public.system_state set revision=revision+1 returning revision into r;
 insert into public.sync_outbox(entity_id,action,revision) values(e,action,r);
end $$;
create function app_private.validate_value(f public.field_definitions,v jsonb) returns void language plpgsql set search_path = '' as $$
declare t text:=jsonb_typeof(v); s text:=v#>>'{}'; begin
 if v='null'::jsonb then if f.required then raise exception using errcode='22023',message='A required field cannot be cleared'; end if; return; end if;
 if f.type in ('short_text','long_text','email','phone','select','date') and t<>'string' or f.type in ('integer','decimal') and t<>'number' or f.type='checkbox' and t<>'boolean' then raise exception using errcode='22023',message='Field value has the wrong type'; end if;
 if f.type='integer' and s::numeric<>trunc(s::numeric) then raise exception using errcode='22023',message='Enter an integer'; end if;
 if f.type='select' and not f.options @> jsonb_build_array(s) then raise exception using errcode='22023',message='Choose an allowed option'; end if;
 if f.type='date' then if s !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='Enter a date'; end if; perform s::date; end if;
 if f.type='email' and s !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception using errcode='22023',message='Enter a valid email'; end if;
 if f.required and (s is null or length(trim(s))=0) then raise exception using errcode='22023',message='Enter a required value'; end if;
 if t='string' and length(s)>coalesce((f.validation->>'max_length')::int,case when f.type='long_text' then 10000 else 500 end) then raise exception using errcode='22023',message='Value exceeds maximum length'; end if;
 if t='number' and ((f.validation ? 'min' and s::numeric<(f.validation->>'min')::numeric) or(f.validation ? 'max' and s::numeric>(f.validation->>'max')::numeric)) then raise exception using errcode='22023',message='Value is outside the allowed range'; end if;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
