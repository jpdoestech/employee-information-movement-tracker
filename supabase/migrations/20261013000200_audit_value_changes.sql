-- Retain actual changed values privately; public audit references remain intact.
create table app_private.audit_value_changes (
 id bigint generated always as identity primary key,
 audit_id bigint references public.audit_log(id),
 transaction_id xid8 not null default pg_current_xact_id(),
 employee_id uuid not null references public.employees(id),
 before_values jsonb not null, after_values jsonb not null,
 before_scope jsonb not null, after_scope jsonb not null
);
alter table app_private.audit_value_changes enable row level security;
revoke all on app_private.audit_value_changes from public,anon,authenticated;
create index on app_private.audit_value_changes(audit_id,id);
create index on app_private.audit_value_changes(transaction_id,employee_id) where audit_id is null;

create function app_private.capture_audit_values(eid uuid,before_values jsonb,after_values jsonb,before_scope jsonb,after_scope jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare old_data jsonb; new_data jsonb; begin
 select coalesce(jsonb_object_agg(k,coalesce(before_values->k,'null'::jsonb)),'{}'),
        coalesce(jsonb_object_agg(k,coalesce(after_values->k,'null'::jsonb)),'{}') into old_data,new_data
 from (select jsonb_object_keys(before_values||after_values) k) keys
 where before_values->k is distinct from after_values->k;
 if new_data<>'{}' then
  insert into app_private.audit_value_changes(employee_id,before_values,after_values,before_scope,after_scope)
  values(eid,old_data,new_data,before_scope,after_scope);
 end if;
end $$;

create function app_private.capture_employee_audit_values() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb; previous jsonb:='{}'; current_values jsonb; begin
 select to_jsonb(scope) into p from app_private.placement(new.id,app_private.today()) scope;
 if tg_op='UPDATE' then previous:=old.custom_values||jsonb_build_object('name',old.name,'position',old.initial_position,'status',old.initial_status); end if;
 current_values:=new.custom_values||jsonb_build_object('name',new.name,'position',new.initial_position,'status',new.initial_status);
 perform app_private.capture_audit_values(new.id,previous,current_values,p,p);
 return new;
end $$;
create trigger capture_employee_audit_values after insert or update on public.employees
for each row execute function app_private.capture_employee_audit_values();

create function app_private.capture_movement_audit_values() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb; previous jsonb:='{}'; destination jsonb:='{}'; before_scope jsonb; after_scope jsonb; begin
 select to_jsonb(scope) into p from app_private.placement(new.employee_id,app_private.today()) scope;
 before_scope:=jsonb_build_object('target',coalesce(new.previous_state->>'target_level',p->>'target'),'branch_id',new.previous_state->'branch_id','client_id',new.previous_state->'client_id');
 if new.type in ('position','status') then
  select coalesce(jsonb_object_agg(k,new.previous_state->k),'{}'),coalesce(jsonb_object_agg(k,new.payload->k),'{}') into previous,destination
  from jsonb_object_keys(new.payload) k where k in ('position','status','department');
  after_scope:=p;
 else
  after_scope:=jsonb_build_object('target',new.payload->>'target_level','branch_id',new.payload->'branch_id','client_id',new.payload->'client_id');
  if after_scope->>'target' is null then after_scope:=p; end if;
  previous:=jsonb_build_object('branch',case when before_scope->>'target'='head_office' then 'Head Office' when before_scope->>'target'='unassigned' then 'Unassigned' else (select name from public.branches where id=(before_scope->>'branch_id')::uuid) end,'client',(select name from public.clients where id=(before_scope->>'client_id')::uuid));
  destination:=jsonb_build_object('branch',case when after_scope->>'target'='head_office' then 'Head Office' when after_scope->>'target'='unassigned' then 'Unassigned' else (select name from public.branches where id=(after_scope->>'branch_id')::uuid) end,'client',(select name from public.clients where id=(after_scope->>'client_id')::uuid));
 end if;
 perform app_private.capture_audit_values(new.employee_id,previous,destination,before_scope,after_scope);
 return new;
end $$;
create trigger capture_movement_audit_values after insert on public.employee_movements
for each row execute function app_private.capture_movement_audit_values();

create function app_private.capture_position_correction_audit_values() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb; previous jsonb; begin
 select app_private.effective_value(e,'position',app_private.today()) into previous from public.employees e where id=new.employee_id;
 select to_jsonb(scope) into p from app_private.placement(new.employee_id,app_private.today()) scope;
 perform app_private.capture_audit_values(new.employee_id,jsonb_build_object('position',previous),jsonb_build_object('position',new.value),p,p);
 return new;
end $$;
create trigger capture_position_correction_audit_values before insert on app_private.position_text_corrections
for each row execute function app_private.capture_position_correction_audit_values();

create function app_private.attach_audit_values() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.entity='employee' then
  update app_private.audit_value_changes set audit_id=new.id
  where audit_id is null and transaction_id=pg_current_xact_id() and employee_id=new.entity_id;
 end if;
 return new;
end $$;
create trigger attach_audit_values after insert on public.audit_log for each row execute function app_private.attach_audit_values();

create function app_private.audit_endpoint(a public.audit_log,side text) returns text language plpgsql stable security definer set search_path='' as $$
declare p record; change record; k text; v jsonb; values_by_key jsonb:='{}'; label text; result text[]:='{}'; begin
 if a.entity<>'employee' or not app_private.capability('audit_read') or not app_private.employee_access(a.entity_id,'R') then return null; end if;
 select * into p from app_private.placement(a.entity_id,app_private.today());
 for change in select * from app_private.audit_value_changes where audit_id=a.id order by id loop
  if not app_private.scope_access('R',change.before_scope->>'target',(change.before_scope->>'branch_id')::uuid,(change.before_scope->>'client_id')::uuid)
     or not app_private.scope_access('R',change.after_scope->>'target',(change.after_scope->>'branch_id')::uuid,(change.after_scope->>'client_id')::uuid) then continue; end if;
  for k in select jsonb_object_keys(change.after_values) loop
   if not app_private.field_access(k,'R',p.target,p.branch_id,p.client_id)
      or not app_private.field_access(k,'R',change.before_scope->>'target',(change.before_scope->>'branch_id')::uuid,(change.before_scope->>'client_id')::uuid)
      or not app_private.field_access(k,'R',change.after_scope->>'target',(change.after_scope->>'branch_id')::uuid,(change.after_scope->>'client_id')::uuid) then continue; end if;
   if side='from' and values_by_key ? k then continue; end if;
   v:=case when side='from' then change.before_values->k else change.after_values->k end;
   values_by_key:=values_by_key||jsonb_build_object(k,v);
  end loop;
 end loop;
 for k in select jsonb_object_keys(values_by_key) order by 1 loop
  select f.label into label from public.field_definitions f where f.key=k;
  result:=array_append(result,coalesce(label,k)||': '||coalesce(values_by_key->>k,'—'));
 end loop;
 return nullif(array_to_string(result,' · '),'');
end $$;

do $$ declare def text; needle text:='to_jsonb(a)||jsonb_build_object(''record_on'''; begin
 def:=pg_get_functiondef('public.record_page(jsonb)'::regprocedure);
 if strpos(def,needle)=0 then raise exception 'Review audit projection before adding endpoints'; end if;
 def:=replace(def,needle,'to_jsonb(a)||jsonb_build_object(''from_value'',app_private.audit_endpoint(a,''from''),''to_value'',app_private.audit_endpoint(a,''to''))||jsonb_build_object(''record_on''');
 execute def;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
