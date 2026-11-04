import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {runFlash,validateFlashTask} from '../src/flash-core.js';
const task=()=>({objective:'test',branches:[{task:'A',write_paths:[]},{task:'B',write_paths:[]}]});
test('ownership rejects two aliases of the same real directory',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'flash-owner-'));
 try {const target=path.join(root,'target'),alias=path.join(root,'alias');mkdirSync(target);symlinkSync(target,alias,process.platform==='win32'?'junction':'dir');const t=task();t.branches[0].write_paths=[target];t.branches[1].write_paths=[path.join(alias,'new')];assert.throws(()=>validateFlashTask(t),/overlapping/);}finally{rmSync(root,{recursive:true,force:true})}
});
test('journal failure aborts and drains other branch before rejecting',async()=>{
 let startedB,finishedB=false;const ready=new Promise(r=>startedB=r);const original=Error('journal unavailable');
 const p=runFlash(task(),{record:async e=>{if(e.event==='branch-end'&&e.role==='A')throw original;if(e.event==='failed')throw Error('secondary log failure')},execute:async job=>{
 if(job.role==='C')throw Error('C must never start');
 if(job.role==='A'){await ready;return 'A'}
 startedB();try{await new Promise((_,reject)=>{const stop=()=>reject(job.signal.reason);if(job.signal.aborted)stop();else job.signal.addEventListener('abort',stop,{once:true})})}finally{await new Promise(r=>setTimeout(r,20));finishedB=true}
 }});
 await assert.rejects(p,error=>error===original);assert.equal(finishedB,true);
});
test('failure before agent creation creates no execution and retains original error',async()=>{
 const original=Error('initial journal unavailable');let calls=0;
 await assert.rejects(runFlash(task(),{execute:async()=>{calls++},record:async()=>{throw original}}),e=>e===original);assert.equal(calls,0);
});