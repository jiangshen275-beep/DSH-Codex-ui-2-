import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostExecutor } from '../src/flash-channel.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture({reason='completed',dispose}={}){
  const state={cancelled:0,disposed:0,guards:[]};
  const parent={id:'session-speed-parent',ctx:{get(){}},session:{header:{},seq:0}};
  const ctx={agents:{async create(options){
    const agent={id:options.sessionId,session:{seq:0,snapshotEvents(){return[{type:'turn/end',data:{reason:{kind:reason}}}];}},cancel(){state.cancelled++;},followup(){},async whenIdle(){}};
    const childCtx={get(name){return name==='workingDirectory'?{async set(){}}:{presentAs(){},guard(f){state.guards.push(f);},restrict(){},register(){}};},on(){}};
    await options.setup(childCtx,agent);
    return {agent,async dispose(){state.disposed++;await dispose?.();}};
  }},workingDirectory:{get(){return 'D:/dsh-codex-ui';}}};
  const deps={captureDelegatedPolicyOverrides:()=>({}),resolveChildDepth:()=>1,resolveChildAgentOptions:()=>({}),appendDelegatedPolicyOverrides(){},async applyChildComposition(){},createUserMessage:x=>x,finalAssistantOutput:()=>[{type:'text',text:'verified output'}]};
  return {state,parent,execute:createHostExecutor(ctx,deps)};
}
const job=extra=>({kind:'executor',role:'C',sessionId:'session-cgflash-speed-test-C',objective:'test',branch:{task:'work',write_paths:[]},signal:new AbortController().signal,...extra});
test('speed executor returns completed result without waiting for blocked disposal',async()=>{
  const g=gate(),tracked=[];const f=fixture({dispose:()=>g.promise});
  try{
    const output=await f.execute(job({deferCleanup:true,onCleanup:p=>tracked.push(p)}),f.parent);
    assert.equal(output,'verified output');assert.equal(tracked.length,1);assert.equal(f.state.disposed,1);
    let done=false;tracked[0].then(()=>done=true);await new Promise(r=>setImmediate(r));assert.equal(done,false);
  }finally{g.resolve();await Promise.all(tracked);}
});
test('fast executor still waits for disposal',async()=>{
  const g=gate(),f=fixture({dispose:()=>g.promise});let returned=false;
  const promise=f.execute(job(),f.parent).then(x=>{returned=true;return x;});
  await new Promise(r=>setImmediate(r));assert.equal(returned,false);assert.equal(f.state.disposed,1);
  g.resolve();assert.equal(await promise,'verified output');
});
test('asynchronous cleanup failure is observed rather than masking valid model output',async()=>{
  const tracked=[],f=fixture({dispose:async()=>{throw Error('dispose failure');}}),j=job({deferCleanup:true,onCleanup:p=>tracked.push(p)});
  assert.equal(await f.execute(j,f.parent),'verified output');await Promise.allSettled(tracked);assert.match(j.cleanupError,/dispose failure/);
});
test('speed path rejects truncation even when cleanup is asynchronous',async()=>{
  const tracked=[],f=fixture({reason:'max-tokens'});
  await assert.rejects(f.execute(job({deferCleanup:true,onCleanup:p=>tracked.push(p)}),f.parent),/max-tokens/);
  await Promise.all(tracked);assert.equal(f.state.disposed,1);
});