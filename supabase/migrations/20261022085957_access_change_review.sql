-- Reuse the live evaluator and rollback-only preview pattern; never copy policy logic.
create function app_private.access_review_snapshot(subject uuid, targets jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare original text:=current_setting('request.jwt.claim.sub',true); result jsonb; scopes jsonb; subject_label text;
begin
 select display_name into subject_label from public.user_profiles where id=subject;
 perform set_config('request.jwt.claim.sub',subject::text,true);
 select coalesce(jsonb_agg(jsonb_build_object(
  'user_id',subject,'user_label',subject_label,'target',t->>'label','target_id',t->>'id','key',f.key,'label',f.label,'action',a,
  'allowed',(decision->>'allowed')::boolean,'reason',decision->>'reason',
  'restricted',f.sensitivity='restricted') order by t->>'label',f.label,a),'[]') into result
 from jsonb_array_elements(targets) t
 cross join public.field_definitions f cross join unnest(array['C','R','U','D']) a
 cross join lateral (select app_private.field_decision(f.key,a,t->>'kind',
  (t->>'branch_id')::uuid,(t->>'client_id')::uuid) decision) d where f.active;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',subject,'user_label',subject_label,'target',t->>'label','target_id',t->>'id',
  'key','_scope','label','Organization access','action',a,'allowed',app_private.scope_access(a,t->>'kind',
  (t->>'branch_id')::uuid,(t->>'client_id')::uuid),'restricted',false,
  'reason','An active scope grant and account role must permit this action')),'[]') into scopes
 from jsonb_array_elements(targets) t cross join unnest(array['C','R','U','D']) a;
 perform set_config('request.jwt.claim.sub',original,true);
 return result||scopes;
exception when others then perform set_config('request.jwt.claim.sub',original,true); raise;
end $$;

create function public.access_change_preview(operation text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare subject uuid; subjects uuid[]; policy jsonb; targets jsonb; before_values jsonb:='[]'; after_values jsonb:='[]';
 changes jsonb; result jsonb; revision bigint;
begin
 if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can review permission changes'; end if;
 if operation not in ('scope','policy','policy_batch') or operation is null then raise exception 'Unsupported access review'; end if;
 select s.revision into revision from public.system_state s where id=true for update;
 policy:=p;
 if p ? 'id' then
  if operation='scope' then select to_jsonb(g) into policy from public.user_scope_grants g where id=(p->>'id')::uuid;
  elsif operation='policy' then select to_jsonb(g) into policy from public.field_access_policies g where id=(p->>'id')::uuid;
  end if;
 end if;
 select array_agg(u.id order by u.id) into subjects from public.user_profiles u
 where u.id=(policy->>'user_id')::uuid or u.role=policy->>'role';
 if policy is null or (policy->>'user_id' is null and policy->>'role' is null) then raise exception 'Choose an existing user or role policy'; end if;
 subjects:=coalesce(subjects,'{}'::uuid[]);
 -- This UI only adds or revokes a policy; replacements require reviewing both audiences.
 if p ? 'id' and not coalesce((p->>'remove')::boolean,false) then raise exception 'Review additions and revocations separately'; end if;
 select coalesce(jsonb_agg(t),'[]') into targets from (
  select jsonb_build_object('id','head_office','label','Head Office','kind','head_office') t
  union all select jsonb_build_object('id','unassigned','label','Unassigned employees','kind','unassigned')
  union all select jsonb_build_object('id',b.id,'label',b.name,'kind','branch','branch_id',b.id) from public.branches b
  union all select jsonb_build_object('id',c.id,'label',b.name||' / '||c.name,'kind','client','branch_id',c.branch_id,'client_id',c.id) from public.clients c join public.branches b on b.id=c.branch_id
 ) all_targets where app_private.scope_matches(coalesce(policy->>'scope_type','all'),(policy->>'scope_id')::uuid,
  coalesce((policy->>'include_descendants')::boolean,false),t->>'kind',(t->>'branch_id')::uuid,(t->>'client_id')::uuid);
 foreach subject in array subjects loop
  before_values:=before_values||app_private.access_review_snapshot(subject,targets);
 end loop;
 begin
  -- Snapshot restores the administrator identity before mutation.
  perform public.tracker_mutate(operation,p,gen_random_uuid());
  foreach subject in array subjects loop
   after_values:=after_values||app_private.access_review_snapshot(subject,targets);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',n->>'user_id','user_label',n->>'user_label','target',n->>'target','target_id',n->>'target_id',
   'key',n->>'key','label',n->>'label','action',n->>'action','before',(o->>'allowed')::boolean,
   'after',(n->>'allowed')::boolean,'reason',n->>'reason','restricted',(n->>'restricted')::boolean)
   order by n->>'target',n->>'label',n->>'action'),'[]') into changes
  from jsonb_array_elements(before_values) o join jsonb_array_elements(after_values) n
   on o->>'user_id'=n->>'user_id' and o->>'target_id'=n->>'target_id' and o->>'key'=n->>'key' and o->>'action'=n->>'action'
  where o->>'allowed' is distinct from n->>'allowed';
  result:=jsonb_build_object('revision',revision,'changes',changes,'targets',targets,
   'today',app_private.today(),'user_count',cardinality(subjects));
  raise exception using errcode='PZ002',message='Rollback access review';
 exception when sqlstate 'PZ002' then null;
 end;
 return result;
end $$;

do $$ begin
 execute replace(replace(pg_get_functiondef('public.tracker_mutate(text,jsonb,uuid)'::regprocedure),
  'FUNCTION public.tracker_mutate(', 'FUNCTION app_private.tracker_mutate_before_access_review('),
  'tracker_mutate.request_id','tracker_mutate_before_access_review.request_id');
end $$;
create or replace function public.tracker_mutate(operation text,p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if operation in ('scope','policy','policy_batch') and p ? 'review_revision' then
  if not app_private.is_super() then raise exception using errcode='42501',message='Only a Superadmin can administer permissions'; end if;
  perform 1 from public.system_state where id=true for update;
  if not exists(select 1 from public.write_requests w where w.actor_id=auth.uid() and w.request_id=tracker_mutate.request_id)
   and ((p->>'review_revision')::bigint is distinct from (select revision from public.system_state where id=true)
    or p ? 'review_date' and (p->>'review_date')::date is distinct from app_private.today()) then
   raise exception using errcode='40001',message='Access review is stale. Review the change again before saving';
  end if;
 end if;
 return app_private.tracker_mutate_before_access_review(operation,p,request_id);
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.access_change_preview(text,jsonb) from public,anon;
grant execute on function public.access_change_preview(text,jsonb) to authenticated;
revoke all on function public.tracker_mutate(text,jsonb,uuid) from public,anon;
grant execute on function public.tracker_mutate(text,jsonb,uuid) to authenticated;
