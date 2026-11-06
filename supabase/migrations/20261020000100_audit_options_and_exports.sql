-- Keep metadata reads bounded without truncating the organization's catalog.
do $$ declare definition text; first_pos integer; last_pos integer; begin
 definition:=pg_get_functiondef('public.tracker_query(text,jsonb)'::regprocedure);
 first_pos:=strpos(definition,'elsif operation=''options'' then');
 last_pos:=strpos(definition,'elsif operation=''employees'' then');
 if first_pos=0 or last_pos<=first_pos then raise exception 'Review organization options before applying audit fixes'; end if;
 definition:=overlay(definition placing $options$
 elsif operation='options' then
 if coalesce((q->>'offset')::integer,0)<0 then raise exception 'Invalid option offset'; end if;
 with options as (
 select jsonb_build_object('id','head_office','kind','head_office','label','Head Office','context','Head Office','active',true) x
 where app_private.scope_access('R','head_office',null,null)
 union all
 select jsonb_build_object('id',b.id,'kind','branch','label',b.name,'context','Branch','active',b.active,'row_version',b.row_version,'code',b.code)
 from public.branches b where app_private.scope_access('R','branch',b.id,null)
 or exists(select 1 from public.clients c where c.branch_id=b.id and app_private.scope_access('R','client',b.id,c.id))
 union all
 select jsonb_build_object('id',c.id,'kind','client','label',c.name,'context',b.name,'branch_id',b.id,'active',c.active and b.active,'row_version',c.row_version,'code',c.code)
 from public.clients c join public.branches b on b.id=c.branch_id where app_private.scope_access('R','client',c.branch_id,c.id)
 ), page as (
 select x from options where position(lower(coalesce(q->>'search','')) in lower(concat_ws(' ',x->>'label',x->>'context')))>0
 and (coalesce(jsonb_array_length(q->'branches'),0)=0 or x->>'kind'<>'client' or x->>'branch_id' in(select jsonb_array_elements_text(q->'branches')))
 order by x->>'label',x->>'id' limit 100 offset coalesce((q->>'offset')::integer,0)
 ) select coalesce(jsonb_agg(x order by x->>'label',x->>'id'),'[]') into r from page;
 return r;
 $options$ from first_pos for last_pos-first_pos);
 execute definition;
end $$;

-- An archived permission group must also disappear from workbook projections.
do $$ declare definition text; values_guard text; headers_guard text; begin
 definition:=pg_get_functiondef('public.worker_command(text,jsonb)'::regprocedure);
 values_guard:='where f.active and f.sensitivity=''normal'' and f.key=any(b.allowed_fields)';
 headers_guard:='where key=any(b.allowed_fields) and active and sensitivity=''normal''';
 if strpos(definition,values_guard)=0 or strpos(definition,headers_guard)=0 then
  raise exception 'Review workbook projection before applying audit fixes';
 end if;
 definition:=replace(definition,values_guard,values_guard||' and exists(select 1 from public.field_groups g where g.id=f.group_id and g.active)');
 definition:=replace(definition,headers_guard,headers_guard||' and exists(select 1 from public.field_groups g where g.id=field_definitions.group_id and g.active)');
 execute definition;
end $$;
