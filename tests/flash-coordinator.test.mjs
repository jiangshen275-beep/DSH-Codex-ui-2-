import test from 'node:test';
import assert from 'node:assert/strict';
import {FlashCoordinator} from '../src/flash-coordinator.js';
import {validateFlashTask} from '../src/flash-core.js';
import {flashToolDenial} from '../src/flash-policy.js';
import {createHostExecutor,flashPrompt} from '../src/flash-channel.js';
const tick=()=>new Promise(r=>setImmediate(r));
const task=(n=2)=>({objective:'cooperate',branches:Array.from({length:n},(_,i)=>({task:`work${i}`,write_paths:[]}))});
const until=async f=>{for(let i=0;i<100;i++){if(f())return;await tick();}throw Error('test did not settle');};
function harness(execute,notify=async()=>{}){return new FlashCoordinator({execute,notify});}
test('2 to 4 branches accepted; 1 and 5 rejected',()=>{for(const n of [2,3,4])validateFlashTask(task(n));for(const n of [1,5])assert.throws(()=>validateFlashTask(task(n)),/two to four/);});
test('start returns before work ends; four executors and no tool summary',async()=>{let release;const gate=new Promise(r=>release=r),seen=[];const parent={};const c=harness(async job=>{seen.push(job);if(job.kind==='executor')await gate;return job.role;});const view=c.start(parent,task(4));assert.equal(view.active,4);await until(()=>seen.length===4);assert.deepEqual(seen.map(x=>x.role),['A','B','C','D']);release();await until(()=>c.require(parent,view.runId).status==='completed');assert.equal(seen.at(-1).kind,'summary');assert.equal(c.parents.size,0);});
test('help reaches parent while sibling executes and reply resumes worker',async()=>{const parent={},notes=[];let jobA,sibling=false;const c=harness(async job=>{if(job.kind==='summary')return 'summary';if(job.role==='A'){jobA=job;const r=await job.report('help','need interface',true);assert.equal(r.reply,'use v2');return 'A';}sibling=true;return 'B';},async(_p,x)=>notes.push(x));const view=c.start(parent,task());await until(()=>notes.some(x=>x.kind==='help'));assert.equal(sibling,true);assert.equal(jobA.state,'waiting-help');assert.equal(c.reply(parent,view.runId,jobA.sessionId,'use v2').resumed,true);await until(()=>c.require(parent,view.runId).status==='completed');assert(notes.some(x=>x.kind==='run-complete'));});
test('parent can append work; max four active and ownership collision denied',async()=>{let release;const gate=new Promise(r=>release=r);const parent={};const c=harness(async j=>{if(j.kind==='executor')await gate;return 'done';});const v=c.start(parent,task());assert.equal(c.add(parent,v.runId,task().branches).active,4);assert.throws(()=>c.add(parent,v.runId,[{task:'fifth',write_paths:[]}]),/four/);release();await until(()=>c.require(parent,v.runId).status==='completed');const t=task();t.branches[0].write_paths=['D:/dsh-codex-ui/owned'];const v2=c.start(parent,t);assert.throws(()=>c.add(parent,v2.runId,[{task:'collision',write_paths:['D:/dsh-codex-ui/owned/a']}]),/overlapping/);await c.cancel(parent,v2.runId);});
test('parent authorization and duplicate active run enforced',async()=>{const p={},other={};const c=harness(async j=>{await new Promise((_,reject)=>{if(j.signal.aborted)reject(j.signal.reason);else j.signal.addEventListener('abort',()=>reject(j.signal.reason),{once:true});});});const v=c.start(p,task());assert.throws(()=>c.start(p,task()),/active/);assert.throws(()=>c.require(other,v.runId),/owned/);await c.cancel(p,v.runId);assert.equal(c.parents.size,0);});
test('cancel releases waiting help and drains all workers',async()=>{const p={};let cleaned=0;const c=harness(async j=>{try{return await j.report('help','blocked',true);}finally{await tick();cleaned++;}});const v=c.start(p,task());await until(()=>[...c.require(p,v.runId).jobs.values()].every(x=>x.state==='waiting-help'));const result=await c.cancel(p,v.runId);assert.equal(cleaned,2);assert.equal(result.status,'cancelled');assert.equal(result.active,0);});
test('notification failure does not duplicate successful branch results',async()=>{const p={};const c=harness(async()=> 'done',async()=>{throw Error('parent delivery failed');});const v=c.start(p,task());await until(()=>!c.parents.has(p));const run=c.require(p,v.runId);assert.equal(run.results.length,2);assert.equal(run.results.every(x=>x.ok),true);assert.match(run.error,/delivery failed/);});
test('close aborts workers and rejects new starts',async()=>{const p={};const c=harness(async j=>{await new Promise((_,reject)=>{if(j.signal.aborted)reject(j.signal.reason);else j.signal.addEventListener('abort',()=>reject(j.signal.reason),{once:true});});});c.start(p,task());await c.close();assert.equal(c.parents.size,0);assert.throws(()=>c.start(p,task()),/closing/);});
test('third executor is writable; summary is tool-free; report capability scoped',()=>{const cwd='D:/dsh-codex-ui';assert.equal(flashToolDenial({kind:'executor',role:'C',cwd,branch:{write_paths:[cwd]}},{name:'write',arguments:{file_path:cwd+'/collab-new.txt'}}),undefined);for(const name of ['read','edit','flash_report'])assert.equal(typeof flashToolDenial({kind:'summary',role:'S'},{name}),'string');assert.equal(flashToolDenial({kind:'executor',role:'A',report:()=>{}},{name:'flash_report'}),undefined);assert.equal(typeof flashToolDenial({kind:'executor',role:'A'},{name:'flash_report'}),'string');});
test('repeated rounds release parent slot and preserve history',async()=>{const p={};const c=harness(async()=> 'done');const a=c.start(p,task());await until(()=>!c.parents.has(p));const b=c.start(p,task(3));assert.notEqual(a.runId,b.runId);await until(()=>!c.parents.has(p));assert.equal(c.require(p,a.runId).results.length,2);assert.equal(c.require(p,b.runId).results.length,3);});

