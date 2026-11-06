-- A service-only receipt records successful Auth password changes without storing passwords.
create function public.password_change_receipt(p_actor uuid,p_target uuid,p_request uuid,p_reason text,p_fingerprint text,p_complete boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.write_requests; payload jsonb; original text:=current_setting('request.jwt.claim.sub',true); begin
 if not exists(select 1 from public.user_profiles u where u.id=p_actor and u.active and u.role='superadmin') then
  raise exception using errcode='42501',message='Only an active Superadmin can set passwords';
 end if;
 if p_request is null or p_target is null or not exists(select 1 from public.user_profiles u where u.id=p_target)
  or length(btrim(coalesce(p_reason,''))) not between 1 and 500 or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='Invalid password change receipt';
 end if;
 payload:=jsonb_build_object('id',p_target,'reason',btrim(p_reason),'fingerprint',p_fingerprint);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,0));
 select * into previous from public.write_requests w where w.actor_id=p_actor and w.request_id=p_request;
 if previous.actor_id is not null then
  if previous.operation<>'set_password' or previous.payload<>payload then
   raise exception using errcode='40001',message='This request ID belongs to another change';
  end if;
  return jsonb_build_object('id',p_target,'completed',true);
 end if;
 if not coalesce(p_complete,false) then return jsonb_build_object('id',p_target,'completed',false); end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform app_private.audit('user_profile',p_target,'set_password',array['password'],btrim(p_reason));
 perform set_config('request.jwt.claim.sub',coalesce(original,''),true);
 insert into public.write_requests(actor_id,request_id,operation,payload,result)
 values(p_actor,p_request,'set_password',payload,jsonb_build_object('id',p_target));
 return jsonb_build_object('id',p_target,'completed',true);
exception when others then perform set_config('request.jwt.claim.sub',coalesce(original,''),true); raise;
end $$;
revoke all on function public.password_change_receipt(uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.password_change_receipt(uuid,uuid,uuid,text,text,boolean) to service_role;
