import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForRun} from '../src/collaboration-wait.js';
const run=()=>({listeners:new Set()});
test('a transient snapshot failure does not kill the wait',async()=>{
 const r=run();let n=0;
 const p=waitForRun(r,()=>{n++;if(n===1)throw Error('boom');return {status:'running',ready:n>3};},{timeoutMs:3000,ready:v=>v.ready?'ready':null,pollMs:10});
 const w=await p;
 assert.equal(w.waitReason,'ready');
});
test('a snapshot that keeps failing rejects with the real error instead of sleeping to timeout',async()=>{
 const r=run();
 const p=waitForRun(r,()=>{throw Error('view blew up: cannot read write_paths');},{timeoutMs:30000,ready:()=>null,pollMs:10});
 const started=Date.now();
 await assert.rejects(p,/view blew up/);
 const elapsed=Date.now()-started;
 assert(elapsed<3000,`rejected after ${elapsed}ms, expected prompt failure not a 30s sleep`);
 assert.equal(r.listeners.size,0);
});
test('completion survives a snapshot that throws on the final read',async()=>{
 const r=run();let n=0;
 const p=waitForRun(r,()=>{n++;if(n>1)throw Error('late failure');return {status:'running',ready:true};},{timeoutMs:3000,ready:v=>v.ready?'ready':null,pollMs:10});
 const w=await p;
 assert.equal(w.waitReason,'ready');
});