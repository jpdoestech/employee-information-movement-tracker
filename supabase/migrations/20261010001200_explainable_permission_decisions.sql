create function app_private.field_decision(k text,a text,target text,b uuid,c uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare f public.field_definitions; effect text; policy_id uuid; begin
 if not app_private.scope_access(a,target,b,c) then return jsonb_build_object('allowed',false,'reason','Organization action denied or inactive account'); end if;
 select * into f from public.field_definitions where key=k and active and exists(select 1 from public.field_groups where id=group_id and active);
 if f.id is null then return jsonb_build_object('allowed',false,'reason','Inactive or unavailable field/group'); end if;
 if not app_private.applicable(f,target,b,c) then return jsonb_build_object('allowed',false,'reason','Field does not apply at this primary placement'); end if;
 if app_private.is_super() then return jsonb_build_object('allowed',true,'reason','Trusted Superadmin override within applicability'); end if;
 select p.effect,p.id into effect,policy_id from public.field_access_policies p where(p.user_id=auth.uid() or p.role=(app_private.profile()).role) and p.action=a and p.field_id=f.id and app_private.scope_matches(p.scope_type,p.scope_id,p.include_descendants,target,b,c) order by (p.effect='deny') desc limit 1;
 if effect is not null then return jsonb_build_object('allowed',effect='allow','reason','Direct field '||effect,'policy_id',policy_id); end if;
 if f.sensitivity='restricted' then return jsonb_build_object('allowed',false,'reason','Restricted field requires explicit field allow'); end if;
 select p.effect,p.id into effect,policy_id from public.field_access_policies p where(p.user_id=auth.uid() or p.role=(app_private.profile()).role) and p.action=a and p.group_id=f.group_id and (p.effect='deny' or p.inherit_new) and app_private.scope_matches(p.scope_type,p.scope_id,p.include_descendants,target,b,c) order by (p.effect='deny') desc limit 1;
 return jsonb_build_object('allowed',coalesce(effect='allow',false),'reason',case when effect is null then 'Default deny: no matching inherited group policy' else 'Group '||effect end,'policy_id',policy_id);
end $$;

revoke all on function app_private.field_decision(text,text,text,uuid,uuid) from public,anon,authenticated;
create or replace function app_private.field_access(k text,a text,target text,b uuid,c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select (app_private.field_decision(k,a,target,b,c)->>'allowed')::boolean
$$;

create or replace function public.permission_preview(q jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare original text; result jsonb; begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Access denied'; end if;
 original:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',q->>'user_id',true);
 select coalesce(jsonb_agg(jsonb_build_object('key',f.key,'label',f.label,'actions',(select coalesce(jsonb_agg(a),'[]') from unnest(array['C','R','U','D']) a where app_private.field_access(f.key,a,q->>'target_level',(q->>'branch_id')::uuid,(q->>'client_id')::uuid)),
 'decisions',(select jsonb_object_agg(a,app_private.field_decision(f.key,a,q->>'target_level',(q->>'branch_id')::uuid,(q->>'client_id')::uuid)) from unnest(array['C','R','U','D']) a),
 'explanation',(select string_agg(a||': '||(app_private.field_decision(f.key,a,q->>'target_level',(q->>'branch_id')::uuid,(q->>'client_id')::uuid)->>'reason'),'; ') from unnest(array['C','R','U','D']) a))),'[]') into result from public.field_definitions f where f.active;
 perform set_config('request.jwt.claim.sub',original,true);return result;
 exception when others then perform set_config('request.jwt.claim.sub',original,true);raise;
end $$;
revoke all on function public.permission_preview(jsonb) from public,anon;
grant execute on function public.permission_preview(jsonb) to authenticated;
