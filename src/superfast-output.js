const preview = (value, limit = 320) => typeof value === 'string' ? value.slice(0, limit) : value;
const ref = (agentId, section = 'result') => ({ agent_id: agentId, section });
function resultView(result) {
  return { role: result.role, kind: result.kind, agentId: result.agentId, ok: result.ok, output: preview(result.output), outputChars: result.output?.length ?? 0, error: preview(result.error, 1000), supersededBy: result.supersededBy, artifactCount: result.artifacts?.length ?? 0, evidence: ref(result.agentId) };
}
export function compactSuperfast(value) {
  if (!value || typeof value !== 'object') return value;
  const out = { ...value };
  if (value.results) { out.results = value.results.slice(-20).map(resultView); out.resultCount = value.results.length; }
  if (value.events) {
    out.eventCount = value.events.length;
    out.events = value.events.slice(-12).map(e => ({ seq:e.seq, event:e.event, agentId:e.agentId, role:e.role, kind:e.kind, ok:e.ok, error:preview(e.error,1000) }));
    out.eventsOmitted = Math.max(0, value.events.length - out.events.length);
  }
  if (value.branches) {
    out.branches = value.branches.slice(-20).map(j => ({ agentId:j.agentId, parentAgentId:j.parentAgentId, role:j.role, kind:j.kind, state:j.state, attempt:j.attempt, retryOf:j.retryOf, supersededBy:j.supersededBy, pathCount:j.write_paths?.length ?? 0, evidence:ref(j.agentId,'branch') }));
    out.branchCount = value.branches.length;
  }
  if (typeof value.summary === 'string') { out.summary = preview(value.summary,800);out.summaryChars=value.summary.length; }
  if (typeof value.error === 'string') out.error = preview(value.error,1000);
  out.compact = true;
  out.evidenceHint = 'action=evidence retrieves full stored JSON text; section=result|branch|events|summary|index, agent_id for a node, offset/limit for pagination. Previews are not complete evidence; check failures and unverified items via evidence before accepting.';
  return out;
}
function owns(run, viewer, target) {
  if (!viewer) return true;
  let job = target;
  while (job) { if (job.sessionId === viewer.sessionId) return true; job=run.jobs.get(job.parentId); }
  return false;
}
export function superfastEvidence(run, viewer, args) {
  const section=args.section ?? 'result',offset=args.offset ?? 0,limit=args.limit ?? 4000;
  if (!['result','branch','events','summary','index'].includes(section)) throw Error('invalid evidence section');
  if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>8000) throw Error('invalid evidence page');
  const target=args.agent_id ? run.jobs.get(args.agent_id) : undefined;
  if (args.agent_id && (!target || !owns(run,viewer,target))) throw Error('evidence target outside owned subtree');
  let data;
  if (section==='result'||section==='branch') {
    if (!target) throw Error('agent_id required for node evidence');
    data=section==='result' ? {state:target.state,result:target.result ?? null,artifacts:target.artifacts ?? [],checkpoint:target.latestArtifact} : {agentId:target.sessionId,branch:target.branch,attempt:target.attempt,retryOf:target.retryOf,supersededBy:target.supersededBy};
  } else if(section==='events') {
    data=run.events.filter(e=>{const j=run.jobs.get(e.agentId);return j && owns(run,viewer,j) && (!target||owns(run,target,j));});
  } else if(section==='summary') {
    if(viewer) throw Error('only the parent may read run summary');
    data={summary:run.summary,error:run.error,status:run.status};
  } else data=[...run.jobs.values()].filter(j=>owns(run,viewer,j)).map(j=>({agentId:j.sessionId,role:j.role,kind:j.kind,state:j.state,attempt:j.attempt,supersededBy:j.supersededBy}));
  const full=JSON.stringify(data),text=full.slice(offset,offset+limit);
  return {section,agentId:target?.sessionId,offset,totalChars:full.length,text,nextOffset:offset+text.length<full.length?offset+text.length:null,retention:section==='events'?'bounded event history; full node result/artifact evidence retained separately':'full stored node evidence; previews do not replace this record'};
}
export function compactSuperfastFact(fact) {
  if(fact.kind==='help')return fact;
  return {...fact,message:preview(fact.message,240),summary:preview(fact.summary,800),error:preview(fact.error,1000),compact:true,evidence:fact.agentId?ref(fact.agentId):{section:'summary'}};
}