for(const fails of [false,true])test(`terminal notification can synchronously replace a worker at capacity (failed=${fails})`,async()=>{
  const p={},gates=new Map(),initial=task(4);initial.branches[0].write_paths=['D:/dsh-codex-ui/reusable.txt'];let running=0,peak=0,summaries=0,added=false,replacement;
  const c=harness(async j=>{
    if(j.kind==='summary'){summaries++;return 'summary';}
    running++;peak=Math.max(peak,running);
    try{await new Promise(r=>gates.set(j.role,r));if(fails&&j.role==='A')throw Error('worker failed');return j.role;}
    finally{running--;}
  },(_p,n)=>{
    if(n.agentId?.endsWith('-A')&&n.kind===(fails?'branch-failed':'branch-complete')){
      const before=c.view(c.require(p,n.runId));assert.equal(before.active,3);assert.equal(before.capacity,1);assert.equal(n.remaining,3);assert.equal(n.active,3);assert.equal(n.capacity,1);
      replacement=c.add(p,n.runId,[{task:'replacement',write_paths:['D:/dsh-codex-ui/reusable.txt']}]);added=true;assert.equal(replacement.active,4);
      assert.throws(()=>c.add(p,n.runId,[{task:'fifth',write_paths:[]}]),/four/);
    }
  });
  const v=c.start(p,initial);await until(()=>gates.size===4);gates.get('A')();
  await until(()=>added&&gates.has('W5'));assert.equal(running,4);assert.equal(peak,4);
  for(const [role,release] of gates)if(role!=='A')release();
  await until(()=>!c.parents.has(p));const run=c.require(p,v.runId);
  assert.equal(run.results.length,5);assert.equal(summaries,1);assert.equal(run.status,fails?'partial':'completed');assert.equal(c.view(run).active,0);assert.equal(run.notificationError,undefined);
});

test('last completion notification can append work before the single summary',async()=>{
  const p={};let appended=false,summaries=0;const executed=[];
  const c=harness(async j=>{if(j.kind==='summary'){summaries++;assert.equal(executed.length,3);return 'summary';}executed.push(j.role);return j.role;},(_p,n)=>{
    if(n.kind==='branch-complete'&&n.remaining===0&&!appended){appended=true;c.add(p,n.runId,[{task:'last followup',write_paths:[]}]);}
  });
  const v=c.start(p,task());await until(()=>!c.parents.has(p));assert.equal(appended,true);assert.equal(summaries,1);assert.equal(c.require(p,v.runId).results.length,3);
});

