-- Dynamic headers follow Field Builder order and this workbook's approved scopes.
-- Values already use the same applicability checks; no new field is auto-approved.
do $$ declare definition text; old_header text; new_header text; begin
 definition:=pg_get_functiondef('app_private.worker_command_before_audit(text,jsonb)'::regprocedure);
 old_header:=$old$'fields',(select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',label)),'[]') from public.field_definitions where key=any(b.allowed_fields) and active and sensitivity='normal' and exists(select 1 from public.field_groups g where g.id=field_definitions.group_id and g.active))$old$;
 new_header:=$new$'fields',(select coalesce(jsonb_agg(jsonb_build_object('key',f.key,'label',f.label) order by f.display_order,f.key),'[]')
  from public.field_definitions f where f.key=any(b.allowed_fields) and f.active and f.sensitivity='normal'
  and exists(select 1 from public.field_groups g where g.id=f.group_id and g.active)
  and (b.branch_id is null and b.include_branch and app_private.applicable(f,'head_office',null,null)
   or b.branch_id is not null and (
    b.include_branch and app_private.applicable(f,'branch',b.branch_id,null)
    or exists(select 1 from unnest(b.allowed_clients) client_id where app_private.applicable(f,'client',b.branch_id,client_id)))))$new$;
 if strpos(definition,old_header)=0 then raise exception 'Review dynamic workbook headers before applying this migration'; end if;
 execute replace(definition,old_header,new_header);
end $$;
