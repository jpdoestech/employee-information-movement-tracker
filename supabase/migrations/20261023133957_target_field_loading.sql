-- Reuse the shared evaluator once per placement instead of once per field/action.
create or replace function public.target_fields(q jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 with permissions as materialized (
  select key,jsonb_agg(action order by array_position(array['C','R','U','D'],action)) actions
  from app_private.field_policy_grid(coalesce(q->>'target_level','unassigned'),(q->>'branch_id')::uuid,(q->>'client_id')::uuid)
  where allowed group by key
 )
 select coalesce(jsonb_agg(to_jsonb(f)-'normalized_label'||jsonb_build_object(
  'group_name',g.name,'default_value',case when s.default_values ? f.key and p.actions ? 'C' then s.default_values->f.key else f.default_value end,
  'actions',p.actions) order by g.display_order,f.display_order),'[]')
 from public.field_definitions f join public.field_groups g on g.id=f.group_id
 join permissions p on p.key=f.key
 left join public.client_entry_settings s on s.client_id=(q->>'client_id')::uuid and q->>'target_level'='client'
 where f.active and g.active
$$;
