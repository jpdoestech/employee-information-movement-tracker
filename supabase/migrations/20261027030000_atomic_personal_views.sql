-- Keep the legacy save_view operation compatible; the new UI saves both rows once.
create function public.save_personal_view(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior public.write_requests; result jsonb; config jsonb; readable_keys text[];
begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
 p:=app_private.normalize_inputs(p); config:=p->'config';
 if request_id is null or jsonb_typeof(p) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(p) k where k not in ('name','config'))
 or jsonb_typeof(p->'name') is distinct from 'string' or nullif(btrim(p->>'name'),'') is null or length(p->>'name')>80 or p->>'name'='__active__'
 or jsonb_typeof(config) is distinct from 'object'
 or jsonb_typeof(config->'columns') is distinct from 'array'
 or jsonb_typeof(config->'pinned') is distinct from 'array'
 or jsonb_typeof(config->'filter') is distinct from 'object' then
  raise exception using errcode='22023',message='Provide a view name and valid column layout; the active-view name is reserved';
 end if;
 if jsonb_array_length(config->'columns')=0 or jsonb_array_length(config->'pinned')>2
 or exists(select 1 from jsonb_array_elements(config->'columns') k where jsonb_typeof(k)<>'string')
 or exists(select 1 from jsonb_array_elements(config->'pinned') k where jsonb_typeof(k)<>'string')
 or exists(select 1 from jsonb_array_elements_text(config->'pinned') k where not ((config->'columns') ? k))
 or (select count(*)<>count(distinct k) from jsonb_array_elements_text(config->'columns') k)
 or (select count(*)<>count(distinct k) from jsonb_array_elements_text(config->'pinned') k) then
  raise exception using errcode='22023',message='Select distinct columns and at most two visible pinned columns';
 end if;
 perform 1 from public.system_state where id=true for update;
 select coalesce(array_agg(f->>'key'),'{}') into readable_keys from jsonb_array_elements(app_private.catalog()) f
 where (f->>'active')::boolean and (f->>'list_eligible')::boolean and f->'actions' ? 'R';
 if exists(select 1 from jsonb_array_elements_text(config->'columns') k where not k=any(readable_keys)) then
  raise exception using errcode='42501',message='One or more columns are no longer available';
 end if;
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=save_personal_view.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'personal_view' or prior.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return prior.result;
 end if;
 result:=public.tracker_mutate('save_view',jsonb_build_object('name',p->>'name','config',config),gen_random_uuid());
 perform public.tracker_mutate('save_view',jsonb_build_object('name','__active__','config',config),gen_random_uuid());
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'personal_view',p,result);
 return result;
end $$;
revoke all on function public.save_personal_view(jsonb,uuid) from public,anon;
grant execute on function public.save_personal_view(jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
