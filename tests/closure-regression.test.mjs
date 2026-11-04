import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.CLOSURE_BASE ? new URL(process.env.CLOSURE_BASE.replace(/\/$/,'')+'/') : new URL('../src/',import.meta.url);
const {FlashCoordinator}=await import(new URL('flash-coordinator.js',base));
const {SuperfastCoordinator}=await import(new URL('superfast-coordinator.js',base));
const parent={id:'session-closure-parent'},b=(task='work',paths=[])=>({task,write_paths:paths});
const task={objective:'closure',branches:[b('A'),b('B')]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const ready=async fn=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setImmediate(r));}throw Error('did not settle')};
function fast(execute){return new FlashCoordinator({notify:async()=>{},execute:async job=>job.kind==='summary'?'all results':execute(job)});}
async function collect(job){let cursor=0;for(;;){const e=await job.control({action:'wait',cursor});cursor=e.cursor;for(const h of e.pendingHelp)await job.control({action:'reply',agent_id:h.agentId,message:'local reply'});if(e.done)return e.results;}}
function tree({leaf=async job=>'ok '+job.role}={}){return new SuperfastCoordinator({notify:async()=>{},execute:async job=>{
 job.onReady({id:job.sessionId,steer(){}});
 return leaf(job);
}});}

test('fast parent wait stays open through final summary and returns terminal',async()=>{
 const hold=deferred(),c=fast(()=>hold.promise),r=c.require(parent,c.start(parent,task).runId);
 assert.equal(typeof c.wait,'function');let returned=false;const p=c.wait(parent,r.id).then(v=>{returned=true;return v});
 await new Promise(r=>setImmediate(r));assert.equal(returned,false);hold.resolve('ready');const v=await p;assert.equal(v.status,'completed');assert.equal(v.summary,'all results');assert.equal(v.waitReason,'terminal');assert.equal(r.listeners.size,0);await c.close();
});
test('fast parent wait wakes for help then waits again through validation reply',async()=>{
 const c=fast(async job=>job.role==='A'?JSON.stringify(await job.report('help','run tests',true)):'done');const r=c.require(parent,c.start(parent,task).runId);
 assert.equal(typeof c.wait,'function');const h=await c.wait(parent,r.id);assert.equal(h.waitReason,'help');assert.equal(h.pendingHelp.length,1);
 c.reply(parent,r.id,h.pendingHelp[0].agentId,'tests failed; repair');const done=await c.wait(parent,r.id);assert.equal(done.status,'completed');assert.equal(r.listeners.size,0);await c.close();
});
test('parent wait timeout does not cancel background run and removes listener',async()=>{
 const hold=deferred(),c=fast(()=>hold.promise),r=c.require(parent,c.start(parent,task).runId);
 assert.equal(typeof c.wait,'function');const v=await c.wait(parent,r.id,{timeoutMs:5});assert.equal(v.waitReason,'timeout');assert.equal(v.status,'running');assert.equal(r.listeners.size,0);hold.resolve('ok');await c.wait(parent,r.id);await c.close();
});
test('aborted parent wait cleans listener without silently cancelling work',async()=>{
 const hold=deferred(),c=fast(()=>hold.promise),r=c.require(parent,c.start(parent,task).runId),abort=new AbortController();assert.equal(typeof c.wait,'function');const p=c.wait(parent,r.id,{signal:abort.signal});abort.abort(Error('user stop'));await assert.rejects(p,/user stop/);assert.equal(r.listeners.size,0);hold.resolve('ok');await c.wait(parent,r.id);await c.close();
});

test('wait API rejects invalid timeout and foreign ownership',async()=>{
 const hold=deferred(),c=fast(()=>hold.promise),r=c.require(parent,c.start(parent,task).runId);assert.equal(typeof c.wait,'function');assert.throws(()=>c.wait({id:parent.id},r.id),/owned/);assert.throws(()=>c.wait(parent,r.id,{timeoutMs:0}),/timeout_ms/);hold.resolve('ok');await c.wait(parent,r.id);await c.close();
});

test('terminal durations stay frozen on later fast and superfast status reads',async()=>{
 let time=1000;const c=fast(async()=>{time=2000;return 'ok';});c.now=()=>time;const r=c.require(parent,c.start(parent,task).runId);await c.wait(parent,r.id);const first=c.view(r).durationMs;time=999999;assert.equal(c.view(r).durationMs,first);await c.close();
 const s=tree();s.now=()=>time;const run=s.require(parent,s.start(parent,task).runId);await run.completion;const second=s.view(run).durationMs;time+=999999;assert.equal(s.view(run).durationMs,second);await s.close();
});
