import test from 'node:test';
import assert from 'node:assert/strict';
import {SuperfastCoordinator} from '../src/superfast-coordinator.js';
import {superfastParentWriteDenial} from '../src/superfast-channel.js';
const parent={id:'root'},b=(task,write_paths=[])=>({task,write_paths});
const until=async fn=>{for(let n=0;n<300;n++){if(fn())return;await new Promise(r=>setImmediate(r));}throw Error('condition not reached');};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture({validation=true,failFirst=false,help=false}={}){
 const leaf=gate(),started=[],notifications=[];
 const c=new SuperfastCoordinator({validationRequired:validation,notify:async(_p,f)=>notifications.push(f),execute:async(job,upstream)=>{
  started.push({job,upstream});assert.equal(upstream.id,parent.id);assert.equal(job.depth,1);
  job.onReady({id:job.sessionId,steer(){}});
  if(help&&job.attempt===1&&job.role==='A'){const r=await job.report('help','need parent command',true);return 'resumed '+r.reply;}
  await leaf.promise;
  if(failFirst&&job.role==='C'&&job.attempt===1)throw Error('first attempt failed');
  return 'output '+job.role+' a'+job.attempt;
 }});
 const v=c.start(parent,{objective:'flat',branches:[b('A'),b('B'),b('C')]}),run=c.require(parent,v.runId);
 return{c,run,leaf,started,notifications,async close(){leaf.resolve();if(run.status==='running')await c.cancel(parent,run.id);await c.close();}};
}
test('flat run creates exactly the parent-approved executors as direct children',async()=>{
 const f=fixture();try{
  assert.equal(f.run.workerIds.length,3);
  for(const job of f.run.jobs.values()){assert.equal(job.kind,'worker');assert.equal(job.parentId,parent.id);assert.equal(job.depth,1);}
  assert.equal(f.run.jobs.has(f.run.organizerId),false);
  await until(()=>f.started.length===3);
  for(const {upstream} of f.started)assert.equal(upstream.id,parent.id);
 }finally{await f.close();}
});
test('start rejects nested worker plans, wrong counts and overlapping paths before launching',()=>{
 for(const branches of [[b('one')],[b('a'),b('b'),b('c'),b('d'),b('e'),b('f'),b('g'),b('h'),b('i')],[{...b('a',['D:/x']),workers:[b('n1'),b('n2')]},b('b')],[b('a',['D:/same']),b('b',['D:/same/sub'])]]){
  const c=new SuperfastCoordinator({validationRequired:true,notify:async()=>{},execute:async()=>''});
  assert.throws(()=>c.start(parent,{objective:'bad',branches}));assert.equal(c.runs.size,0);
 }
});
test('eight executors run flat as direct children of the parent',async()=>{
 const leaf=gate(),started=[];
 const c=new SuperfastCoordinator({validationRequired:true,notify:async()=>{},execute:async job=>{
  started.push(job);assert.equal(job.depth,1);assert.equal(job.kind,'worker');
  job.onReady({id:job.sessionId,steer(){}});await leaf.promise;return 'ok '+job.role;
 }});
 try{
  const v=c.start(parent,{objective:'eight',branches:Array.from({length:8},(_,i)=>b('w'+i))});
  const run=c.require(parent,v.runId);
  assert.equal(run.workerIds.length,8);
  assert.deepEqual([...run.jobs.values()].map(j=>j.role),['A','B','C','D','E','F','G','H']);
  assert.equal(v.topology,'parent → 2–8 flat executors');
  await until(()=>started.length===8);
  leaf.resolve();
  const w=await c.waitRoot(parent,v.runId,{timeoutMs:3000});
  assert.equal(w.waitReason,'validation-required');
  assert.equal(w.validation.workers,8);
  assert.equal(w.validation.ready,true);
 }finally{await c.close();}
});
test('default wait reports workers-ready once and keeps the run open for verification',async()=>{
 const f=fixture();try{
  await until(()=>f.started.length===3);
  const pending=f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  f.leaf.resolve();
  const w=await pending;
  assert.equal(w.waitReason,'validation-required');assert.equal(w.status,'running');
  assert.equal(w.validation.ready,true);assert.equal(w.reporting.userSummaryAllowed,false);
  const again=await f.c.waitRoot(parent,f.run.id,{timeoutMs:30});
  assert.equal(again.waitReason,'timeout');
 }finally{await f.close();}
});
test('accept requires the current revision, then terminal is reached and reported once',async()=>{
 const f=fixture();try{
  await until(()=>f.started.length===3);f.leaf.resolve();
  const w=await f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  const revision=w.validation.revision;
  assert.throws(()=>f.c.acceptValidation(f.run,revision-1),/stale/);
  f.c.acceptValidation(f.run,revision);
  await f.run.completion;
  assert.equal(f.run.status,'completed');
  assert.equal(f.c.validation(f.run).acceptedRevision,revision);
  assert.equal(f.notifications.filter(n=>n.kind==='run-complete').length,1);
  assert.equal(f.run.listeners.size,0);
 }finally{await f.close();}
});
test('parent rework replaces one executor in place without expanding scope and invalidates acceptance',async()=>{
 const f=fixture();try{
  await until(()=>f.started.length===3);f.leaf.resolve();
  const w=await f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  const leaf=[...f.run.jobs.values()].find(j=>j.role==='A'),before=f.started.length;
  const next=f.c.rework(f.run,leaf.sessionId,'repair the observed failure',w.validation.revision);
  assert.equal(f.c.view(f.run).validation.ready,false);
  assert.throws(()=>f.c.acceptValidation(f.run,w.validation.revision),/stale/);
  await f.run.jobs.get(next.agentId).promise;
  const created=f.started[before];
  assert.equal(created.job.role,'A');assert.equal(created.job.attempt,2);
  assert.deepEqual(created.job.branch.write_paths,leaf.branch.write_paths);
  assert.equal(created.job.depth,1);assert.equal(created.job.parentId,parent.id);
  assert(leaf.supersededBy);assert.equal(f.run.status,'running');
  f.c.acceptValidation(f.run,f.run.workRevision);
  await f.run.completion;assert.equal(f.run.status,'completed');
  assert.match(f.run.summary,/返工/);
 }finally{await f.close();}
});
test('rework rejects stale revision, foreign id, live executor and manager-less targets',async()=>{
 const f=fixture();try{
  await until(()=>f.started.length===3);f.leaf.resolve();
  const w=await f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  const leaf=[...f.run.jobs.values()].find(j=>j.role==='A');
  assert.throws(()=>f.c.rework(f.run,leaf.sessionId,'fix',w.validation.revision-1),/stale/);
  assert.throws(()=>f.c.rework(f.run,'foreign-id','fix',w.validation.revision),/current executor/);
  assert.throws(()=>f.c.rework(f.run,leaf.sessionId,'',w.validation.revision),/repair instructions/);
 }finally{await f.close();}
});
test('failed executor blocks acceptance until a successful rework supersedes it',async()=>{
 const f=fixture({failFirst:true});try{
  await until(()=>f.started.length===3);f.leaf.resolve();
  const w=await f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  assert.throws(()=>f.c.acceptValidation(f.run,w.validation.revision),/failure requires rework/);
  const bad=[...f.run.jobs.values()].find(j=>j.role==='C'&&!j.result?.ok);
  const next=f.c.rework(f.run,bad.sessionId,'repair the thrown failure',w.validation.revision);
  await f.run.jobs.get(next.agentId).promise;
  f.c.acceptValidation(f.run,f.run.workRevision);
  await f.run.completion;assert.equal(f.run.status,'completed');
 }finally{await f.close();}
});
test('pending help is answered by the parent and acceptance is blocked until resolved',async()=>{
 const f=fixture({help:true});try{
  await until(()=>f.started.length===3);
  const w=await f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  assert.equal(w.waitReason,'help');
  assert.equal(w.pendingHelp[0].ownerAgentId,parent.id);
  f.leaf.resolve();
  assert.throws(()=>f.c.acceptValidation(f.run,f.c.view(f.run).validation.revision),/not completed|pending help/);
  f.c.reply(f.run,parent.id,w.pendingHelp[0].agentId,'run this command instead');
  await until(()=>f.c.view(f.run).validation.ready);
  f.c.acceptValidation(f.run,f.c.view(f.run).validation.revision);
  await f.run.completion;assert.equal(f.run.status,'completed');
 }finally{await f.close();}
});
test('reserved paths stay locked for the whole gate and free only after terminal',async()=>{
 const f=fixture();try{
  f.run.task.branches[0].write_paths=['d:/owned'];
  const exec={agent:parent,name:'edit',arguments:{file_path:'D:/owned/a.js'}};
  assert.match(superfastParentWriteDenial(f.c,exec),/reply/);
  await until(()=>f.started.length===3);f.leaf.resolve();
  const w=await f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  assert.match(superfastParentWriteDenial(f.c,exec),/reply/);
  f.c.acceptValidation(f.run,w.validation.revision);
  await f.run.completion;
  assert.equal(superfastParentWriteDenial(f.c,exec),undefined);
 }finally{await f.close();}
});
test('cancel during the gate rejects acceptance and drains every listener',async()=>{
 const f=fixture();try{
  await until(()=>f.started.length===3);f.leaf.resolve();
  await f.c.waitRoot(parent,f.run.id,{timeoutMs:3000});
  const result=await f.c.cancel(parent,f.run.id,'test cancel');
  assert.equal(result.status,'cancelled');
  assert.equal(f.run.listeners.size,0);
  assert.throws(()=>f.c.acceptValidation(f.run,f.run.workRevision),/test cancel/);
 }finally{await f.close();}
});