test('latest artifact survives max-tokens failure in result, notification and view without retry',async()=>{
  const p={},notes=[],calls=new Map();let failedJob,summaryBranches;
  const t=task();t.branches[0]={task:'write one deliverable',write_paths:['D:/dsh-codex-ui/checkpoint.txt']};
  const c=new FlashCoordinator({now:()=>1234,execute:async j=>{
    if(j.kind==='summary'){summaryBranches=j.branches;return 'partial summary';}
    calls.set(j.role,(calls.get(j.role)??0)+1);
    if(j.role==='A'){failedJob=j;await j.report('artifact','old checkpoint');await j.report('artifact','file: checkpoint.txt; completed: written; remaining: tests; unverified: build');throw Error('闪电A未正常完成：max-tokens');}
    return 'B';
  },notify:async(_p,n)=>notes.push(n)});
  const v=c.start(p,t);await until(()=>!c.parents.has(p));const run=c.require(p,v.runId),result=run.results.find(x=>x.role==='A');
  assert.equal(run.status,'partial');assert.equal(result.ok,false);assert.match(result.error,/max-tokens/);assert.equal(failedJob.state,'failed');assert.equal(calls.get('A'),1);assert.equal(run.jobs.size,2);
  assert.deepEqual(result.checkpoint,{message:'file: checkpoint.txt; completed: written; remaining: tests; unverified: build',at:new Date(1234).toISOString()});assert.deepEqual(result.checkpoint,failedJob.latestArtifact);
  assert.equal(result.branch.task,t.branches[0].task);assert.deepEqual(result.branch.write_paths,failedJob.branch.write_paths);
  const notification=notes.find(x=>x.kind==='branch-failed');assert.deepEqual(notification.checkpoint,result.checkpoint);assert.deepEqual(notification.branch,result.branch);
  const branch=c.view(run).branches.find(x=>x.role==='A');assert.deepEqual(branch.checkpoint,result.checkpoint);assert.deepEqual(branch.branch,result.branch);assert.deepEqual(summaryBranches.find(x=>x.role==='A'),result);
});

test('cancel and closeParent await terminal notification cleanup after slot release',async()=>{
  const p={};let release,entered=false,summaries=0;
  const gate=new Promise(r=>release=r);
  const c=harness(async j=>{if(j.kind==='summary')summaries++;return 'done';},async(_p,n)=>{if(n.kind==='branch-complete'&&!entered){entered=true;await gate;}});
  const v=c.start(p,task());await until(()=>entered&&c.view(c.require(p,v.runId)).active===0);
  let drained=false;const closing=c.closeParent(p).then(()=>drained=true);await tick();assert.equal(drained,false);assert.equal(c.parents.has(p),true);
  release();await closing;const run=c.require(p,v.runId);assert.equal(run.status,'cancelled');assert.equal(run.inflight.size,0);assert.equal(c.parents.size,0);assert.equal(summaries,0);
});

test('executor prompt specifies incremental artifacts and read-before-resume without changing summary role',()=>{
  const prompt=flashPrompt({kind:'executor',role:'B',objective:'small change',branch:{task:'implement',write_paths:[]}});
  for(const text of ['一个可验收的小产物','写入产物后立即用artifact','文件位置、已完成项、剩余项、未验证项','先读现存文件及checkpoint','只补剩余工作'])assert(prompt.includes(text));
  const summary=flashPrompt({kind:'summary',role:'S',objective:'summarize',branches:[]});assert.match(summary,/禁止调用任何工具/);assert.equal(summary.includes('写入产物后立即用artifact'),false);
});

