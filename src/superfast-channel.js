import { SuperfastSpeedCoordinator } from './superfast-speed-coordinator.js';
import { superfastSpeedToolDenial } from './superfast-speed-policy.js';
import { canonicalFlashPath } from './flash-policy.js';
import { isFlashSession, validateFlashTask } from './flash-core.js';
import { observeFlashCoordinator } from './flash-inspector.js';
import { writeIdentityStatus } from './identity-status.js';

export const SUPERFAST_IMPLEMENTATION = 'speed-pipeline-v1';
export const SUPERFAST_MAX = 32;
const output = { schema: { type: 'string' }, render: (_a, r) => [{ type: 'text', text: r }] };
const dependencySchema = { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 64 }, event: { type: 'string', enum: ['artifact', 'completed'] } }, required: ['id', 'event'], additionalProperties: false };
const branchSchema = { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 64 }, depends_on: { type: 'array', maxItems: 32, items: dependencySchema }, task: { type: 'string', minLength: 1, maxLength: 48000 }, write_paths: { type: 'array', items: { type: 'string' } } }, required: ['task', 'write_paths'], additionalProperties: false };
export function superfastToolDenial(job, exec) { return superfastSpeedToolDenial(job, exec); }
// Legacy helper retained for old coordinator tests. The active channel uses its
// own live ownership check below; shell isolation remains a host-policy concern.
export function superfastParentWriteDenial(coordinator, exec, cwd = process.cwd()) {
  if (isFlashSession(exec.agent)) return;
  const name = exec.tool?.name ?? exec.name ?? exec.call?.name;
  const field = name === 'write' || name === 'edit' ? 'file_path' : name === 'ops_replace' ? 'path' : null;
  const roots = coordinator.reservedPaths?.() ?? [];
  if (!field || !roots.length) return;
  try {
    const target = canonicalFlashPath(exec.arguments?.[field], cwd);
    if (roots.some(root => target === root || target.startsWith(root + '/') || root.startsWith(target + '/'))) return '路径正由超快执行者占用；请用reply协调或等待该分支完成后再修改';
  } catch { return '超快运行期间父侧文件写入必须提供可校验目标路径'; }
}
export function superfastPrompt(job) {
  return `你是超快并行执行者 ${job.role}。没有父会话历史，只依据任务包与查证完成分工。目标是最短端到端交付时间，不以节约token牺牲并行或质量。禁止派生代理、创建长期任务或其它协作run。\n目标：${job.objective}\n约束：${job.constraints ?? ''}\n验收：${job.acceptance ?? ''}\n职责：只修改write_paths声明的范围，空列表只读；不得碰其它分支的文件。宿主仍执行继承的权限和审批策略。可写分支可用原生命令工具在本分支范围内运行针对性构建和测试。效率预算（硬性）：工具调用总数控制在5次以内——一次命令确认工作目录与既有文件，一次write写出自包含脚本（生成数据、统计、写结果、自检合并在同一次执行内），一次命令运行该脚本，最后一次superfast_report报告。禁止把同一件事拆成多轮试错，禁止反复pwsh探查或逐个cat/ls，脚本一次失败就在脚本内补自检输出后重跑同一脚本，不要重复提交新命令。不要为了普通命令验证求助父Agent。文档与报告类产出例外：直接write最终文件，禁止为生成文档先写脚本再执行，最多两次工具调用一次成稿。你的产物会被下游分支读取时，除完整文件外额外输出一份精简版（只保留下游判断所需字段，控制在100行内），并在artifact里同时给出两个路径。shell不是额外的路径沙箱，严格遵守文件所有权，不改共享依赖/锁文件或清理其它分支。只读分支不执行命令。write_paths仅声明所有权，不会创建目录；命令workdir必须显式指向已确认存在的目录，尚未创建的产物目录不能直接作为cwd。启动前核验cwd和执行脚本，首次ENOENT仅表示基础设施启动失败，不据此断言runner缺失或策略拒绝，记录实际工具、workdir、路径存在性及原始错误；不自动重装依赖、提权或改宿主。若已明确允许备用执行器，可在既有权限内改用现有pwsh/node并如实保留两条执行证据，不冒称原工具已修复。需要跨分支集成或真正阻塞时才help。\n独立工作尽早并行，不等待无关分支。父可在同批次用id与depends_on预声明依赖；协调器在所有上游条件满足后自动启动下游，不等待父再次add。artifact条件只表示上游报告了可用产物，不等于父或系统已验证内容；下游必须实际读取并校验提供的依赖证据。只有该分支职责需要的产物和针对性自测已就绪才报告artifact，不能用空进度提前放行。可用产物形成后立刻superfast_report artifact，写清绝对路径、接口、实际完成项、实际验证和剩余项，使下游可立即开工。progress只报告新事实，不反复计划；help默认不阻塞，只有无法继续且确实需要父决定时wait_for_reply:true。最终返回新增结果与证据；已artifact报告的事实不用重复。父可在运行中reply，及时处理；失败后先读现存产物，只补缺口，不重做完成项。测试失败要修复或明确报告，禁止把未验证写成通过。不反复抛光、不重新探索已明确的问题；分支针对性测试完成后父只负责必要集成验收。\n材料：${job.materials ?? ''}\n分工：${JSON.stringify(job.branch)}`;
}
// Compatibility export only. No active execution path creates a summary model.
export function superfastSummaryPrompt(job) {
  return '历史整理合同：只整理已返回数据，不调用工具，不捏造验证。\n' + JSON.stringify({ branches: job.branches, deliveredFacts: job.deliveredFacts ?? [] });
}
export async function diagnoseSpeedWait(parent) {
  let summaryCalls = 0;
  const started = Date.now();
  const diag = new SuperfastSpeedCoordinator({ max: SUPERFAST_MAX, notify: async () => {}, execute: async job => {
    if (job.kind === 'summary') { summaryCalls++; throw Error('unexpected summary model'); }
    await new Promise(r => setTimeout(r, 40 + Number(job.role.replace(/\D/g, '') || 1) * 2));
    return 'diagnostic output ' + job.role;
  } });
  try {
    const v = diag.start(parent, { objective: 'active speed coordinator wait diagnosis', branches: Array.from({length: 8}, (_, i) => ({task: 'diagnose ' + i, write_paths: []})) });
    let w, waits = 0;
    do { w = await diag.wait(parent, v.runId, { timeoutMs: 10000, afterRevision: 999999 }); waits++; } while (w.status === 'running' && waits < 20);
    return {ok: w.status === 'completed' && summaryCalls === 0 && w.results.length === 8, implementation: SUPERFAST_IMPLEMENTATION, synthetic: true, modelCalls: 0, summaryCalls, elapsedMs: Date.now()-started, waits, waitReason: w.waitReason, waitStats: w.waitStats, phases: w.phases, branches: w.branches.map(b => ({role:b.role,state:b.state})), sideEffects:w.sideEffects};
  } finally { await diag.close(); }
}
export function registerSuperfastChannel(ctx, { executor, flashContext, record, fast, active, makeMessage }) {
  let coordinator;
  const execute = (job, parent) => {
    job.prompt = superfastPrompt(job);
    job.toolDenial = superfastToolDenial;
    job.deferCleanup = true;
    job.onCleanup = promise => {
      const run = coordinator.runs.get(job.runId);
      if (run) coordinator.track(run, 'cleanup', () => promise);
      else promise.catch(() => {});
    };
    job.registerTools = (tools, child) => tools.register({
      name:'superfast_report', description:'报告可用产物artifact、新事实progress或真正阻塞help。仅wait_for_reply:true等待父回复；普通测试自己执行。', timeoutMs:1800000,
      parameters:{type:'object',properties:{kind:{type:'string',enum:['progress','help','artifact']},message:{type:'string',minLength:1,maxLength:6000},wait_for_reply:{type:'boolean'}},required:['kind','message'],additionalProperties:false},output,
      async execute(args, exec) { if (exec.agent !== child) throw Error('superfast tool sender mismatch'); exec.signal.throwIfAborted(); return JSON.stringify(await job.report(args.kind,args.message,args.wait_for_reply===true)); }
    });
    return executor(job,parent);
  };
  coordinator = new SuperfastSpeedCoordinator({execute,notify:flashContext.notify,record,max:SUPERFAST_MAX});
  coordinator.makeMessage = makeMessage;
  coordinator.reservedPaths = () => [...coordinator.runs.values()].filter(r=>r.status==='running').flatMap(r=>[...r.jobs.values()].filter(j=>['queued','starting','running','waiting-help'].includes(j.state)).flatMap(j=>j.branch.write_paths));
  coordinator.assertAvailable = branches => {
    // The fast caller already validates its own batch. Here check cross-run ownership,
    // including fast/legacy work, rather than capping all callers to the fast limit.
    const live = [...coordinator.runs.values()].filter(r=>r.status==='running').flatMap(r=>[...r.jobs.values()].filter(j=>['queued','starting','running','waiting-help'].includes(j.state)).map(j=>j.branch));
    if (live.length) validateFlashTask({objective:'ownership',branches:[...live,...branches]},live.length+branches.length);
  };
  ctx.effect(()=>observeFlashCoordinator(coordinator));
  const root = exec => {const parent=exec.agent;if(!parent||ctx.agents.get(parent.id)!==parent||isFlashSession(parent))throw Error('superfast requires a live non-flash parent');exec.signal.throwIfAborted();return parent;};
  const checkOtherWork = (parent, branches) => {
    const liveFast = [...(fast?.runs?.values() ?? [])].filter(r=>r.status==='running').flatMap(r=>[...r.jobs.values()].filter(j=>['queued','starting','running','waiting-help'].includes(j.state)).map(j=>j.branch));
    const legacy = [...(active?.values() ?? [])].map(controller=>({task:'active legacy ownership',write_paths:controller.writePaths??[]}));
    const all=[...liveFast,...legacy,...branches];
    if(all.length>1)validateFlashTask({objective:'ownership',branches:all},Math.max(SUPERFAST_MAX,all.length));
    coordinator.assertAvailable(branches);
  };
  ctx.tools.register({name:'superfast_start',description:'速度优先并行通道：提交2–32个分工立即返回；独立任务并行，依赖任务用id和depends_on预声明，上游artifact或成功completed后自动启动，无需父再次add。依赖event为artifact或completed，多个条件全部满足才启动。执行者可针对性构建测试，无强制整理模型。write_paths不能重叠，排队任务也保留路径，宿主权限仍生效。',parameters:{type:'object',properties:{objective:{type:'string',minLength:1,maxLength:48000},materials:{type:'string'},constraints:{type:'string'},acceptance:{type:'string'},branches:{type:'array',minItems:2,maxItems:SUPERFAST_MAX,items:branchSchema}},required:['objective','branches'],additionalProperties:false},output,
    execute(task,exec){const parent=root(exec);checkOtherWork(parent,task.branches);return JSON.stringify(coordinator.start(parent,task));}});
  ctx.tools.register({name:'superfast_control',description:'超快流水控制：wait在新artifact、分支完成/容量释放、help或终态返回，消费游标防重复。预声明depends_on由协调器自动放行，不等待父add；发现新工作再add，支持依赖已有id。活跃加排队任务最多32，已完成任务不占容量。status收齐结果，reply处理真正阻塞，cancel包含排队任务。无独立整理模型，父只做必要集成验收。',parameters:{type:'object',properties:{action:{type:'string',enum:['status','wait','reply','add','cancel','diagnose']},run_id:{type:'string'},timeout_ms:{type:'integer',minimum:1,maximum:1200000},after_revision:{type:'integer',minimum:0},agent_id:{type:'string'},message:{type:'string'},branches:{type:'array',minItems:1,maxItems:SUPERFAST_MAX,items:branchSchema}},required:['action'],additionalProperties:false},timeoutMs:1800000,output,
    async execute(args,exec){const parent=root(exec);if(args.action==='diagnose')return JSON.stringify(await diagnoseSpeedWait(parent));if(args.action==='wait')return JSON.stringify(await coordinator.wait(parent,args.run_id,{signal:exec.signal,timeoutMs:args.timeout_ms,afterRevision:args.after_revision}));if(args.action==='status')return JSON.stringify(coordinator.view(coordinator.require(parent,args.run_id)));if(args.action==='reply')return JSON.stringify(coordinator.reply(parent,args.run_id,args.agent_id,args.message));if(args.action==='add'){checkOtherWork(parent,args.branches);return JSON.stringify(coordinator.add(parent,args.run_id,args.branches));}if(args.action==='cancel')return JSON.stringify(await coordinator.cancel(parent,args.run_id));throw Error('invalid superfast control action');}});
  // Enforce explicit file writes; opaque shell commands still rely on host policy
  // and the shared ownership contract, not an imaginary JavaScript shell sandbox.
  ctx.tools.guard?.(exec => superfastParentWriteDenial(coordinator,exec));
  ctx.on('session/event',(session,event)=>{if(event.type==='turn/end'&&event.data.reason?.kind==='aborted'){const parent=ctx.agents.get(session.id);if(parent)void coordinator.closeParent(parent).catch(()=>{});}});
  ctx.on('agent/disposed',({agent})=>coordinator.closeParent(agent));
  ctx.effect(()=>()=>coordinator.close());
  writeIdentityStatus({superfast:{phase:'registered',implementation:SUPERFAST_IMPLEMENTATION,scheduler:'predeclared-dag-v1',at:new Date().toISOString(),pid:process.pid}});
  return coordinator;
}