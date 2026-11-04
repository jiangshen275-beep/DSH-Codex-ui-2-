import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the real channel body with only its integration edges mocked. No host
// packages, coordinator jobs, identity-status writes or journal writes run here.
async function loadChannel(mocks) {
  const source = await readFile(new URL('../src/flash-channel.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ createFlashContext \} from '\.\/flash-context\.js';/);
  const hostStart = source.indexOf('async function importHost(name) {');
  const hostEnd = source.indexOf("import { runFlash, isFlashSession }", hostStart);
  assert(hostStart >= 0 && hostEnd > hostStart, 'host import boundary must exist');
  let body = source.slice(0, hostStart) + 'const importHost = mocks.importHost;\n' + source.slice(hostEnd);
  const replacements = [
    ["import { runFlash, isFlashSession } from './flash-core.js';", 'const {runFlash,isFlashSession}=mocks;'],
    ["import { FlashCoordinator } from './flash-coordinator.js';", 'const {FlashCoordinator}=mocks;'],
    ["import { registerSuperfastChannel } from './superfast-channel.js';", 'const {registerSuperfastChannel}=mocks;'],
    ["import { superfastBranches } from './superfast-coordinator.js';", 'const {superfastBranches}=mocks;'],
    ["import { createFlashContext } from './flash-context.js';", 'const {createFlashContext}=mocks;'],
    ["import { observeFlashCoordinator } from './flash-inspector.js';", 'const {observeFlashCoordinator}=mocks;'],
    ["import { writeIdentityStatus } from './identity-status.js';", 'const {writeIdentityStatus}=mocks;'],
    ["import { flashToolDenial } from './flash-policy.js';", 'const {flashToolDenial}=mocks;'],
    ["export { flashToolDenial } from './flash-policy.js';", 'export {flashToolDenial};'],
  ];
  for (const [from, to] of replacements) {
    assert(body.includes(from), `mock edge missing: ${from}`);
    body = body.replace(from, to);
  }
  const key = `__flashChannelMock_${Date.now()}_${Math.random()}`;
  globalThis[key] = mocks;
  try {
    return await import('data:text/javascript;base64,' + Buffer.from(`const mocks=globalThis[${JSON.stringify(key)}];\n${body}`).toString('base64'));
  } finally {
    delete globalThis[key];
  }
}

function fixture() {
  const state = { tools:new Map(), effects:[], delivered:[], disposed:0, observed:0, closed:0 };
  const parent = {id:'session-parent', steer(){throw Error('notification must use context, not steer');}};
  const createUserMessage = message => ({...message, mocked:true});
  const sub = Object.fromEntries(['resolveChildDepth','resolveChildAgentOptions','captureDelegatedPolicyOverrides','appendDelegatedPolicyOverrides','applyChildComposition','finalAssistantOutput'].map(name => [name,()=>{}]));
  const notify = async (...args) => {state.delivered.push(args);return 'accepted';};
  const ctx = {
    agents:{get:id=>id===parent.id?parent:undefined},
    tools:{register:tool=>state.tools.set(tool.name,tool)},
    effect:factory=>{const cleanup=factory();if(cleanup)state.effects.push(cleanup);},
    on(){},
  };
  const mocks = {
    importHost:async name=>name==='@deepseek-ai/dsh-subagent'?sub:{createUserMessage},
    createFlashContext(context, options) {
      assert.equal(context,ctx);assert.equal(options.createUserMessage,createUserMessage);
      state.contextCalls=(state.contextCalls??0)+1;
      return {notify,text:()=>'',pending:()=>false,dispose(){state.disposed++;}};
    },
    FlashCoordinator:class {
      constructor(options){state.coordinator=this;this.options=options;this.parents=new Map();}
      start(owner,task){assert.equal(owner,parent);return {runId:'mock-run',objective:task.objective};}
      async close(){state.closed++;}
      async closeParent(){}
    },
    observeFlashCoordinator:()=>{state.observed++;return ()=>state.observed--;},
    registerSuperfastChannel(context, options){assert.equal(context,ctx);assert.equal(options.flashContext.notify,notify);state.superfastRegistered=true;return {assertAvailable(){}};},
    superfastBranches:branches=>branches,
    writeIdentityStatus(){},runFlash:async()=>{throw Error('legacy execution not expected');},
    isFlashSession:()=>false,flashToolDenial:()=>undefined,
  };
  return {state,parent,ctx,mocks,notify};
}

test('channel routes coordinator notifications through flash context and disposes via effect',async()=>{
  const f=fixture(),channel=await loadChannel(f.mocks);
  try {
    await channel.registerFlashChannel(f.ctx);
    assert.equal(f.state.contextCalls,1);
    assert.equal(f.state.coordinator.options.notify,f.notify);
    const event={kind:'artifact',runId:'r',message:'new evidence'};
    assert.equal(await f.state.coordinator.options.notify(f.parent,event),'accepted');
    assert.deepEqual(f.state.delivered,[[f.parent,event]]);
    assert.equal(f.state.observed,1);
    assert.deepEqual([...f.state.tools.keys()],['flash_start','flash_control','flash_run']);
    const result=await f.state.tools.get('flash_start').execute({objective:'goal',branches:[]}, {agent:f.parent,signal:new AbortController().signal});
    assert.deepEqual(JSON.parse(result),{runId:'mock-run',objective:'goal'});
    const reply=f.state.coordinator.makeMessage(f.parent.id,'reply');
    assert.equal(reply.mocked,true);
    assert.equal(reply.source.senderSessionId,f.parent.id);
  } finally {
    for(const cleanup of f.state.effects.reverse())await cleanup();
  }
  assert.equal(f.state.disposed,1);
  assert.equal(f.state.observed,0);
  assert.equal(f.state.closed,1);
});

test('S prompt receives all results and delivered facts but requests only incremental conclusions',async()=>{
  const {flashPrompt}=await loadChannel(fixture().mocks);
  const branches=[{role:'A',ok:true,output:'full branch evidence'},{role:'B',ok:false,error:'failed validation'}];
  const deliveredFacts=[{kind:'artifact',message:'already delivered',artifactId:'a1'}];
  const prompt=flashPrompt({role:'S',kind:'summary',objective:'goal',branches,deliveredFacts});
  assert.deepEqual(JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1)),{branches,deliveredFacts});
  assert.match(prompt,/只报告相对已送达事实新增的冲突、缺口与统一结论/);
  assert.match(prompt,/不复述分支细节或已送达事实/);
  assert.match(prompt,/若无新增，仅输出“无新增”/);
  assert.match(prompt,/不得捏造证据或把未验证项写成验证通过/);
  assert.match(prompt,/禁止调用任何工具/);
  assert.match(flashPrompt({role:'S',kind:'summary',branches,deliveredFacts:[]}),/这是增量整理/);
});