test('progress is journal-only; same-job artifact dedup and terminal references preserve full results',async()=>{
  const p={},notes=[],records=[];let summaryJob;
  const c=new FlashCoordinator({record:async e=>records.push(e),notify:async(_p,n)=>notes.push(n),execute:async j=>{
    if(j.kind==='summary'){summaryJob=j;return 'new unified conclusion';}
    await j.report('progress','checkpoint reached');
    await j.report('artifact','same full text');await j.report('artifact','same full text');
    return 'same full text';
  }});
  const v=c.start(p,task());await until(()=>!c.parents.has(p));const run=c.require(p,v.runId),view=c.view(run);
  assert.equal(records.filter(x=>x.event==='progress').length,2);assert.equal(notes.some(x=>x.kind==='progress'),false);
  const artifacts=notes.filter(x=>x.kind==='artifact');assert.equal(artifacts.length,2);assert.notEqual(artifacts[0].agentId,artifacts[1].agentId);
  const terminals=notes.filter(x=>x.kind==='branch-complete');assert.equal(terminals.length,2);
  for(const n of terminals){assert.equal(Object.hasOwn(n,'output'),false);assert.deepEqual(n.outputRef,{kind:'artifact',agentId:n.agentId,artifactId:artifacts.find(x=>x.agentId===n.agentId).artifactId});assert.equal(n.active,n.remaining);assert.equal(n.capacity,4-n.active);}
  assert.equal(view.results.every(x=>x.output==='same full text'),true);assert.equal(view.deliveredFacts.length,4);
  assert.deepEqual(summaryJob.branches,view.results);assert.deepEqual(summaryJob.deliveredFacts,view.deliveredFacts);
  assert.equal(view.summary,'new unified conclusion');const complete=notes.find(x=>x.kind==='run-complete');assert.equal(complete.summaryAvailable,true);assert.equal(Object.hasOwn(complete,'summary'),false);
});

test('artifact equality is exact and concurrent same-job duplicates share delivery',async()=>{
  const p={},notes=[];let release,entered=false;const gate=new Promise(r=>release=r);
  const c=harness(async j=>{
    if(j.kind==='summary')return '';
    if(j.role==='B')return 'B';
    await Promise.all([j.report('artifact','exact'),j.report('artifact','exact')]);
    await j.report('artifact','exact ');return 'exact ';
  },async(_p,n)=>{notes.push(n);if(n.kind==='artifact'&&n.message==='exact'){entered=true;await gate;}});
  const v=c.start(p,task());await until(()=>entered);await tick();assert.equal(notes.filter(x=>x.kind==='artifact').length,1);release();await until(()=>!c.parents.has(p));
  assert.deepEqual(notes.filter(x=>x.kind==='artifact').map(x=>x.message),['exact','exact ']);
  assert.equal(notes.find(x=>x.kind==='run-complete').summaryAvailable,false);assert.equal(c.require(p,v.runId).summary,'');
});

test('failed artifact delivery remains retryable and terminal failure retains undispatched result for S',async()=>{
  const p={},notes=[];let attempts=0,summaryJob;
  const c=harness(async j=>{
    if(j.kind==='summary'){summaryJob=j;return 'recovered pending delivery';}
    if(j.role==='B')return 'B';
    await assert.rejects(j.report('artifact','retry body'),/artifact delivery failed/);
    assert.equal(j.deliveredArtifacts.size,0);await j.report('artifact','retry body');
    assert.equal(j.deliveredArtifacts.size,1);return 'different final body';
  },async(_p,n)=>{
    if(n.kind==='artifact'&&++attempts===1)throw Error('artifact delivery failed');
    if(n.kind==='branch-complete'&&n.role==='A')throw Error('terminal delivery failed');
    notes.push(n);
  });
  const v=c.start(p,task());await until(()=>!c.parents.has(p));const run=c.require(p,v.runId);
  assert.equal(attempts,2);assert.equal(run.status,'completed');assert.match(run.notificationError,/terminal delivery failed/);
  assert.equal(summaryJob.branches.find(x=>x.role==='A').output,'different final body');
  assert.equal(summaryJob.deliveredFacts.some(x=>x.role==='A'&&x.kind==='branch-complete'),false);
  assert.equal(summaryJob.deliveredFacts.filter(x=>x.role==='A'&&x.kind==='artifact').length,1);
  assert.equal(run.results.length,2);assert.equal(notes.filter(x=>x.kind==='artifact').length,1);
});

