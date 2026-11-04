// Real-timer reproduction of the parent wait: four executors on staggered wall-clock delays,
// the parent waits immediately. No setImmediate trickery — if the timer path is broken in a
// plain Node process, this shows it; if this passes, the failure is host-specific.
import {SuperfastCoordinator} from '../src/superfast-coordinator.js';
const parent={id:'root'};
const delays={A:1200,B:2000,C:3600,D:600};
const started=Date.now();
const at=()=>((Date.now()-started)/1000).toFixed(2)+'s';
const c=new SuperfastCoordinator({
  validationRequired:true,
  notify:async()=>{},
  execute:async job=>{
    const ms=delays[job.role]??800;
    await new Promise(r=>setTimeout(r,ms));
    console.log(at(),'executor',job.role,'done');
    return 'diagnostic output '+job.role;
  },
});
const v=c.start(parent,{objective:'diagnose',branches:Object.keys(delays).map(r=>({task:'t '+r,write_paths:[]}))});
const run=c.require(parent,v.runId);
const w=await c.waitRoot(parent,run.id,{timeoutMs:20000});
console.log(at(),'wait returned',w.waitReason,JSON.stringify(w.waitStats));
console.log('validation',JSON.stringify({ready:w.validation.ready,revision:w.validation.revision,workers:w.validation.workers,required:w.validation.required,accepted:w.validation.acceptedRevision}));
console.log('jobStates',JSON.stringify(w.branches.map(b=>({role:b.role,state:b.state,hasResult:b.state==='completed'}))));
c.acceptValidation(run,c.validation(run).revision);
await run.completion;
await c.close();
const total=(Date.now()-started)/1000;
console.log(at(),'closed, total',total.toFixed(2)+'s');
if(w.waitReason==='timeout'){console.log('REPRODUCED: wait slept to timeout');process.exit(1);}
if(w.waitStats.timerChecks===0){console.log('DIAGNOSIS: no timer checks ran');process.exit(2);}
console.log('OK: woke on the last executor');
