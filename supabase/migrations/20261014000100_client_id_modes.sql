-- The display label changes; stable field keys, policies and existing IDs remain.
update public.field_definitions set label='ID',help_text='Unique within the client; issued manually or automatically according to client settings',row_version=row_version+1 where key='client_employee_number';
alter table public.client_entry_settings add column id_mode text not null default 'automatic' check(id_mode in('automatic','manual'));
alter table public.employee_client_ids add column manual_id text check(manual_id is null or (manual_id=upper(btrim(manual_id)) and manual_id ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'));
alter table public.employee_client_ids alter column sequence_number drop not null;
alter table public.employee_client_ids drop column client_employee_number;
alter table public.employee_client_ids add column client_employee_number text generated always as (coalesce(manual_id,client_code||'-'||lpad(sequence_number::text,5,'0'))) stored;
alter table public.employee_client_ids add constraint client_identifier_unique unique(client_id,client_employee_number);
alter table public.employee_client_ids add constraint client_identifier_source check((manual_id is null)=(sequence_number is not null));

create function app_private.ensure_client_employee_id(e uuid,c uuid,requested text) returns text
language plpgsql security definer set search_path='' as $$
declare prefix text; n integer; result text; mode text; supplied text:=nullif(upper(btrim(requested)),''); b uuid; begin
 select code,employee_id_counter,branch_id into prefix,n,b from public.clients where id=c for update;
 if not found then raise exception 'Client is unavailable'; end if;
 select client_employee_number into result from public.employee_client_ids where employee_id=e and client_id=c;
 if found then
  if supplied is not null and supplied<>result then raise exception using errcode='22023',message='This employee already has an ID for this client; the existing ID is retained'; end if;
  return result;
 end if;
 select coalesce((select id_mode from public.client_entry_settings where client_id=c),'automatic') into mode;
 if mode='manual' then
  if not app_private.field_access('client_employee_number','C','client',b,c) then raise exception using errcode='42501',message='Creating an ID for this client is not authorized'; end if;
  if supplied is null or supplied !~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$' then raise exception using errcode='22023',message='Enter an ID of 1-64 letters, digits, hyphens, underscores, dots or slashes'; end if;
  begin
   insert into public.employee_client_ids(employee_id,client_id,sequence_number,client_code,manual_id) values(e,c,null,prefix,supplied) returning client_employee_number into result;
  exception when unique_violation then
   raise exception using errcode='23505',message='ID is already used within this client';
  end;
 else
  if supplied is not null then raise exception using errcode='22023',message='This client uses automatic IDs; remove the manual ID'; end if;
  loop
   if n>=99999 then raise exception using errcode='22023',message='Client ID sequence is exhausted; contact the system administrator'; end if;
   n:=n+1; result:=upper(btrim(prefix))||'-'||lpad(n::text,5,'0');
   exit when not exists(select 1 from public.employee_client_ids where client_id=c and client_employee_number=result);
  end loop;
  update public.clients set employee_id_counter=n where id=c;
  insert into public.employee_client_ids(employee_id,client_id,sequence_number,client_code) values(e,c,n,upper(btrim(prefix))) returning client_employee_number into result;
 end if;
 return result;
end $$;
create or replace function app_private.ensure_client_employee_id(e uuid,c uuid) returns text
language sql security definer set search_path='' as $$ select app_private.ensure_client_employee_id(e,c,null) $$;

-- Pre-issue in the existing authorized transaction. The assignment trigger then
-- reuses the same binding. Errors roll back the employee/movement, ID and outbox.
do $$ declare d text; needle text; begin
 d:=pg_get_functiondef('app_private.tracker_mutate_v20(text,jsonb,uuid)'::regprocedure);
 needle:='if kind<>''unassigned'' then insert into public.employee_assignments';
 if strpos(d,needle)=0 then raise exception 'Review employee creation before applying ID modes'; end if;
 d:=replace(d,needle,$replacement$
 if p ? 'manual_client_id' and (kind<>'client' or jsonb_typeof(p->'manual_client_id') is distinct from 'string') then raise exception using errcode='22023',message='Manual ID is only accepted for a client placement'; end if;
 if kind='client' then perform app_private.ensure_client_employee_id(eid,c,p->>'manual_client_id'); end if;
 if kind<>'unassigned' then insert into public.employee_assignments
 $replacement$);
 execute d;
 d:=pg_get_functiondef('app_private.move_employee(jsonb)'::regprocedure);
 needle:='if dest<>''unassigned'' then insert into public.employee_assignments';
 if strpos(d,needle)=0 then raise exception 'Review movement creation before applying ID modes'; end if;
 d:=replace(d,needle,$replacement$
 if p ? 'manual_client_id' and (dest<>'client' or jsonb_typeof(p->'manual_client_id') is distinct from 'string') then raise exception using errcode='22023',message='Manual ID is only accepted for a client placement'; end if;
 if dest='client' then perform app_private.ensure_client_employee_id(e.id,c,p->>'manual_client_id'); end if;
 if dest<>'unassigned' then insert into public.employee_assignments
 $replacement$);
 execute d;
end $$;

-- ID policy is a Superadmin setting; authorized admins keep managing filters.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.client_settings(jsonb)'::regprocedure);
 d:=replace(d,'''default_values'',case', '''id_mode'',coalesce(settings.id_mode,''automatic''),''default_values'',case');
 execute d;
 d:=pg_get_functiondef('public.set_client_settings(jsonb,uuid)'::regprocedure);
 -- Distinguish the filter alias from the existing PL/pgSQL field record f.
 d:=replace(d,'select 1 from public.field_definitions f where f.key=kv.key and f.active and f.list_eligible and app_private.field_access(f.key,''R'',''client'',c.branch_id,c.id)', 'select 1 from public.field_definitions filter_field where filter_field.key=kv.key and filter_field.active and filter_field.list_eligible and app_private.field_access(filter_field.key,''R'',''client'',c.branch_id,c.id)');
 d:=replace(d,'where id=(p->>''client_id'')::uuid and active;', 'where id=(p->>''client_id'')::uuid and active for update;');
 d:=replace(d,'defaults:=coalesce(cfg.default_values,''{}'');',$replacement$
 if p ? 'id_mode' then
  if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin may configure ID allocation'; end if;
  if jsonb_typeof(p->'id_mode') is distinct from 'string' or p->>'id_mode' not in('automatic','manual') then raise exception using errcode='22023',message='Choose Manual or Automatic IDs'; end if;
 end if;
 defaults:=coalesce(cfg.default_values,'{}');
 $replacement$);
 d:=replace(d,'insert into public.client_entry_settings(client_id,default_values,filter_keys) values(c.id,defaults,keys)', 'insert into public.client_entry_settings(client_id,default_values,filter_keys,id_mode) values(c.id,defaults,keys,coalesce(p->>''id_mode'',cfg.id_mode,''automatic''))');
 d:=replace(d,'set default_values=excluded.default_values,filter_keys=excluded.filter_keys,', 'set default_values=excluded.default_values,filter_keys=excluded.filter_keys,id_mode=excluded.id_mode,');
 d:=replace(d,'array[''default_values'',''filter_keys'']', 'array[''default_values'',''filter_keys'',''id_mode'']');
 d:=replace(d,'jsonb_build_object(''filter_keys'',keys,''default_keys''', 'jsonb_build_object(''id_mode'',coalesce(p->>''id_mode'',cfg.id_mode,''automatic''),''filter_keys'',keys,''default_keys''');
 execute d;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
