-- Preview uses a rollback-only subtransaction: identical trusted validators,
-- no committed employee/audit/outbox changes and no hidden old values returned.
create function public.transaction_preview(operation text,p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; begin
 if (app_private.profile()).id is null or (app_private.profile()).role='viewer' then raise exception using errcode='42501',message='Access denied'; end if;
 perform 1 from public.system_state where id for update;
 begin
 if operation='movement' then perform app_private.move_employee(p);
 elsif operation='bulk_update' then
 if not app_private.capability('bulk_update') then raise exception using errcode='42501',message='Access denied'; end if;
 if jsonb_array_length(p->'rows') not between 1 and 100 then raise exception 'Select between 1 and 100 employees'; end if;
 for item in select value from jsonb_array_elements(p->'rows') order by value->>'id' loop perform app_private.patch_employee((item->>'id')::uuid,(item->>'row_version')::bigint,p->'values'); end loop;
 else raise exception 'Unsupported preview'; end if;
 raise exception using errcode='PZ001',message='Rollback preview';
 exception when sqlstate 'PZ001' then null;
 end;
 return jsonb_build_object('valid',true,'count',case when operation='bulk_update' then jsonb_array_length(p->'rows') else 1 end);
end $$;
revoke all on function public.transaction_preview(text,jsonb) from public,anon;
grant execute on function public.transaction_preview(text,jsonb) to authenticated;

create function public.export_employees(q jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare page jsonb; result jsonb:='[]';offset_value int:=0; begin
 if (app_private.profile()).id is null then raise exception using errcode='42501',message='Access denied'; end if;
 loop
 page:=app_private.employee_page(q||jsonb_build_object('limit',100,'offset',offset_value));
 if (page->>'total')::int>10000 then raise exception 'Narrow the export to at most 10,000 employees'; end if;
 result:=result||(page->'items');offset_value:=offset_value+100;
 exit when offset_value>=(page->>'total')::int;
 end loop;
 return jsonb_build_object('items',result,'fields',app_private.catalog());
end $$;
revoke all on function public.export_employees(jsonb) from public,anon;
grant execute on function public.export_employees(jsonb) to authenticated;

-- Guard immutable identifiers even for future trusted administrative endpoints.
create function app_private.immutable_identity() returns trigger language plpgsql set search_path = '' as $$ begin
 if new.id<>old.id or(tg_table_name='employees' and to_jsonb(new)->'employee_number'<>to_jsonb(old)->'employee_number') or(tg_table_name='field_definitions' and to_jsonb(new)->'key'<>to_jsonb(old)->'key') then raise exception 'Permanent identity is immutable'; end if;return new;
end $$;
create trigger employee_identity before update on public.employees for each row execute function app_private.immutable_identity();
create trigger field_identity before update on public.field_definitions for each row execute function app_private.immutable_identity();
revoke all on all functions in schema app_private from public,anon,authenticated;
