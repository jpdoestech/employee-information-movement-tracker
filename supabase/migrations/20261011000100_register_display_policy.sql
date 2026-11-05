-- Display-only row ordinals never participate in identity, field access or exports.
create table public.register_display_settings (
 id boolean primary key default true check(id),
 row_numbers_allowed boolean not null default true,
 row_version bigint not null default 1
);
insert into public.register_display_settings default values;
alter table public.register_display_settings enable row level security;
revoke all on public.register_display_settings from public, anon, authenticated;

create function public.register_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Account is not authorized'; end if;
 return (select jsonb_build_object('row_numbers_allowed',row_numbers_allowed,'row_version',row_version) from public.register_display_settings where id=true);
end $$;

create function public.set_register_settings(p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); prior public.write_requests; current_settings public.register_display_settings; result jsonb;
begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can change register display policy'; end if;
 if request_id is null then raise exception 'A request ID is required'; end if;
 if jsonb_typeof(p->'row_numbers_allowed') is distinct from 'boolean' or nullif(trim(p->>'reason'),'') is null then raise exception using errcode='22023',message='A display setting and change reason are required'; end if;
 perform 1 from public.system_state where id=true for update;
 -- Recheck after waiting for another administrator's configuration transaction.
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a superadmin can change register display policy'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 select * into prior from public.write_requests w where w.actor_id=actor and w.request_id=set_register_settings.request_id;
 if prior.actor_id is not null then
  if prior.operation<>'register_settings' or prior.payload<>p then raise exception 'Request ID was already used with a different payload'; end if;
  return prior.result;
 end if;
 select * into current_settings from public.register_display_settings where id=true for update;
 if (p->>'expected_version')::bigint is distinct from current_settings.row_version then raise exception using errcode='40001',message='Register settings changed; reload before saving'; end if;
 update public.register_display_settings set row_numbers_allowed=(p->>'row_numbers_allowed')::boolean,row_version=row_version+1 where id=true;
 insert into public.audit_log(actor_id,entity,operation,changed_keys,reason,previous_reference,next_reference)
 values(actor,'register_settings','permission_change',array['row_numbers_allowed'],p->>'reason',jsonb_build_object('row_numbers_allowed',current_settings.row_numbers_allowed),jsonb_build_object('row_numbers_allowed',p->'row_numbers_allowed'));
 update public.system_state set revision=revision+1 where id=true;
 result:=public.register_settings();
 insert into public.write_requests(actor_id,request_id,operation,payload,result) values(actor,request_id,'register_settings',p,result);
 return result;
end $$;
revoke all on function public.register_settings(), public.set_register_settings(jsonb,uuid) from public,anon;
grant execute on function public.register_settings(), public.set_register_settings(jsonb,uuid) to authenticated;
