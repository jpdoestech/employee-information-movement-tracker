-- Multiple location edits share the existing reviewed, atomic matrix transaction.
do $migration$
declare definition text; previous text := $old$
 if p ? 'scope_grant' then
  if u is null then raise exception 'Organization grants require a user'; end if;
  perform app_private.tracker_mutate_before_matrix('scope',p->'scope_grant'||jsonb_build_object('user_id',u,'reason',p->>'reason'),gen_random_uuid());
 end if;
$old$;
replacement text := $new$
 if p ? 'scope_grants' then
  if u is null then raise exception 'Organization grants require a user'; end if;
  if p ? 'scope_grant' or jsonb_typeof(p->'scope_grants') is distinct from 'array'
     or jsonb_typeof(p->'scope_snapshot_ids') is distinct from 'array' then
   raise exception 'Provide organization grants and their saved snapshot';
  end if;
  if jsonb_array_length(p->'scope_grants')>100 or jsonb_array_length(coalesce(p->'revoke_scopes','[]'))>1000 then
   raise exception 'Too many organization grant changes';
  end if;
  if array(select id::text from public.user_scope_grants where user_id=u order by id::text)
     is distinct from array(select value from jsonb_array_elements_text(p->'scope_snapshot_ids') order by value) then
   raise exception using errcode='40001',message='Organization access changed. Reload the account and review your selections again';
  end if;
  for item in select * from jsonb_array_elements(p->'scope_grants') loop
   if jsonb_typeof(item) is distinct from 'object' or
      (item - array['scope_type','scope_id','include_descendants','actions','starts_on','ends_on','active']) <> '{}'::jsonb then
    raise exception 'Invalid organization grant';
   end if;
   if jsonb_typeof(item->'actions') is distinct from 'array' then raise exception 'Select organization actions'; end if;
   if jsonb_array_length(item->'actions')=0 or not exists(
     select 1 from app_private.targets() t where t.target=item->>'scope_type'
       and coalesce(t.client_id,t.branch_id) is not distinct from (item->>'scope_id')::uuid
   ) and not (item->>'scope_type'='all' and item->>'scope_id' is null) then
    raise exception 'Select an available organization location and actions';
   end if;
   if coalesce((item->>'include_descendants')::boolean,false) and item->>'scope_type'<>'branch' then
    raise exception 'Only branch grants can include clients';
   end if;
   perform app_private.tracker_mutate_before_matrix('scope',item||jsonb_build_object('user_id',u,'reason',p->>'reason'),gen_random_uuid());
  end loop;
 elsif p ? 'scope_grant' then
  if u is null then raise exception 'Organization grants require a user'; end if;
  perform app_private.tracker_mutate_before_matrix('scope',p->'scope_grant'||jsonb_build_object('user_id',u,'reason',p->>'reason'),gen_random_uuid());
 end if;
$new$;
begin
 select pg_get_functiondef('app_private.tracker_mutate_before_import(text,jsonb,uuid)'::regprocedure) into definition;
 if position(previous in definition)=0 then raise exception 'Matrix organization grant block was not found'; end if;
 execute replace(definition,previous,replacement);
 select pg_get_functiondef('public.access_change_preview(text,jsonb)'::regprocedure) into definition;
 if position('p ? ''scope_grant''' in definition)=0 then raise exception 'Matrix review scope handling was not found'; end if;
 execute replace(definition,'p ? ''scope_grant''','(p ? ''scope_grant'' or p ? ''scope_grants'')');
end $migration$;
