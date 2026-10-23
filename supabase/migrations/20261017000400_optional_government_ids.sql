-- Government IDs are optional; populated IDs retain format and configured uniqueness checks.
drop trigger if exists required_government_ids on public.field_definitions;
drop function if exists app_private.required_government_ids();
create or replace function app_private.optional_government_ids() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.validation ? 'government_id_digits' then
  new.required:=false;
  new.is_unique:=true;
 end if;
 return new;
end $$;
create trigger optional_government_ids before insert or update on public.field_definitions
 for each row execute function app_private.optional_government_ids();
update public.field_definitions set required=false,is_unique=true,row_version=row_version+1
 where validation ? 'government_id_digits' and (required or not is_unique);
revoke all on function app_private.optional_government_ids() from public,anon,authenticated;

-- Keyboard deletion and the X clear action must use the same authorized null patch.
do $$ declare d text; needle text:='to_jsonb(regexp_replace(kv.value#>>''{}'',''[ -]'','''',''g''))'; begin
 d:=pg_get_functiondef('app_private.patch_employee_v28(uuid,bigint,jsonb,boolean,text,uuid,uuid)'::regprocedure);
 if strpos(d,'government_id_digits')=0 or strpos(d,needle)=0 then
  raise exception 'Review Government ID canonicalization before applying optional-ID policy';
 end if;
 execute replace(d,needle,'coalesce(to_jsonb(nullif(regexp_replace(kv.value#>>''{}'',''[ -]'','''',''g''),'''')),''null''::jsonb)');
end $$;
