import test from 'node:test';
import assert from 'node:assert/strict';
import {SuperfastCoordinator} from '../src/superfast-coordinator.js';
const parent={id:'root'},b=(task,write_paths=[])=>({task,write_paths});
const until=async(fn,ms=5000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setImmediate(r));}throw Error('condition not reached');};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('four executors: an early wait must wake when the last one lands, not at timeout',async()=>{
 const gates=new Map();
 const c=new SuperfastCoordinator({validationRequired:true,notify:async()=>{},execute:async(job)=>{
  job.onReady({id:job.sessionId,steer(){}});
  const g=gate();gates.set(job.role,g);
  await g.promise;return 'out '+job.role;
 }});
 const v=c.start(parent,{objective:'x',branches:[b('A'),b('B'),b('C'),b('D')]});
 const run=c.require(parent,v.runId);
 await until(()=>gates.size===4);
 const pending=c.waitRoot(parent,run.id,{timeoutMs:30000});
 await new Promise(r=>setImmediate(r));
 gates.get('A').resolve();gates.get('D').resolve();
 await new Promise(r=>setTimeout(r,60));
 gates.get('B').resolve();
 await new Promise(r=>setTimeout(r,60));
 gates.get('C').resolve();
 const started=Date.now();
 const w=await pending;
 const elapsed=Date.now()-started;
 assert.equal(w.waitReason,'validation-required',`got ${w.waitReason}`);
 assert(elapsed<1500,`woke after ${elapsed}ms, expected the last executor to wake it`);
 c.acceptValidation(run,c.validation(run).revision);
 await run.completion;
 await c.close();
});
test('four executors with staggered completion and no parent wait still reports ready',async()=>{
 const gates=new Map();
 const c=new SuperfastCoordinator({validationRequired:true,notify:async()=>{},execute:async(job)=>{
  job.onReady({id:job.sessionId,steer(){}});
  const g=gate();gates.set(job.role,g);
  await g.promise;return 'out '+job.role;
 }});
 const v=c.start(parent,{objective:'x',branches:[b('A'),b('B'),b('C'),b('D')]});
 const run=c.require(parent,v.runId);
 await until(()=>gates.size===4);
 for(const r of ['A','D','B']){gates.get(r).resolve();await new Promise(x=>setTimeout(x,40));}
 assert.equal(c.validation(run).ready,false,'still one executor running');
 gates.get('C').resolve();
 await until(()=>c.validation(run).ready,3000);
 assert.equal(c.validation(run).ready,true);
 c.acceptValidation(run,c.validation(run).revision);
 await run.completion;
 await c.close();
});