test('undelivered artifact cannot suppress terminal body or the summary input',async()=>{
  const p={},notes=[];let summaryJob;
  const c=harness(async j=>{
    if(j.kind==='summary'){summaryJob=j;return 'delivery recovery';}
    if(j.role==='B')return 'B';
    await assert.rejects(j.report('artifact','pending body'),/offline/);return 'pending body';
  },async(_p,n)=>{if(n.kind==='artifact'||(n.kind==='branch-complete'&&n.role==='A')){if(n.kind==='branch-complete')notes.push(n);throw Error('offline');}notes.push(n);});
  const v=c.start(p,task());await until(()=>!c.parents.has(p));const run=c.require(p,v.runId);
  const terminal=notes.find(x=>x.kind==='branch-complete'&&x.role==='A');assert.equal(terminal.output,'pending body');assert.equal(Object.hasOwn(terminal,'outputRef'),false);
  assert.equal(summaryJob.branches.find(x=>x.role==='A').output,'pending body');assert.equal(summaryJob.deliveredFacts.some(x=>x.role==='A'),false);
  assert.equal(run.results.find(x=>x.role==='A').output,'pending body');assert.equal(c.view(run).branches.find(x=>x.role==='A').checkpoint.message,'pending body');
});

test('repeated help remains unthrottled and waiting help can repeatedly resume',async()=>{
  const p={},notes=[];let a;
  const c=harness(async j=>{
    if(j.kind==='summary')return '';
    if(j.role==='B')return 'B';a=j;
    for(let i=0;i<2;i++){const answer=await j.report('help','same question',true);assert.equal(answer.reply,`reply ${i}`);}
    return 'A';
  },async(_p,n)=>notes.push(n));
  const v=c.start(p,task());
  for(let i=0;i<2;i++){await until(()=>notes.filter(x=>x.kind==='help').length===i+1);assert.equal(a.state,'waiting-help');c.reply(p,v.runId,a.sessionId,`reply ${i}`);}
  await until(()=>!c.parents.has(p));assert.equal(notes.filter(x=>x.kind==='help').length,2);
});

for(const fails of [false,true])test(`single-final gate keeps early A internal until late B and synchronously added C finish (failed=${fails})`,async()=>{
  const p={},notes=[],gates=new Map(),summaryCalls=[];let added=false,releaseSummary;
  const summaryGate=new Promise(r=>releaseSummary=r),longOutput='full result '.repeat(1000);
  const c=harness(async j=>{
    if(j.kind==='summary'){summaryCalls.push(j);await summaryGate;return 'one unified report';}
    await new Promise(r=>gates.set(j.role,r));
    await j.report('artifact',`${j.role} checkpoint`);
    if(j.role==='B'&&fails)throw Error('late B failed');
    return j.role==='A'?longOutput:j.role;
  },(_p,n)=>{
    notes.push(n);
    if(n.kind==='branch-complete'&&n.role==='A'){
      assert.equal(c.view(c.require(p,n.runId)).reporting.userSummaryAllowed,false);
      c.add(p,n.runId,[{task:'continue from early A',write_paths:[]}]);added=true;
    }
  });
  const v=c.start(p,task());
  assert.deepEqual(v.reporting,{mode:'single-final',phase:'collecting',userSummaryAllowed:false,deliveredFactsArePublic:false});
  await until(()=>gates.size===2);gates.get('A')();await until(()=>added&&gates.has('C'));
  assert.equal(summaryCalls.length,0);assert.equal(notes.some(n=>n.kind==='run-complete'),false);
  assert.equal(c.view(c.require(p,v.runId)).reporting.phase,'collecting');
  gates.get('B')();await until(()=>notes.some(n=>n.role==='B'&&n.kind===(fails?'branch-failed':'branch-complete')));
  assert.equal(summaryCalls.length,0);assert.equal(notes.some(n=>n.kind==='run-complete'),false);
  gates.get('C')();await until(()=>summaryCalls.length===1);
  const collecting=c.view(c.require(p,v.runId)),s=summaryCalls[0];
  assert.equal(collecting.reporting.userSummaryAllowed,false);assert.equal(collecting.reporting.phase,'collecting');
  assert.equal(s.reportingMode,'single-final');assert.deepEqual(s.reporting,collecting.reporting);
  assert.deepEqual(s.branches,collecting.results);assert.equal(s.branches.find(r=>r.role==='A').output,longOutput);
  assert.deepEqual(s.deliveredFacts,collecting.deliveredFacts);
  assert.equal(s.branches.find(r=>r.role==='B').ok,!fails);
  if(fails)assert.equal(s.branches.find(r=>r.role==='B').checkpoint.message,'B checkpoint');
  assert.equal(notes.filter(n=>['artifact','branch-complete','branch-failed'].includes(n.kind)).length,6);
  for(const n of notes){assert.equal(n.internalOnly,true);assert.equal(n.reporting.phase,'collecting');assert.equal(n.reporting.userSummaryAllowed,false);assert.equal(n.reporting.deliveredFactsArePublic,false);}
  releaseSummary();await until(()=>!c.parents.has(p));
  const done=c.view(c.require(p,v.runId)),finals=notes.filter(n=>n.kind==='run-complete');
  assert.equal(summaryCalls.length,1);assert.equal(finals.length,1);assert.equal(notes.at(-1),finals[0]);
  assert.equal(done.status,fails?'partial':'completed');assert.equal(done.summary,'one unified report');
  assert.equal(done.reporting.phase,'ready');assert.equal(done.reporting.userSummaryAllowed,true);
  assert.equal(finals[0].singleReport,true);assert.deepEqual(finals[0].reporting,done.reporting);
  // Previously returned views and delivered facts must retain their collecting snapshot.
  assert.equal(v.reporting.phase,'collecting');assert.equal(collecting.reporting.phase,'collecting');
  assert.equal(done.deliveredFacts.every(n=>n.internalOnly&&n.reporting.phase==='collecting'),true);
});

