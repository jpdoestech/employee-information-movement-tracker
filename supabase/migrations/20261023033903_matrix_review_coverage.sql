-- Module/role changes and scope revocations can affect placements outside the
-- field editor's current selection. Review every affected placement in those cases.
do $$ declare definition text; declaration text:='include_fields boolean:='; begin
 definition:=replace(pg_get_functiondef('public.access_change_preview(text,jsonb)'::regprocedure),chr(13),'');
 if strpos(definition,declaration)=0 or strpos(definition,'where coalesce(p->>''scope_type'',''all'')=''all''')=0 then raise exception 'Review matrix preview before extending impact coverage'; end if;
 definition:=replace(definition,declaration,'global_impact boolean:=p ? ''memberships'' or p ? ''scope_grant'' or jsonb_array_length(coalesce(p->''revoke_scopes'',''[]''))>0 or exists(select 1 from jsonb_array_elements(coalesce(p->''modules'',''[]'')) m where m->>''module''=''employees'' and m->>''action'' in (''view'',''create'',''update'')); include_fields boolean:=global_impact or ');
 definition:=replace(definition,'where coalesce(p->>''scope_type'',''all'')=''all''','where global_impact or coalesce(p->>''scope_type'',''all'')=''all''');
 execute definition;
end $$;
