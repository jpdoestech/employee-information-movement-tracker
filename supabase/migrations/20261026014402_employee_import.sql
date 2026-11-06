-- No ordinary role receives Import. Selected users can receive a direct matrix grant.
alter table app_private.access_actions drop constraint access_actions_action_check;
alter table app_private.access_actions add constraint access_actions_action_check
 check(action in ('view','create','update','delete','export','approve','manage','import'));
insert into app_private.access_actions(module,action) values('employees','import');

do $$ begin
 execute replace(replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),
 'FUNCTION public.tracker_mutate(', 'FUNCTION app_private.tracker_mutate_before_import('),
 'tracker_mutate.request_id','tracker_mutate_before_import.request_id');
 execute replace(pg_get_functiondef('public.transaction_preview(text,jsonb)'::regprocedure),
 'FUNCTION public.transaction_preview(', 'FUNCTION app_private.transaction_preview_before_import(');
end $$;

create or replace function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.write_requests; item jsonb; idx integer:=0;
 kind text; b uuid; c uuid; row_values jsonb; payload jsonb; result jsonb;
begin
 if operation is distinct from 'employee_import' then return app_private.tracker_mutate_before_import(operation,p,request_id); end if;
 p:=app_private.normalize_inputs(p);
 if not app_private.module_access('employees','import') or not app_private.capability('employee_create') then
  raise exception using errcode='42501',message='Employee import and employee creation permissions are required';
 end if;
 if request_id is null or jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'rows') is distinct from 'array' then
  raise exception using errcode='22023',message='Choose an employee import file';
 end if;
 if jsonb_array_length(p->'rows') not between 1 and 100 or octet_length(p::text)>1048576 then
  raise exception using errcode='22023',message='Import 1–100 employees and at most 1 MB per batch';
 end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('rows','target_level','branch_id','client_id')) then
  raise exception using errcode='22023',message='Unexpected import option';
 end if;
 kind:=coalesce(p->>'target_level','unassigned'); b:=(p->>'branch_id')::uuid; c:=(p->>'client_id')::uuid;
 perform 1 from public.system_state where id=true for update;
 if not app_private.scope_access('C',kind,b,c) or not app_private.field_access('name','C',kind,b,c) then
  raise exception using errcode='42501',message='Creation scope is not authorized';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 select * into existing from public.write_requests w where w.actor_id=actor and w.request_id=tracker_mutate.request_id;
 if found then
  if existing.operation<>operation or existing.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  -- The receipt contains only a count; no employee data or record IDs are replayed.
  return existing.result;
 end if;
 for item in select value from jsonb_array_elements(p->'rows') loop
  idx:=idx+1;
  begin
   if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'values') is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(item) k where k not in ('values','manual_client_id')) then
    raise exception using errcode='22023',message='Invalid employee row';
   end if;
   row_values:=item->'values';
   if row_values ?| array['employee_category','employee_number','client_employee_number','name','branch','client'] then
    raise exception using errcode='22023',message='Use separate name fields; IDs, organization and category are managed automatically';
   end if;
   payload:=(p-'rows')||jsonb_build_object('values',row_values-'position'-'status',
    'initial_employment',jsonb_build_object('change_kind','official','status',coalesce(row_values->>'status','Active')));
   if row_values ? 'position' then payload:=payload||jsonb_build_object('initial_position',row_values->'position'); end if;
   if item ? 'manual_client_id' then payload:=payload||jsonb_build_object('manual_client_id',item->'manual_client_id'); end if;
   -- Every row uses the complete existing creation path, including duplicates and outbox.
   perform app_private.tracker_mutate_before_import('employee_create',payload,gen_random_uuid());
  exception when others then
   raise exception using errcode=sqlstate,message=format('Row %s: %s',idx,sqlerrm);
  end;
 end loop;
 result:=jsonb_build_object('imported',idx);
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,operation,p,result);
 return result;
end $$;

create or replace function public.transaction_preview(operation text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if operation is distinct from 'employee_import' then return app_private.transaction_preview_before_import(operation,p); end if;
 begin
  result:=public.tracker_mutate(operation,p,gen_random_uuid());
  raise exception using errcode='PZ001',message='Rollback import preview';
 exception when sqlstate 'PZ001' then null;
 end;
 return result||jsonb_build_object('valid',true);
end $$;
revoke all on function app_private.tracker_mutate_before_import(text,jsonb,uuid),app_private.transaction_preview_before_import(text,jsonb) from public,anon,authenticated;
