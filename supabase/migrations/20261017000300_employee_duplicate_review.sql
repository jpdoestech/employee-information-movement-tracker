-- Possible duplicates are advisory; the reviewed result is bound to the atomic save.
alter table public.register_display_settings add column duplicate_name_threshold integer not null default 90
 check(duplicate_name_threshold between 0 and 100);
create index employee_duplicate_birthday on public.employees((custom_values->>'birth_date')) where deleted_at is null;
create or replace function public.register_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
 return (select to_jsonb(s)-'id' from public.register_display_settings s where id=true);
end $$;
do $$ declare d text; begin
 d:=pg_get_functiondef('public.set_register_settings(jsonb,uuid)'::regprocedure);
 d:=replace(d,'perform 1 from public.system_state where id=true for update;',
 'if p ? ''duplicate_name_threshold'' and (jsonb_typeof(p->''duplicate_name_threshold'') is distinct from ''number'' or (p->>''duplicate_name_threshold'')::numeric not between 0 and 100 or (p->>''duplicate_name_threshold'')::numeric<>trunc((p->>''duplicate_name_threshold'')::numeric)) then raise exception using errcode=''22023'',message=''Name similarity must be a whole percentage from 0 to 100''; end if; perform 1 from public.system_state where id=true for update;');
 d:=replace(d,'set row_numbers_allowed=', 'set duplicate_name_threshold=coalesce((p->>''duplicate_name_threshold'')::integer,current_settings.duplicate_name_threshold),row_numbers_allowed=');
 d:=replace(d,'array[''row_numbers_allowed'']','array[''row_numbers_allowed'',''duplicate_name_threshold'']');
 d:=replace(d,'jsonb_build_object(''row_numbers_allowed'',current_settings.row_numbers_allowed)','to_jsonb(current_settings)-''id''');
 d:=replace(d,'jsonb_build_object(''row_numbers_allowed'',p->''row_numbers_allowed'')','public.register_settings()');
 execute d;
end $$;

-- Levenshtein percentage, normalized with the same Unicode rules as field values.
create function app_private.name_similarity(a text,b text) returns numeric
language plpgsql immutable set search_path='' as $$
declare previous integer[]; current_row integer[]; i integer; j integer; n integer; m integer;
begin
 a:=btrim(regexp_replace(app_private.normalized(a),'[^[:alnum:]]+',' ','g'));
 b:=btrim(regexp_replace(app_private.normalized(b),'[^[:alnum:]]+',' ','g'));
 n:=char_length(a); m:=char_length(b);
 if n=0 or m=0 then return 0; end if;
 if n>400 or m>400 then raise exception using errcode='22023',message='Name is too long for duplicate review'; end if;
 previous:=array(select generate_series(0,m));
 for i in 1..n loop
  current_row:=array[i];
  for j in 1..m loop
   current_row:=array_append(current_row,least(current_row[j]+1,previous[j+1]+1,previous[j]+case when substr(a,i,1)=substr(b,j,1) then 0 else 1 end));
  end loop;
  previous:=current_row;
 end loop;
 return 100*(1-previous[m+1]::numeric/greatest(n,m));
end $$;

