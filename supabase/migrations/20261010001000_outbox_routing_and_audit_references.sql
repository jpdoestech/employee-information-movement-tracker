alter table public.sync_outbox add column branch_routes uuid[] not null default '{}';
alter table public.sync_outbox add column head_office_route boolean not null default false;
alter table public.audit_log add column previous_reference jsonb not null default '{}';
alter table public.audit_log add column next_reference jsonb not null default '{}';
create or replace function app_private.changed(e uuid,action text) returns void language plpgsql security definer set search_path = '' as $$
declare r bigint; routes uuid[]; ho boolean; begin
 update public.system_state set revision=revision+1 returning revision into r;
 if exists(select 1 from public.employees where id=e) then
 select array_agg(distinct branch_id) filter(where branch_id is not null),bool_or(target_level='head_office') into routes,ho from public.employee_assignments where employee_id=e and category='primary';
 else select array_agg(id),true into routes,ho from public.branches; end if;
 insert into public.sync_outbox(entity_id,action,revision,branch_routes,head_office_route) values(e,action,r,coalesce(routes,'{}'),coalesce(ho,false));
end $$;
create or replace function app_private.audit(entity text,id uuid,op text,keys text[],reason text default '') returns void language plpgsql security definer set search_path = '' as $$
begin
 insert into public.audit_log(actor_id,entity,entity_id,operation,changed_keys,reason,previous_reference,next_reference)
 values(auth.uid(),entity,id,op,keys,reason,case when op='create' then '{}'::jsonb else jsonb_build_object('entity_id',id) end,jsonb_build_object('entity_id',id));
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
