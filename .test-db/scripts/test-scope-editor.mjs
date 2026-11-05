import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testScopeEditor({ owner, test, m, q, as, id, today }) {
  const user = randomUUID();
  await owner.query("insert into auth.users values($1)", [user]);
  await owner.query("insert into public.user_profiles(id,display_name,role) values($1,'Synthetic scope editor','admin')", [user]);
  await owner.query("insert into public.user_scope_grants(user_id,scope_type,actions) values($1,'all',array['R','U'])", [user]);
  await owner.query("insert into public.field_access_policies(user_id,group_id,action,effect,inherit_new) values($1,$2,'R','allow',true)", [user, id.core]);
  const snapshot = async () => (await owner.query("select id::text from public.user_scope_grants where user_id=$1 order by id::text", [user])).rows.map(r => r.id);
  const state = async () => (await owner.query(`select revision,
    (select count(*) from public.user_scope_grants) grants,
    (select count(*) from public.write_requests) requests,
    (select count(*) from public.audit_log) audit,
    (select count(*) from public.sync_outbox) outbox from public.system_state`)).rows[0];
  const grant = (scope_type, scope_id = null, extra = {}) => ({scope_type, scope_id, actions:["R"], starts_on:today, ends_on:null, include_descendants:false, active:true, ...extra});
  const payload = async (scope_grants, revoke_scopes = []) => ({user_id:user, modules:[], fields:[], scope_type:"all", scope_grants, revoke_scopes, scope_snapshot_ids:await snapshot(), reason:"Synthetic scope selection"});
  const review = p => as(id.sa,c => c.query("select public.access_change_preview('access_matrix',$1) r",[p]).then(r => r.rows[0].r));
  const save = async p => { const r = await review(p); const body = {...p, review_revision:r.revision,review_date:r.today}; return {body, result:await m(id.sa,"access_matrix",body)}; };
  const broad = (await snapshot())[0];
  await test("scope selection preview includes removals across locations and rolls back every write", async () => {
    const before = await state();
    const p = await payload([grant("client",id.c1)], [broad]);
    const result = await review(p);
    assert.deepEqual(await state(),before);
    assert(result.targets.some(t => t.id.includes(id.c2)),"Review must cover the other client's removed access");
    assert(result.changes.some(c => c.before && !c.after),"Review must show the lost permissions");
  });
  await test("narrowed client selection removes broad access; secured queries exclude other clients", async () => {
    await save(await payload([grant("client",id.c1)], [broad]));
    assert.equal((await snapshot()).length,1);
    for(const [client,allowed] of [[id.c1,true],[id.c2,false]]) {
      const branch = (await owner.query("select branch_id from public.clients where id=$1",[client])).rows[0].branch_id;
      const effective = await as(id.sa,c => c.query("select public.effective_access($1) r",[{user_id:user,target_level:"client",branch_id:branch,client_id:client}]).then(r=>r.rows[0].r));
      assert.equal(effective.fields.find(f=>f.key==="name").actions.R.allowed,allowed);
    }
    const employee = await m(id.sa,"employee_create",{target_level:"client",branch_id:id.b1,client_id:id.c1,values:{name:"Selected scope employee"}});
    const otherBranch = (await owner.query("select branch_id from public.clients where id=$1",[id.c2])).rows[0].branch_id;
    const other = await m(id.sa,"employee_create",{target_level:"client",branch_id:otherBranch,client_id:id.c2,values:{name:"Outside scope employee"}});
    const rows = await q(user,"employees",{limit:100});
    assert(rows.items.some(e=>e.id===employee.id));
    assert(!rows.items.some(e=>e.id===other.id));
    await assert.rejects(q(user,"employee",{id:other.id}));
  });
  await test("multiple branches and clients save together; replay does not duplicate grants", async () => {
    const p = await payload([grant("branch",id.b1),grant("branch",id.b2),grant("client",id.c2)]);
    const r = await review(p), request = randomUUID();
    const body = {...p,review_revision:r.revision,review_date:r.today};
    const result = await m(id.sa,"access_matrix",body,request), before = await state();
    assert.equal((await snapshot()).length,4);
    assert.deepEqual(await m(id.sa,"access_matrix",body,request),result);
    assert.deepEqual(await state(),before);
  });
  await test("invalid second scope rolls back the first scope and unrelated matrix changes", async () => {
    const p = await payload([grant("head_office"),grant("client",randomUUID())]);
    p.modules=[{module:"employees",action:"view",effect:"deny"}];
    const before=await state();
    await assert.rejects(review(p), /available organization location/);
    assert.deepEqual(await state(),before);
    const raw = {...p,review_revision:before.revision,review_date:today};
    await assert.rejects(m(id.sa,"access_matrix",raw), /available organization location/);
    assert.deepEqual(await state(),before);
  });
  await test("stale saved selection and post-review changes require a fresh review", async () => {
    const stale=await payload([]);
    await save(await payload([grant("head_office")]));
    await assert.rejects(review(stale), /Organization access changed/);
    const p=await payload([]), r=await review(p);
    await save(await payload([grant("unassigned")]));
    await assert.rejects(m(id.sa,"access_matrix",{...p,review_revision:r.revision,review_date:r.today}), /review is stale/);
  });
  await test("batch scope input rejects foreign grant operations and ordinary accounts", async () => {
    for(const extra of [{id:broad},{remove:true},{user_id:id.admin},{actions:[]},{actions:["X"]}]) {
      const p=await payload([grant("head_office",null,extra)]), before=await state();
      await assert.rejects(review(p));
      assert.deepEqual(await state(),before);
    }
    const p=await payload([grant("head_office")]);
    await assert.rejects(m(id.admin,"access_matrix",p),{code:"42501"});
  });
  await test("legacy singular grants remain compatible and complete removal is atomic", async () => {
    const before=await snapshot();
    await save({user_id:user,scope_grant:grant("head_office"),reason:"Legacy scope caller"});
    assert.equal((await snapshot()).length,before.length+1);
    const ids=await snapshot();
    await save(await payload([],ids));
    assert.deepEqual(await snapshot(),[]);
  });
}
