import { waitForRun } from './collaboration-wait.js';
import { randomUUID } from 'node:crypto';
import { validateFlashTask, FLASH_PREFIX } from './flash-core.js';
import { canonicalFlashPath } from './flash-policy.js';
const messageOf = error => error instanceof Error ? error.message : String(error);
const freezeBranch = branch => ({...branch,write_paths:branch.write_paths.map(p=>canonicalFlashPath(p,process.cwd()))});
export class FlashCoordinator {
  constructor({execute,notify,record=async()=>{},now=Date.now,max=4}) { Object.assign(this,{execute,notify,record,now,max});this.runs=new Map();this.parents=new Map();this.closed=false; }
  require(parent,id) { const run=this.runs.get(id);if(!run||run.parent!==parent)throw Error('flash run is not owned by this parent');return run; }
  wait(parent,id,options={}) {const run=this.require(parent,id);return waitForRun(run,()=>this.view(run),options);}
  view(run) { return {pendingHelp:[...run.jobs.values()].filter(j=>j.waiter||j.help).map(j=>({agentId:j.sessionId,role:j.role,message:j.help?.message,waiting:!!j.waiter})),runId:run.id,status:run.status,active:run.pending.size,capacity:Math.max(0,this.max-run.pending.size),branches:[...run.jobs.values()].map(j=>({agentId:j.sessionId,role:j.role,state:j.state,write_paths:j.branch.write_paths,branch:j.branch,checkpoint:j.latestArtifact})),results:run.results.slice(),deliveredFacts:run.deliveredFacts.slice(),reporting:{...run.reporting},summary:run.summary,error:run.error,events:run.events.slice(-30),durationMs:(run.endedAt??this.now())-run.started}; }
  async emit(run,event,data={}) { const entry={runId:run.id,event,at:new Date(this.now()).toISOString(),...data};run.events.push(entry);if(run.events.length>100)run.events.shift();try{await this.record(entry);}catch(error){run.journalError=messageOf(error);} for(const check of [...run.listeners])check(); }
  async tell(run,data) { if(run.controller.signal.aborted)return false;await this.notify(run.parent,{runId:run.id,...data});return true; }
  outputDelivery(job,result) {
    const ref=result.ok&&job.deliveredArtifacts.get(result.output);
    if(!ref)return result;
    const {output,...rest}=result;return {...rest,outputRef:ref};
  }
  start(parent,task) {
    if(this.closed)throw Error('flash coordinator is closing');validateFlashTask(task,this.max);
    if(this.parents.has(parent))throw Error('this parent already has an active flash run; use flash_control add');
    const id=randomUUID(),run={id,parent,task,started:this.now(),controller:new AbortController(),jobs:new Map(),pending:new Set(),inflight:new Set(),results:[],events:[],listeners:new Set(),deliveredFacts:[],reporting:{mode:'single-final',phase:'collecting',userSummaryAllowed:false,deliveredFactsArePublic:false},status:'running',next:0,finishing:false};
    this.runs.set(id,run);this.parents.set(parent,run);
    run.timer=setTimeout(()=>{void this.cancel(parent,id).catch(()=>{});},1800000);run.timer.unref?.();
    this.launch(run,task.branches.map(freezeBranch));
    return this.view(run);
  }
  launch(run,branches) {
    run.status='running';
    for(const branch of branches){
      const n=run.next++,role=n<4?'ABCD'[n]:`W${n+1}`,sessionId=`${FLASH_PREFIX}${run.id}-${role}`;
      const job={runId:run.id,role,kind:'executor',sessionId,branch,objective:run.task.objective,materials:run.task.materials??'',constraints:run.task.constraints??'',acceptance:run.task.acceptance??'',signal:run.controller.signal,state:'starting',report:null,handle:null,waiter:null,deliveredArtifacts:new Map(),artifactDeliveries:new Map(),nextArtifact:0};
      job.report=(kind,message,wait)=>this.report(run,job,kind,message,wait);
      job.onReady=agent=>{job.handle=agent;job.state='running';};
      run.jobs.set(sessionId,job);
      const promise=Promise.resolve().then(async()=>{
        let result;
        try{
          await this.emit(run,'branch-start',{role,sessionId});
          run.controller.signal.throwIfAborted();const output=await this.execute(job,run.parent);job.state='completed';result={role,agentId:sessionId,ok:true,output};
        }catch(error){job.state=run.controller.signal.aborted?'cancelled':'failed';result={role,agentId:sessionId,ok:false,error:messageOf(error),branch:job.branch,checkpoint:job.latestArtifact};}
        finally{job.help=null;job.handle=null;if(job.waiter){job.waiter.reject(Error('worker finished'));job.waiter=null;}run.pending.delete(promise);}
        // Release execution capacity before delivery: a notification may synchronously add work.
        run.results.push(result);
        await this.emit(run,'branch-end',{role,ok:result.ok,...(!result.ok?{error:result.error,branch:result.branch,checkpoint:result.checkpoint}:{})});
        try{
          const delivery={kind:result.ok?'branch-complete':'branch-failed',...this.outputDelivery(job,result),internalOnly:true,reporting:{...run.reporting},remaining:run.pending.size,active:run.pending.size,capacity:Math.max(0,this.max-run.pending.size)};
          if(await this.tell(run,delivery))run.deliveredFacts.push(delivery);
        }catch(error){run.notificationError=messageOf(error);}
      }).finally(()=>{run.pending.delete(promise);run.inflight.delete(promise);if(!run.pending.size&&!run.inflight.size&&!run.finishing)run.completion=this.finish(run);});
      run.pending.add(promise);run.inflight.add(promise);
    }
  }
  async report(run,job,kind,message,wait=false) {
    run.controller.signal.throwIfAborted();
    if(!['progress','help','artifact'].includes(kind)||typeof message!=='string'||!message.trim()||message.length>6000)throw Error('invalid flash report');
    if(wait&&kind!=='help')throw Error('only help may wait for reply');
    if(job.waiter)throw Error('a help request is already waiting');
    if(kind==='help')job.help={message,waiting:wait};
    if(kind==='artifact')job.latestArtifact={message,at:new Date(this.now()).toISOString()};
    let answer;
    if(wait){job.state='waiting-help';answer=new Promise((resolve,reject)=>{const stop=()=>{job.waiter=null;reject(run.controller.signal.reason);};const cleanup=()=>run.controller.signal.removeEventListener('abort',stop);job.waiter={resolve:value=>{cleanup();job.waiter=null;job.state='running';resolve(value);},reject:error=>{cleanup();job.waiter=null;reject(error);}};run.controller.signal.addEventListener('abort',stop,{once:true});});answer.catch(()=>{});}
    try{
      await this.emit(run,kind,{role:job.role,message,waiting:wait});
      if(kind==='progress')return {accepted:true};
      if(kind==='artifact'){
        if(job.deliveredArtifacts.has(message))return {accepted:true};
        let delivery=job.artifactDeliveries.get(message);
        if(!delivery){
          const artifactId=`${job.sessionId}:artifact:${++job.nextArtifact}`;
          const fact={kind,agentId:job.sessionId,role:job.role,message,waiting:wait,artifactId,internalOnly:true,reporting:{...run.reporting}};
          delivery=Promise.resolve().then(async()=>{
            if(await this.tell(run,fact)){
              job.deliveredArtifacts.set(message,{kind:'artifact',agentId:job.sessionId,artifactId});
              run.deliveredFacts.push(fact);
            }
          }).finally(()=>job.artifactDeliveries.delete(message));
          job.artifactDeliveries.set(message,delivery);
        }
        await delivery;
      }else await this.tell(run,{kind,agentId:job.sessionId,role:job.role,message,waiting:wait});
    }catch(error){if(job.waiter)job.waiter.reject(error);throw error;}
    return wait?await answer:{accepted:true};
  }
  reply(parent,id,agentId,message) {
    const run=this.require(parent,id),job=run.jobs.get(agentId);
    if(!job||!['starting','running','waiting-help'].includes(job.state)||typeof message!=='string'||!message.trim()||message.length>12000)throw Error('worker unavailable or invalid reply');
    job.help=null;
    if(job.waiter){job.waiter.resolve({reply:message});return {accepted:true,resumed:true};}
    if(!job.handle)throw Error('worker is still starting; retry when ready');
    job.handle.steer(this.makeMessage(parent.id,message));return {accepted:true};
  }
  add(parent,id,branches) {
    const run=this.require(parent,id);if(this.closed||run.controller.signal.aborted||run.finishing||run.status!=='running')throw Error('run is not accepting work; start a new run after completion');
    if(!Array.isArray(branches)||!branches.length||branches.length>this.max||run.pending.size+branches.length>this.max)throw Error(`at most ${this.max === 4 ? 'four' : this.max} concurrent executors are allowed`);
    const live=[...run.jobs.values()].filter(j=>['starting','running','waiting-help'].includes(j.state)).map(j=>j.branch);
    // Validate full ownership set even when appending a single task.
    const all=[...live,...branches];validateFlashTask({...run.task,branches:all.length===1?[...all,{task:'ownership sentinel',write_paths:[]}]:all},this.max);
    this.launch(run,branches.map(freezeBranch));return this.view(run);
  }
  async finish(run) {
    if(run.finishing)return;
    run.finishing=true;
    try{
      if(run.controller.signal.aborted){run.endedAt=this.now();run.status='cancelled';return;}
      await this.emit(run,'summary-start');
      const summary=await this.execute({runId:run.id,role:'S',kind:'summary',sessionId:`${FLASH_PREFIX}${run.id}-S`,objective:run.task.objective,acceptance:run.task.acceptance??'',constraints:run.task.constraints??'',reportingMode:'single-final',reporting:{...run.reporting},deliveredFacts:run.deliveredFacts.slice(),branches:run.results.map(x=>({...x})),signal:run.controller.signal},run.parent);
      run.controller.signal.throwIfAborted();run.summary=summary;run.endedAt=this.now();run.status=run.results.every(x=>x.ok)?'completed':'partial';
      run.reporting={...run.reporting,phase:'ready',userSummaryAllowed:true};
      await this.emit(run,'completed',{ok:run.status==='completed',durationMs:this.now()-run.started});
      await this.tell(run,{kind:'run-complete',status:run.status,reporting:{...run.reporting},singleReport:true,summaryAvailable:typeof summary==='string'&&!!summary.trim()});
    }catch(error){run.error=messageOf(error);run.endedAt=this.now();run.status=run.controller.signal.aborted?'cancelled':'failed';if(run.status==='failed')run.reporting={...run.reporting,phase:'ready',userSummaryAllowed:true};await this.emit(run,'failed',{error:run.error});try{await this.tell(run,{kind:'run-failed',error:run.error,reporting:{...run.reporting},singleReport:true});}catch{}}
    finally{run.endedAt??=this.now();for(const check of [...run.listeners])check();clearTimeout(run.timer);if(this.parents.get(run.parent)===run)this.parents.delete(run.parent);const done=[...this.runs.values()].filter(x=>!this.parents.has(x.parent)&&x!==run);while(this.runs.size>30&&done.length)this.runs.delete(done.shift().id);}
  }
  async cancel(parent,id) {
    const run=this.require(parent,id);run.controller.abort(Error('flash run cancelled'));await Promise.allSettled([...run.inflight]);if(run.completion)await run.completion;return this.view(run);
  }
  async closeParent(parent) {const run=this.parents.get(parent);if(run)await this.cancel(parent,run.id);}
  async close() {this.closed=true;await Promise.allSettled([...this.parents].map(([parent,run])=>this.cancel(parent,run.id)));}
}