-- Include presentation sections and their parents without expanding field grants.
do $$
declare definition text; previous text := 'g.id::text in(select f->>''group_id'' from jsonb_array_elements(catalog) f)';
begin
 definition:=pg_get_functiondef('public.tracker_query(text,jsonb)'::regprocedure);
 if strpos(definition,previous)=0 then
  raise exception 'Unexpected context group projection; inspect before applying form sections';
 end if;
 definition:=replace(definition,previous,$projection$
 g.id::text in(select f->>'group_id' from jsonb_array_elements(catalog) f)
 or g.id::text in(select coalesce(f->>'form_group_id',f->>'group_id') from jsonb_array_elements(catalog) f)
 or g.id in(select s.parent_group_id from public.field_groups s where s.id::text in(select coalesce(f->>'form_group_id',f->>'group_id') from jsonb_array_elements(catalog) f))
 $projection$);
 execute definition;
end $$;