create function app_private.employee_duplicate_matches(eid uuid,full_name text,birthday text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare threshold integer; settings_version bigint; e public.employees; projected jsonb; item jsonb;
 items jsonb:='[]'; total integer:=0; score numeric; fingerprint text; token text;
begin
 select duplicate_name_threshold,row_version into threshold,settings_version from public.register_display_settings where id=true;
 if nullif(btrim(full_name),'') is null or nullif(birthday,'') is null then return jsonb_build_object('items',items,'total',0,'threshold',threshold); end if;
 if length(full_name)>400 or birthday !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='Enter a valid name and birthday'; end if;
 perform birthday::date;
 fingerprint:=jsonb_build_array(app_private.normalized(full_name),birthday,threshold,settings_version)::text;
 for e in select * from public.employees where deleted_at is null and id is distinct from eid and custom_values->>'birth_date'=birthday order by id loop
  projected:=app_private.project(e);
  -- Do not expose a hidden identity, birthday, placement or even its existence.
  if nullif(projected->'values'->>'name','') is null or projected->'values'->>'birth_date' is distinct from birthday then continue; end if;
  score:=app_private.name_similarity(full_name,e.name);
  if score<threshold then continue; end if;
  item:=jsonb_build_object('id',e.id,'similarity',round(score,1),'row_version',e.row_version,'values','{}'::jsonb);
  item:=jsonb_set(item,'{values}',(select coalesce(jsonb_object_agg(k,v),'{}') from jsonb_each(projected->'values') x(k,v) where k in ('name','birth_date','branch','client','department','position')));
  fingerprint:=encode(sha256(convert_to(fingerprint||item::text,'UTF8')),'hex');
  total:=total+1;
  if total<=20 then items:=items||jsonb_build_array(item); end if;
 end loop;
 token:=encode(sha256(convert_to(fingerprint,'UTF8')),'hex');
 return jsonb_build_object('items',items,'total',total,'threshold',threshold,'token',token);
end $$;

create function app_private.bulk_duplicate_matches(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare row_input jsonb; e public.employees; projected jsonb; review jsonb; match jsonb;
 items jsonb:='[]'; total integer:=0; fingerprint text:=''; threshold integer;
begin
 select duplicate_name_threshold into threshold from public.register_display_settings where id=true;
 for row_input in select * from jsonb_array_elements(p->'rows') loop
  select * into e from public.employees where id=(row_input->>'id')::uuid and deleted_at is null;
  projected:=app_private.project(e);
  if projected->'values'->>'name' is null or projected->'values'->>'birth_date' is null then continue; end if;
  review:=app_private.employee_duplicate_matches(e.id,e.name,e.custom_values->>'birth_date');
  fingerprint:=fingerprint||jsonb_build_array(e.id,review->>'token')::text;
  total:=total+(review->>'total')::integer;
  for match in select * from jsonb_array_elements(review->'items') loop
   if jsonb_array_length(items)<20 then
    items:=items||jsonb_build_array(match||jsonb_build_object('id',e.id::text||':'||(match->>'id'),'candidate_name',projected->'values'->>'name'));
   end if;
  end loop;
 end loop;
 return jsonb_build_object('items',items,'total',total,'threshold',threshold,'token',encode(sha256(convert_to(fingerprint,'UTF8')),'hex'));
end $$;

create function public.employee_duplicates(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare eid uuid:=nullif(q->>'id','')::uuid; v jsonb:=coalesce(q->'values','{}'); e public.employees; projected jsonb;
 target text:=coalesce(q->>'target_level','unassigned'); b uuid:=(q->>'branch_id')::uuid; c uuid:=(q->>'client_id')::uuid;
 full_name text; birthday text; review jsonb;
begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
 if q->>'operation'='bulk_update' then
  -- Reuse the secured rollback-only preview pattern; no draft write persists.
  begin
   perform app_private.tracker_mutate_before_duplicates('bulk_update',q-'operation',gen_random_uuid());
   review:=app_private.bulk_duplicate_matches(q);
   raise exception using errcode='PT001',message='Rollback duplicate review preview';
  exception when sqlstate 'PT001' then return review; end;
 end if;
 if jsonb_typeof(v) is distinct from 'object' then raise exception using errcode='22023',message='Enter employee details'; end if;
 if eid is null then
  if not app_private.capability('employee_create') or not app_private.scope_access('C',target,b,c) or not app_private.field_access('name','C',target,b,c) then raise exception using errcode='42501',message='Creation scope is not authorized'; end if;
  if nullif(v->>'birth_date','') is not null and not app_private.field_access('birth_date','C',target,b,c) then raise exception using errcode='42501',message='Birthday is not authorized'; end if;
  full_name:=app_private.combined_name(v); birthday:=v->>'birth_date';
 else
  select * into e from public.employees where id=eid and deleted_at is null;
  if e.id is null or not app_private.employee_access(eid,'U') then raise exception using errcode='42501',message='Record is unavailable'; end if;
  projected:=app_private.project(e);
  if projected->'values'->>'name' is null or projected->'values'->>'birth_date' is null then return '{"items":[],"total":0}'; end if;
  v:=e.custom_values||v;
  full_name:=case when q->'values' ?| array['last_name','first_name','middle_name','suffix'] then app_private.combined_name(v) else e.name end;
  birthday:=v->>'birth_date';
 end if;
 return app_private.employee_duplicate_matches(eid,full_name,birthday);
end $$;

-- Base authorization, versions, validation and request replay execute unchanged.
do $$ begin
 execute replace(replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),
  'FUNCTION public.tracker_mutate(', 'FUNCTION app_private.tracker_mutate_before_duplicates('),
  'tracker_mutate.request_id','tracker_mutate_before_duplicates.request_id');
end $$;
create or replace function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; e public.employees; duplicates jsonb; replay boolean; projected jsonb;
begin
 if operation in ('employee_create','employee_update','bulk_update') then
  perform 1 from public.system_state where id=true for update;
  select exists(select 1 from public.write_requests w where w.actor_id=auth.uid() and w.request_id=tracker_mutate.request_id) into replay;
 end if;
 result:=app_private.tracker_mutate_before_duplicates(operation,p,request_id);
 if not coalesce(replay,false) and operation='bulk_update' and p->'values' ?| array['name','last_name','first_name','middle_name','suffix','birth_date'] then
  duplicates:=app_private.bulk_duplicate_matches(p);
  if (duplicates->>'total')::integer>0 and p->>'duplicate_review' is distinct from duplicates->>'token' then
   raise exception using errcode='22023',message='Possible duplicate employee. Review matching records and confirm before saving.';
  end if;
 end if;
 if not coalesce(replay,false) and (operation='employee_create' or operation='employee_update' and p->'values' ?| array['name','last_name','first_name','middle_name','suffix','birth_date']) then
  select * into e from public.employees where id=coalesce((result->>'id')::uuid,(p->>'id')::uuid);
  projected:=app_private.project(e);
  if (operation='employee_create' and p->'values'->>'birth_date' is not null) or (projected->'values'->>'name' is not null and projected->'values'->>'birth_date' is not null) then
   duplicates:=app_private.employee_duplicate_matches(e.id,e.name,e.custom_values->>'birth_date');
   if (duplicates->>'total')::integer>0 and p->>'duplicate_review' is distinct from duplicates->>'token' then
    raise exception using errcode='22023',message='Possible duplicate employee. Review matching records and confirm before saving.';
   end if;
  end if;
 end if;
 return result;
end $$;
revoke all on function public.employee_duplicates(jsonb) from public,anon;
grant execute on function public.employee_duplicates(jsonb) to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
