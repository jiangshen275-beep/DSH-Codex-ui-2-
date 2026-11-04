const providers = new Set();
export function observeFlashCoordinator(coordinator) { providers.add(coordinator);return ()=>providers.delete(coordinator); }
const textBlocks = blocks => (Array.isArray(blocks)?blocks:[]).filter(b=>b.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n');
const parse = value => {try{return typeof value==='string'?JSON.parse(value):value;}catch{return {};}};
export function flashAgentView(agent) {
  const events=agent.session.snapshotEvents(0),reports=[],pending=new Map();let taskPackage='';
  for(const event of events){
    const d=event.data??{};
    if(event.type==='user/message'&&!taskPackage)taskPackage=textBlocks(d.content);
    if(event.type==='assistant/message') {const output=textBlocks(d.message?.content);if(output)reports.push({kind:'output',message:output.slice(0,8000),at:event.time});}
    if(event.type==='tool/call'){
      pending.set(d.callId,{name:d.name,startedAt:event.time});
      if(d.name==='flash_report'||d.name==='superfast_report'){const args=parse(d.arguments);if(['progress','help','artifact'].includes(args?.kind))reports.push({kind:args.kind,message:String(args.message??'').slice(0,6000),at:event.time});}
    }
    if(event.type==='tool/result')pending.delete(d.message?.callId ?? d.message?.toolCallId);
  }
  const header=agent.session.header;
  return {agentId:agent.id,parentSession:header.parentSession,role:agent.id.replace(/-r\d+$/,'').split('-').at(-1),state:agent.status==='running'?(reports.at(-1)?.kind==='help'&&[...pending.values()].some(t=>(t.name==='flash_report'||t.name==='superfast_report'))?'waiting-help':'running'):(events.filter(e=>e.type==='turn/end').at(-1)?.data.reason?.kind==='completed'?'completed':'idle'),taskPackage,tools:[...pending.values()].slice(-8),reports:reports.slice(-12),createdAt:header.createdAt};
}
export function flashTreeSnapshot(ctx,sessionId,retained=new Map()) {
  if(typeof sessionId!=='string'||!/^session-[A-Za-z0-9-]+$/.test(sessionId)||sessionId.length>160)throw Error('会话参数无效');
  const nodes=new Map();
  for(const agent of ctx.agents.list())if(agent.id.startsWith('session-cgflash-')&&agent.session.header.parentSession===sessionId){const view=flashAgentView(agent);nodes.set(agent.id,view);retained.set(agent.id,view);}
  for(const [id,view] of retained)if(view.parentSession===sessionId&&!nodes.has(id))nodes.set(id,{...view,state:'released',tools:[]});
  const runs=[];
  for(const coordinator of providers)for(const run of coordinator.runs.values()){
    if(run.parent.id!==sessionId)continue;
    runs.push({runId:run.id,status:run.status,objective:run.task.objective,materials:run.task.materials??'',constraints:run.task.constraints??'',acceptance:run.task.acceptance??'',startedAt:run.started,summary:run.summary,error:run.error});
    for(const job of run.jobs.values()){
      const live=ctx.agents.get?.(job.sessionId);
      const existing=live?flashAgentView(live):nodes.get(job.sessionId)??{};
      nodes.set(job.sessionId,{...existing,agentId:job.sessionId,parentSession:sessionId,parentAgentId:job.parentId??sessionId,mode:run.task.mode??(job.depth?'superfast':'fast'),depth:job.depth??1,kind:job.kind,attempt:job.attempt,retryOf:job.retryOf,supersededBy:job.supersededBy,help:job.help,runId:run.id,role:job.role,state:job.state,branch:job.branch,taskPackage:{objective:job.objective,materials:job.materials,constraints:job.constraints,acceptance:job.acceptance,branch:job.branch},reports:existing.reports??run.events.filter(e=>e.role===job.role&&['progress','help','artifact'].includes(e.event)).map(e=>({kind:e.event,message:e.message,at:e.at})),tools:existing.tools??[],result:run.results.find(r=>r.agentId===job.sessionId)});
    }
  }
  while(retained.size>200)retained.delete(retained.keys().next().value);
  const list=[...nodes.values()];return {sessionId,at:Date.now(),total:list.length,active:list.filter(n=>['starting','running','waiting-help','waiting-children'].includes(n.state)).length,runs,nodes:list,notice:'计划与进度来自Agent主动汇报；不展示内部推理。历史仅包含本次服务加载后保留的记录。'};
}
export function registerFlashInspector(ctx) {
  const retained=new Map();
  // Capture live entries before teardown; never change agent state.
  const remember=()=>{for(const agent of ctx.agents.list())if(agent.id.startsWith('session-cgflash-'))try{retained.set(agent.id,flashAgentView(agent));}catch{}while(retained.size>200)retained.delete(retained.keys().next().value);};
  remember();const timer=setInterval(remember,2000);timer.unref?.();ctx.effect?.(()=>()=>clearInterval(timer));
  return ctx.connection.fetch.register({path:'/api/dsh-codex-ui/flash-tree',methods:['POST'],requestBody:'buffered',async fetch(request){let e;try{e=await request.json();}catch{return Response.json({error:'invalid request'},{status:400});}const reply=result=>Response.json({type:'server-response',rpcId:e.rpcId,result});if(e.type!=='client-request'||e.method!=='dsh-codex-ui/flash-tree')return reply({ok:false,error:{message:'请求无效'}});try{return reply({ok:true,value:flashTreeSnapshot(ctx,e.payload?.sessionId,retained)});}catch(error){return reply({ok:false,error:{message:error.message}});}}});
}