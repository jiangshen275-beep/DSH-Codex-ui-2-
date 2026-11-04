import test from 'node:test';
import assert from 'node:assert/strict';
import {SuperfastCoordinator} from '../src/superfast-coordinator.js';
import {waitForRun} from '../src/collaboration-wait.js';
const parent={id:'root'},b=(task,write_paths=[])=>({task,write_paths});
const until=async(fn,ms=4000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setImmediate(r));}throw Error('condition not reached');};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const leaf=gate(),started=[];
 const c=new SuperfastCoordinator({validationRequired:true,notify:async()=>{},execute:async(job)=>{
  job.onReady({id:job.sessionId,steer(){}});
  started.push(job);
  await Promise.race([leaf.promise,new Promise((_,rej)=>{if(job.signal.aborted)return rej(job.signal.reason);job.signal.addEventListener('abort',()=>rej(job.signal.reason),{once:true});})]);
  return 'out '+job.role+' a'+job.attempt;
 }});
 const v=c.start(parent,{objective:'x',branches:[b('A'),b('B')]}),run=c.require(parent,v.runId);
 return{c,run,leaf,started,async close(){leaf.resolve();if(run.status==='running')await c.cancel(parent,run.id);await c.close();}};
}
test('a wait registered before the executors finish wakes on completion',async()=>{
 const f=fixture();try{
  await until(()=>f.started.length===2);
  const pending=f.c.waitRoot(parent,f.run.id,{timeoutMs:4000});
  f.leaf.resolve();
  const w=await pending;
  assert.equal(w.waitReason,'validation-required');
  assert.equal(w.validation.ready,true);
 }finally{await f.close();}
});
test('a wait registered after the executors already finished delivers the current revision instead of timing out',async()=>{
 const f=fixture();try{
  f.leaf.resolve();
  await until(()=>f.c.validation(f.run).ready);
  const w=await f.c.waitRoot(parent,f.run.id,{timeoutMs:4000});
  assert.equal(w.waitReason,'validation-required','the landed result must be delivered, not slept over');
  assert.equal(f.c.validation(f.run).revision,w.validation.revision);
 }finally{await f.close();}
});
test('two rework rounds each announce their own revision and stale acceptance is rejected',async()=>{
 const f=fixture();try{
  f.leaf.resolve();
  await until(()=>f.c.validation(f.run).ready);
  const w1=await f.c.waitRoot(parent,f.run.id,{timeoutMs:4000});
  const rev1=w1.validation.revision;
  const a1=[...f.run.jobs.values()].find(j=>j.role==='A');
  const n1=f.c.rework(f.run,a1.sessionId,'fix round one',rev1);
  const w2=await f.c.waitRoot(parent,f.run.id,{timeoutMs:4000});
  assert.equal(w2.waitReason,'validation-required');
  assert(w2.validation.revision>rev1,'second round must report a newer revision');
  assert.throws(()=>f.c.acceptValidation(f.run,rev1),/stale/);
  const n2=f.c.rework(f.run,n1.agentId,'fix round two',w2.validation.revision);
  const w3=await f.c.waitRoot(parent,f.run.id,{timeoutMs:4000});
  assert(w3.validation.revision>w2.validation.revision);
  assert.throws(()=>f.c.acceptValidation(f.run,w2.validation.revision),/stale/);
  f.c.acceptValidation(f.run,f.c.validation(f.run).revision);
  await f.run.completion;
  assert.equal(f.run.status,'completed');
 }finally{await f.close();}
});
test('the same revision is not announced twice without a change',async()=>{
 const f=fixture();try{
  f.leaf.resolve();
  await until(()=>f.c.validation(f.run).ready);
  const first=await f.c.waitRoot(parent,f.run.id,{timeoutMs:4000});
  assert.equal(first.waitReason,'validation-required');
  const again=await f.c.waitRoot(parent,f.run.id,{timeoutMs:120});
  assert.equal(again.waitReason,'timeout');
  assert.equal(f.c.validation(f.run).revision,first.validation.revision);
 }finally{await f.close();}
});
test('cancelling the run releases every registered listener',async()=>{
 const f=fixture();try{
  await until(()=>f.started.length===2);
  const pending=f.c.waitRoot(parent,f.run.id,{timeoutMs:4000});
  const result=await f.c.cancel(parent,f.run.id,'test cancel');
  assert.equal(result.status,'cancelled');
  await pending.catch(()=>{});
  assert.equal(f.run.listeners.size,0);
 }finally{await f.close();}
});
test('a state change landing between the first snapshot and the subscription is still observed',async()=>{
 const run={listeners:new Set()};
 let value={status:'running',ready:false};
 let reads=0;
 const p=waitForRun(run,()=>{reads++;const seen=value;if(reads===1)value={status:'running',ready:true};return seen;},{timeoutMs:300,ready:v=>v.ready?'ready':null,pollMs:10});
 const w=await p;
 assert.equal(w.waitReason,'ready','the periodic re-check must cover the missed subscription window');
 assert(reads>1);
});
test('an aborted signal rejects without leaving a listener behind',async()=>{
 const run={listeners:new Set()},ctl=new AbortController();
 const p=waitForRun(run,()=>({status:'running'}),{signal:ctl.signal,timeoutMs:5000});
 ctl.abort(Error('user stop'));
 await assert.rejects(p,/user stop/);
 assert.equal(run.listeners.size,0);
});