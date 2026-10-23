-- Synthetic only; no Auth users or automatic privileged signup.
insert into public.field_groups(id,name,description,display_order) values('10000000-0000-0000-0000-000000000001','Core identity','Stable employee identity and controlled movement fields',0),('10000000-0000-0000-0000-000000000002','Contact information','Configurable contact details',1) on conflict do nothing;
insert into public.field_definitions(group_id,key,label,type,display_order) values
 ('10000000-0000-0000-0000-000000000001','employee_number','System ID','system',0),
 ('10000000-0000-0000-0000-000000000001','name','Employee Name','system',1),
 ('10000000-0000-0000-0000-000000000001','status','Employment Status','system',2),
 ('10000000-0000-0000-0000-000000000001','position','Position','system',3),
 ('10000000-0000-0000-0000-000000000001','branch','Primary Branch','system',4),
 ('10000000-0000-0000-0000-000000000001','client','Primary Client','system',5),
 ('10000000-0000-0000-0000-000000000002','email','Email','email',0),
 ('10000000-0000-0000-0000-000000000002','phone','Phone','phone',1) on conflict do nothing;
insert into public.branches(id,code,name) values('20000000-0000-0000-0000-000000000001','B01','Example North Branch'),('20000000-0000-0000-0000-000000000002','B02','Example South Branch') on conflict do nothing;
insert into public.clients(id,branch_id,code,name) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','C01','Example Client'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','C01','Example Client') on conflict do nothing;
insert into public.branch_spreadsheets(branch_id) select id from public.branches on conflict do nothing;
insert into public.branch_spreadsheets(branch_id) values(null) on conflict do nothing;
