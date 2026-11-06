-- Stable system identity plus a permanent identity for each employee/client pair.
-- Client sequences are transactional, serialized per client, and never reset on return.
alter table public.clients add column employee_id_counter integer not null default 0 check(employee_id_counter between 0 and 99999);
create table public.employee_client_ids (
 employee_id uuid not null references public.employees(id), client_id uuid not null references public.clients(id),
 sequence_number integer not null check(sequence_number between 1 and 99999), client_code text not null,
 client_employee_number text generated always as (client_code||'-'||lpad(sequence_number::text,5,'0')) stored,
 issued_at timestamptz not null default now(), primary key(employee_id,client_id), unique(client_id,sequence_number), unique(client_id,client_employee_number)
);
alter table public.employee_client_ids enable row level security;
revoke all on public.employee_client_ids from public,anon,authenticated;
create function app_private.ensure_client_employee_id(e uuid,c uuid) returns text language plpgsql security definer set search_path = '' as $$
declare prefix text; n integer; result text; begin
 select code,employee_id_counter into prefix,n from public.clients where id=c for update;
 if not found then raise exception 'Client is unavailable'; end if;
 select client_employee_number into result from public.employee_client_ids where employee_id=e and client_id=c;
 if found then return result; end if;
 if n>=99999 then raise exception using errcode='22023',message='Client ID sequence is exhausted; contact the system administrator'; end if;
 update public.clients set employee_id_counter=employee_id_counter+1 where id=c returning employee_id_counter into n;
 insert into public.employee_client_ids(employee_id,client_id,sequence_number,client_code) values(e,c,n,upper(trim(prefix))) returning client_employee_number into result;
 return result;
end $$;
create function app_private.issue_client_employee_id() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.target_level='client' then perform app_private.ensure_client_employee_id(new.employee_id,new.client_id); end if;
 return new;
end $$;
create trigger assignment_client_identity after insert on public.employee_assignments for each row execute function app_private.issue_client_employee_id();
create function app_private.protect_client_code() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 new.code:=upper(trim(new.code));
 if new.code !~ '^[A-Z][A-Z0-9_-]{0,19}$' then raise exception using errcode='22023',message='Client code must start with a letter and contain up to 20 letters, numbers, underscores or hyphens'; end if;
 if tg_op='UPDATE' and new.code is distinct from upper(trim(old.code)) and exists(select 1 from public.employee_client_ids where client_id=old.id) then raise exception using errcode='22023',message='Client code is locked because client-based IDs have been issued'; end if;
 return new;
end $$;
create trigger client_identity_code before insert or update of code on public.clients for each row execute function app_private.protect_client_code();
-- Deterministic backfill includes historical/voided placements; consumed IDs stay reserved.
do $$ declare r record; begin
 for r in select distinct employee_id,client_id from public.employee_assignments where client_id is not null order by client_id,employee_id loop
 perform app_private.ensure_client_employee_id(r.employee_id,r.client_id);
 end loop;
end $$;
update public.field_definitions set label='System ID',row_version=row_version+1 where key='employee_number';
insert into public.field_definitions(group_id,key,label,type,display_order,list_eligible,help_text)
select group_id,'client_employee_number','Client-based ID','system',1,true,'Permanent ID within the effective primary client; allocated by the database' from public.field_definitions where key='employee_number';
create or replace function app_private.effective_value(e public.employees,k text,d date) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; p record; begin
 if k='client_employee_number' then
 select * into p from app_private.placement(e.id,d);
 return coalesce((select to_jsonb(client_employee_number) from public.employee_client_ids where employee_id=e.id and client_id=p.client_id),'null'::jsonb);
 elsif k='employee_number' then return to_jsonb(e.employee_number); elsif k='name' then return to_jsonb(e.name);
 elsif k in ('status','position') then
 select payload->k into v from public.employee_movements where employee_id=e.id and type=case when k='status' then 'status' else 'position' end and voided_at is null and effective_on<=d order by effective_on desc,created_at desc,id desc limit 1;
 return coalesce(v,to_jsonb(case when k='status' then e.initial_status else e.initial_position end));
 elsif k in ('branch','client') then
 select * into p from app_private.placement(e.id,d);
 if k='branch' then return to_jsonb(case when p.target='head_office' then 'Head Office' when p.target='unassigned' then 'Unassigned' else (select name from public.branches where id=p.branch_id) end); end if;
 return coalesce((select to_jsonb(name) from public.clients where id=p.client_id),'null'::jsonb);
 else return coalesce(e.custom_values->k,'null'::jsonb); end if;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;

-- The derived client identity is never writable through profile/bulk patches.
create or replace function app_private.patch_employee(eid uuid, expected bigint, patch jsonb, creating boolean default false, target text default null,b uuid default null,c uuid default null) returns void language plpgsql security definer set search_path = '' as $$
declare e public.employees; p record; f public.field_definitions; kv record; action text; merged jsonb; begin
 select * into e from public.employees where id=eid and deleted_at is null for update;
 if e.id is null then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if not creating then select * into p from app_private.placement(eid,app_private.today()); end if;
 -- p uses positional attributes only for create; normalize via explicit target variables.
 if not creating then target:=p.target;b:=p.branch_id;c:=p.client_id; end if;
 if creating and not app_private.scope_access('C',target,b,c) then raise exception using errcode='42501',message='Access denied'; end if;
 if not creating and not (app_private.scope_access('U',target,b,c) or app_private.scope_access('D',target,b,c)) then raise exception using errcode='42501',message='Record is unavailable'; end if;
 if expected is null or expected<>e.row_version then raise exception using errcode='40001',message='Revision conflict: reload before reapplying your draft'; end if;
 if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb or patch ?| array['employee_number','client_employee_number','status','position','branch','client','id','row_version'] then raise exception using errcode='22023',message='System fields require a movement transaction'; end if;
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
revoke all on all functions in schema app_private from public,anon,authenticated;
