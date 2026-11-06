create function public.target_fields(q jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(to_jsonb(f)-'normalized_label'||jsonb_build_object('group_name',g.name,'actions',(
 select coalesce(jsonb_agg(a),'[]') from unnest(array['C','R','U','D']) a where app_private.field_access(f.key,a,coalesce(q->>'target_level','unassigned'),(q->>'branch_id')::uuid,(q->>'client_id')::uuid))) order by g.display_order,f.display_order),'[]')
 from public.field_definitions f join public.field_groups g on g.id=f.group_id where f.active and g.active and exists(select 1 from unnest(array['C','R','U','D']) a where app_private.field_access(f.key,a,coalesce(q->>'target_level','unassigned'),(q->>'branch_id')::uuid,(q->>'client_id')::uuid))
$$;
revoke all on function public.target_fields(jsonb) from public,anon;
grant execute on function public.target_fields(jsonb) to authenticated;
