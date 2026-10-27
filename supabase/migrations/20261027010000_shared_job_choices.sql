-- Official job names are suggestions. Existing and temporary values remain valid.
do $$ begin
 execute replace(pg_get_functiondef('app_private.validate_value(public.field_definitions,jsonb)'::regprocedure),
  'FUNCTION app_private.validate_value(', 'FUNCTION app_private.validate_value_before_job_choices(');
end $$;
create or replace function app_private.validate_value(f public.field_definitions,v jsonb) returns void
language plpgsql set search_path='' as $$ begin
 if f.key in ('department','position') then f.type:='short_text'; end if;
 perform app_private.validate_value_before_job_choices(f,v);
end $$;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('app_private.validate_definition()'::regprocedure);
 definition:=replace(definition,'if new.type=''select'' then','if new.type=''select'' and new.key not in (''department'',''position'') then');
 execute definition;
end $$;
create function app_private.validate_job_choices() returns trigger language plpgsql set search_path='' as $$ begin
 if new.key in ('department','position') and (
  exists(select 1 from jsonb_array_elements(new.options) o where jsonb_typeof(o)<>'string' or length(btrim(o#>>'{}')) not between 1 and 200)
  or (select count(*) from jsonb_array_elements(new.options))<>(select count(distinct lower(btrim(o))) from jsonb_array_elements_text(new.options) o)
 ) then raise exception using errcode='22023',message='Official job choices must be distinct, nonempty names of at most 200 characters'; end if;
 return new;
end $$;
create trigger validate_job_choices before insert or update on public.field_definitions for each row execute function app_private.validate_job_choices();

-- A separate endpoint changes choices without opening system Position metadata to editing.
create function public.set_job_choices(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); f public.field_definitions; prior public.write_requests; result jsonb;
begin
 if not app_private.is_super() or not app_private.capability('schema_manage') then
  raise exception using errcode='42501',message='Only a Superadmin can configure official job choices';
 end if;
 p:=app_private.normalize_inputs(p);
 if request_id is null or p->>'key' not in ('department','position') or p->>'key' is null or jsonb_typeof(p->'options') is distinct from 'array'
 or exists(select 1 from jsonb_object_keys(p) k where k not in ('key','options','expected_version')) then raise exception 'Choose a Department or Position list'; end if;
 perform 1 from public.system_state where id=true for update;
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=set_job_choices.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'job_choices' or prior.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return prior.result;
 end if;
 select * into f from public.field_definitions where key=p->>'key' for update;
 if f.id is null or f.row_version is distinct from (p->>'expected_version')::bigint then raise exception using errcode='40001',message='Job choices changed; reload before saving'; end if;
 update public.field_definitions set options=p->'options',row_version=row_version+1 where id=f.id returning jsonb_build_object('key',key,'row_version',row_version) into result;
 perform app_private.audit('field',f.id,'job_choices',array['options']);
 perform app_private.changed(null,'schema');
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'job_choices',p,result);
 return result;
end $$;
revoke all on function public.set_job_choices(jsonb,uuid) from public,anon;
grant execute on function public.set_job_choices(jsonb,uuid) to authenticated;
-- Spelling case alone does not change the job filled by an explicitly linked employee.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('app_private.staffing_line_counts(uuid)'::regprocedure);
 definition:=replace(definition,'a.department=l.department and a.position=l.position',
  'lower(btrim(a.department))=lower(btrim(l.department)) and lower(btrim(a.position))=lower(btrim(l.position))');
 execute definition;
 definition:=pg_get_functiondef('app_private.patch_employee_before_integrity(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure);
 definition:=replace(definition,'l.department=coalesce(patch->>''department'',e.custom_values->>''department'')',
  'lower(btrim(l.department))=lower(btrim(coalesce(patch->>''department'',e.custom_values->>''department'')))');
 definition:=replace(definition,'l.position=app_private.effective_value(e,''position'',app_private.today())#>>''{}''',
  'lower(btrim(l.position))=lower(btrim(app_private.effective_value(e,''position'',app_private.today())#>>''{}''))');
 execute definition;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
update public.system_state set revision=revision+1 where id=true;