test('summary failure opens one final failure report after internal branch facts',async()=>{
  const p={},notes=[];let summaries=0;
  const c=harness(async j=>{if(j.kind==='summary'){summaries++;throw Error('summary failed');}return j.role;},(_p,n)=>notes.push(n));
  const v=c.start(p,task());await until(()=>!c.parents.has(p));const view=c.view(c.require(p,v.runId));
  assert.equal(summaries,1);assert.equal(view.status,'failed');assert.equal(view.results.length,2);
  assert.equal(notes.filter(n=>n.kind==='run-complete').length,0);
  const failures=notes.filter(n=>n.kind==='run-failed');assert.equal(failures.length,1);
  assert.equal(failures[0].singleReport,true);assert.equal(failures[0].reporting.phase,'ready');
  assert.equal(failures[0].reporting.userSummaryAllowed,true);assert.match(failures[0].error,/summary failed/);
  assert.equal(notes.filter(n=>n.kind==='branch-complete').every(n=>n.internalOnly&&n.reporting.phase==='collecting'),true);
});

test('host executor still rejects max-tokens output and disposes once',async()=>{
  let disposed=0,cancelled=0,created=0;
  const parent={id:'parent',session:{header:{},seq:0},ctx:{get(){}}};
  const tools={presentAs(){},guard(){},restrict(){}};
  const ctx={workingDirectory:{get:()=> 'D:/code'},agents:{async create(options){
    created++;const child={session:{seq:0,snapshotEvents:()=>[{type:'turn/end',data:{reason:{kind:'max-tokens'}}}]},cancel(){cancelled++;},followup(){},async whenIdle(){}};
    await options.setup({get:name=>name==='tools'?tools:{async set(){}},on(){}},child);
    return {agent:child,async dispose(){disposed++;}};
  }}};
  const deps={captureDelegatedPolicyOverrides:()=>({}),resolveChildDepth:()=>1,resolveChildAgentOptions:()=>({}),appendDelegatedPolicyOverrides(){},applyChildComposition(){},createUserMessage:x=>x,finalAssistantOutput:()=>[{type:'text',text:'partial output'}]};
  await assert.rejects(createHostExecutor(ctx,deps)({kind:'executor',role:'A',sessionId:'max-tokens-test',objective:'check',branch:{task:'write',write_paths:[]},signal:new AbortController().signal},parent),/max-tokens/);
  assert.equal(created,1);assert.equal(disposed,1);assert.equal(cancelled,1);
});