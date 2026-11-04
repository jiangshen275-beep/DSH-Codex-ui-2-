import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlash, validateFlashTask, isFlashSession } from '../src/flash-core.js';
import { createHostExecutor, flashPrompt, flashToolDenial } from '../src/flash-channel.js';
const task = () => ({objective:'check',branches:[{task:'A',write_paths:[]},{task:'B',write_paths:[]}]});
test('A/B genuinely start together; C receives both settled outputs',async()=>{
 const order=[];let release;const barrier=new Promise(r=>release=r);
 const result=await runFlash(task(),{execute:async job=>{order.push(job.role);if(job.role==='A'){await barrier;return 'alpha';}if(job.role==='B'){release();return 'beta';}assert.deepEqual(job.branches.map(x=>x.output),['alpha','beta']);return 'summary';}});
 assert.deepEqual(order,['A','B','C']);assert.equal(result.summary,'summary');assert.equal(result.ok,true);
});
test('failed branch is preserved for C and run is partial',async()=>{
 const result=await runFlash(task(),{execute:async job=>{if(job.role==='B')throw Error('branch failed');if(job.role==='C'){assert.equal(job.branches[1].ok,false);assert.equal(job.branches[1].error,'branch failed');}return 'output';}});assert.equal(result.ok,false);
});
test('cancel propagates to both branches and never starts C',async()=>{
 const controller=new AbortController();const seen=[];
 const promise=runFlash(task(),{signal:controller.signal,execute:async job=>{seen.push(job.role);if(seen.length===2)queueMicrotask(()=>controller.abort(Error('stop')));await new Promise((_,reject)=>job.signal.addEventListener('abort',()=>reject(job.signal.reason),{once:true}));}});
 await assert.rejects(promise,/stop/);assert.deepEqual(seen,['A','B']);
});
test('already cancelled request creates no agent',async()=>{const c=new AbortController();c.abort(Error('stopped'));let calls=0;await assert.rejects(runFlash(task(),{signal:c.signal,execute:async()=>calls++}),/stopped/);assert.equal(calls,0);});
test('same file and parent directory ownership conflicts rejected',()=>{const t=task();t.branches[0].write_paths=['D:/code/src'];t.branches[1].write_paths=['d:\\code\\src\\a.js'];assert.throws(()=>validateFlashTask(t),/overlapping/);});
test('exactly two meaningful branches required',()=>{assert.throws(()=>validateFlashTask({objective:'x',branches:[]}),/two to four/);});
test('only dedicated prefix is hidden',()=>{assert.equal(isFlashSession('session-cgflash-abc-A'),true);assert.equal(isFlashSession({id:'session-ordinary-child'}),false);});
test('fresh prompt passes necessary materials and C preserves failures',()=>{assert.match(flashPrompt({role:'A',objective:'x',materials:'evidence',branch:{task:'read'}}),/evidence/);assert.match(flashPrompt({role:'C',objective:'x',branches:[{ok:false,error:'failure'}]}),/failure/);});
function fixture(){
 const state={created:[],disposed:0,guards:[],failure:undefined};const parent={id:'session-parent',ctx:{get(){}},session:{header:{},seq:0}};
 const ctx={agents:{create:async options=>{state.created.push(options);const child={id:options.sessionId,session:{seq:0,append(){},snapshotEvents(){return [{type:'turn/end',data:{reason:{kind:state.reason ?? 'completed'}}}];}},cancel(){},followup(){},async whenIdle(){}};const services={workingDirectory:{async set(_a,cwd){assert.equal(cwd,'D:/code');}},tools:{restrict(filter){assert.deepEqual(filter,{allow:[]});},presentAs(mode){assert.equal(mode,'native');state.presentation=mode;},guard(g){state.guards.push(g);}}};const childCtx={get(name){return services[name];},on(){},get workingDirectory(){throw Error('cannot get property workingDirectory without inject');},get tools(){throw Error('cannot get property tools without inject');}};await options.setup(childCtx,child);return {agent:child,async dispose(){state.disposed++;}};}},workingDirectory:{get(session){assert.equal(session,parent.session);return 'D:/code';}}};
 const deps={captureDelegatedPolicyOverrides:()=>({}),resolveChildDepth:()=>1,childSessionMeta:()=>({origin:'subagent',isSeeded:false}),resolveChildAgentOptions:()=>({}),appendDelegatedPolicyOverrides(){},applyChildComposition(){},createUserMessage:x=>x,finalAssistantOutput:()=>[{type:'text',text:'done'}]};
 return {state,parent,ctx,deps};
}
test('host adapter creates fresh no-seed agent, guards delegation and releases handle',async()=>{const f=fixture();const execute=createHostExecutor(f.ctx,f.deps);const result=await execute({role:'A',sessionId:'session-cgflash-test-A',objective:'x',branch:{task:'read'},signal:new AbortController().signal},f.parent);assert.equal(result,'done');assert.equal(f.state.created[0].seed,undefined);assert.equal(f.state.created[0].meta.isSeeded,false);assert.equal(f.state.disposed,1);assert.equal(typeof f.state.guards[0]({name:'subagent'}),'string');assert.equal(f.state.guards[0]({name:'read'}),undefined);});
test('host adapter releases handle when output is empty',async()=>{const f=fixture();f.deps.finalAssistantOutput=()=>[];await assert.rejects(createHostExecutor(f.ctx,f.deps)({role:'C',sessionId:'session-cgflash-test-C',objective:'x',branches:[],signal:new AbortController().signal},f.parent),/最终文本/);assert.equal(f.state.disposed,1);});
test('host adapter rejects truncated output and still disposes',async()=>{const f=fixture();f.state.reason='max-tokens';await assert.rejects(createHostExecutor(f.ctx,f.deps)({role:'A',sessionId:'session-cgflash-test-A',objective:'x',branch:{task:'read'},signal:new AbortController().signal},f.parent),/max-tokens/);assert.equal(f.state.disposed,1);});

test('ownership requires absolute paths and resolves dot segments',()=>{const t=task();t.branches[0].write_paths=['src/a'];assert.throws(()=>validateFlashTask(t),/absolute/);t.branches[0].write_paths=['D:/code/src/../shared'];t.branches[1].write_paths=['D:/code/shared/x'];assert.throws(()=>validateFlashTask(t),/overlapping/);});
test('C and read-only branches reject shell and file mutations',()=>{for(const role of ['A','C']){const j={role,branch:{write_paths:[]}};for(const name of ['write','edit','ops_bash','pwsh','computer'])assert.equal(typeof flashToolDenial(j,{name}),'string');if(role==='C')assert.equal(typeof flashToolDenial(j,{name:'read'}),'string');else assert.equal(flashToolDenial(j,{name:'read'}),undefined);}assert.equal(typeof flashToolDenial({role:'B',branch:{write_paths:['D:/code']}},{name:'edit'}),'string');});