test('single-final S prompt unifies complete results and internally delivered artifacts',async()=>{
  const {flashPrompt}=await loadChannel(fixture().mocks);
  const deliveredFacts=[{kind:'artifact',agentId:'a',artifactId:'a1',message:'important A completion and evidence'}, {kind:'artifact',agentId:'b',artifactId:'b1',message:'B partial artifact; validation unchecked'}];
  const branches=[{role:'A',ok:true,outputRef:{kind:'artifact',agentId:'a',artifactId:'a1'}},{role:'B',ok:false,error:'failed validation',checkpoint:deliveredFacts[1]},{role:'C',ok:true,output:'无新增'}];
  const prompt=flashPrompt({role:'S',kind:'summary',objective:'goal',reportingMode:'single-final',branches,deliveredFacts});
  assert.deepEqual(JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1)),{branches,deliveredFacts});
  assert.match(prompt,/branches全部结果与deliveredFacts中的artifact合成一份完整最终结论/);
  assert.match(prompt,/保留全部完成项、实际验证、失败\/partial、冲突、剩余项、未验证项与证据位置/);
  assert.match(prompt,/deliveredFacts仅表示已内部送达父Agent，不表示已向用户公开/);
  assert.match(prompt,/不得据此省略重要成果/);
  assert.match(prompt,/outputRef须关联对应artifact恢复事实/);
  assert.match(prompt,/分支final为“无新增”也须纳入其artifact/);
  assert.match(prompt,/仅对明确此前已向用户公开的内容只补变化/);
  assert.doesNotMatch(prompt,/这是增量整理|若无新增，仅输出“无新增”/);
  assert.match(prompt,/禁止调用任何工具/);
  assert.match(prompt,/不得捏造证据或把未验证项写成验证通过/);
  const empty=flashPrompt({role:'S',kind:'summary',reportingMode:'single-final',branches});
  assert.deepEqual(JSON.parse(empty.slice(empty.lastIndexOf('\n')+1)),{branches,deliveredFacts:[]});
});

test('legacy summary without deliveredFacts still requests the full result including failures',async()=>{
  const {flashPrompt}=await loadChannel(fixture().mocks);
  const branches=[{ok:false,error:'keep this failure'}];
  for(const job of [{role:'C'},{role:'S',kind:'summary'}]){
    const prompt=flashPrompt({...job,objective:'legacy goal',branches});
    assert.match(prompt,/legacy全量整理/);
    assert.match(prompt,/保留全部完成项、失败、冲突、未验证项与证据位置/);
    assert.deepEqual(JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1)),branches);
    assert.doesNotMatch(prompt,/这是增量整理/);
  }
});

test('executor prompt keeps write scope and verification boundaries with incremental reporting',async()=>{
  const {flashPrompt}=await loadChannel(fixture().mocks);
  const branch={task:'scoped work',write_paths:['D:/work/one.js']};
  // Executor C must not be mistaken for the legacy summarizer.
  const prompt=flashPrompt({role:'C',kind:'executor',objective:'goal',materials:'evidence',branch});
  assert.match(prompt,/progress仅在新增事实、关键接口决定或真实阻塞时报告/);
  assert.match(prompt,/artifact仅包含新增或变化的事实/);
  assert.match(prompt,/最终返回相对artifact新增/);
  assert.match(prompt,/wait_for_reply:true/);
  assert.match(prompt,/仅write\/edit\/ops_replace可在声明路径内编辑/);
  assert.match(prompt,/命令执行、computer及未知写工具会被拒绝/);
  assert.match(prompt,/仅报告实际改动与实际执行的验证，保留失败和未验证项/);
  assert.match(prompt,/材料：evidence/);
  assert(prompt.endsWith(JSON.stringify(branch)));
});
