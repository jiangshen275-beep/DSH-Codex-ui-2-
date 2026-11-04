import test from 'node:test';
import assert from 'node:assert/strict';
import {SuperfastCoordinator} from '../src/superfast-coordinator.js';
const parent={id:'root'},b=(task,write_paths=[])=>({task,write_paths});
const until=async(fn,ms=4000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setImmediate(r));}throw Error('condition not reached');};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('r7 sequence: finish parked in validation wait, parent reworks and then waits, replacement still wakes it',async()=>{
 const gates=new Map(),seen=[];
 const c=new SuperfastCoordinator({validationRequired:true,notify:async()=>{},execute:async(job)=>{
  job.onReady({id:job.sessionId,steer(){}});
  const key=job.role+'#'+job.attempt,g=gate();
  gates.set(key,g);seen.push(key);
  await g.promise;
  return 'out '+key;
 }});
 const v=c.start(parent,{objective:'x',branches:[b('A'),b('B'),b('C')]});
 const run=c.require(parent,v.runId);
 await until(()=>gates.size===3);
 for(const key of ['A#1','B#1','C#1'])gates.get(key).resolve();
 // first generation lands: finish() now parks in its own validation wait
 await until(()=>c.validation(run).ready);
 await new Promise(r=>setImmediate(r));
 const rev=c.validation(run).revision;
 const a1=[...run.jobs.values()].find(j=>j.role==='A');
 const next=c.rework(run,a1.sessionId,'repair the interface mismatch',rev);
 await until(()=>gates.has('A#2'));
 // parent waits while the replacement is still running
 const pending=c.waitRoot(parent,run.id,{timeoutMs:5000});
 await new Promise(r=>setImmediate(r));
 gates.get('A#2').resolve();
 const w=await pending;
 assert.equal(w.waitReason,'validation-required','the replacement must wake a parent wait that started before it finished');
 assert(w.validation.revision>rev);
 c.acceptValidation(run,c.validation(run).revision);
 await run.completion;
 assert.equal(run.status,'completed');
 await c.close();
});
test('r7 sequence with the wait issued after the replacement already finished',async()=>{
 const gates=new Map();
 const c=new SuperfastCoordinator({validationRequired:true,notify:async()=>{},execute:async(job)=>{
  job.onReady({id:job.sessionId,steer(){}});
  const key=job.role+'#'+job.attempt,g=gate();
  gates.set(key,g);await g.promise;return 'out '+key;
 }});
 const v=c.start(parent,{objective:'x',branches:[b('A'),b('B')]});
 const run=c.require(parent,v.runId);
 await until(()=>gates.size===2);
 gates.get('A#1').resolve();gates.get('B#1').resolve();
 await until(()=>c.validation(run).ready);
 await new Promise(r=>setImmediate(r));
 const rev=c.validation(run).revision;
 const a1=[...run.jobs.values()].find(j=>j.role==='A');
 c.rework(run,a1.sessionId,'repair',rev);
 await until(()=>gates.has('A#2'));
 gates.get('A#2').resolve();
 await until(()=>c.validation(run).ready&&c.validation(run).revision>rev);
 const w=await c.waitRoot(parent,run.id,{timeoutMs:5000});
 assert.equal(w.waitReason,'validation-required','a landed replacement must be delivered to a late wait');
 c.acceptValidation(run,c.validation(run).revision);
 await run.completion;
 await c.close();
});