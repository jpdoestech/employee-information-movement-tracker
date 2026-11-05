-- Add mapping to the existing reviewed, versioned, idempotent workbook save.
do $$ begin
 execute replace(replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),
  'FUNCTION public.tracker_mutate(', 'FUNCTION app_private.tracker_mutate_before_sheet_mapping('),
  'tracker_mutate.request_id','tracker_mutate_before_sheet_mapping.request_id');
end $$;
create or replace function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; target text; current_id text; replay boolean; begin
 if operation<>'workbook' or not p ? 'target_spreadsheet_id' then
  return app_private.tracker_mutate_before_sheet_mapping(operation,p,request_id);
 end if;
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can map workbooks'; end if;
 perform 1 from public.system_state where id=true for update;
 select exists(select 1 from public.write_requests w where w.actor_id=auth.uid() and w.request_id=tracker_mutate.request_id) into replay;
 result:=app_private.tracker_mutate_before_sheet_mapping(operation,p,request_id);
 if replay then return result; end if;
 target:=nullif(btrim(p->>'target_spreadsheet_id'),'');
 if target is not null and target !~ '^[A-Za-z0-9_-]{10,200}$' then
  raise exception 'Enter a valid spreadsheet ID';
 end if;
 select spreadsheet_id into current_id from public.branch_spreadsheets where id=(p->>'id')::uuid for update;
 if current_id is not null and current_id is distinct from target then
  raise exception 'This workbook is already mapped; changing destinations requires a reviewed migration';
 end if;
 if target is not null and current_id is null then
  update public.branch_spreadsheets set spreadsheet_id=target,folder_id=null,last_synced_revision=0 where id=(p->>'id')::uuid;
  insert into public.audit_log(actor_id,entity,entity_id,operation,changed_keys,reason,previous_reference,next_reference)
   values(auth.uid(),'workbook',(p->>'id')::uuid,'workbook_mapping',array['spreadsheet_id'],p->>'reason',
    '{}'::jsonb,jsonb_build_object('spreadsheet_id',target));
 end if;
 return result;
end $$;
revoke all on function app_private.tracker_mutate_before_sheet_mapping(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.tracker_mutate(text,jsonb,uuid) from public,anon;
grant execute on function public.tracker_mutate(text,jsonb,uuid) to authenticated;
