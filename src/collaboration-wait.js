// Parent-side wait: events wake it early, but the run state is what decides the answer.
// A missed notification must never turn into a full timeout sleep, so a cheap periodic re-check
// runs alongside the event listener and re-evaluates the same condition.
//
// Reading the run state can itself fail (an executor record that is briefly incomplete). That must
// never leave the wait hanging with no answer: the last good snapshot is reused, and a sustained
// failure rejects with the real error instead of silently sleeping until the timeout.
//
// The resolved value carries waitStats so a real-host failure can be told apart from a test-only
// one: how many checks ran, how many came from the timer rather than an event, how many snapshots
// failed, and when the wait registered and ended.
export function waitForRun(run, snapshot, { signal, timeoutMs = 120000, ready, pollMs = 250, onCheck } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1200000) throw Error('timeout_ms must be 1..1200000');
  if (!Number.isSafeInteger(pollMs) || pollMs < 0) throw Error('poll interval must be a non-negative integer');
  signal?.throwIfAborted();
  return new Promise((resolve,reject) => {
    let timer,poll,settled=false,lastValue=null,failures=0,lastError=null;
    const stats={registeredAt:Date.now(),checks:0,eventChecks:0,timerChecks:0,snapshotFailures:0,lastError:null,pollMs};
    const cleanup=()=>{settled=true;clearTimeout(timer);if(poll)clearTimeout(poll);run.listeners.delete(check);signal?.removeEventListener('abort',abort);};
    const read=()=>{
      try{const value=snapshot();if(value){lastValue=value;failures=0;}return lastValue;}
      catch(e){failures++;stats.snapshotFailures++;lastError=e;stats.lastError=String(e?.message??e);return null;}
    };
    const complete=(reason)=>{
      if(settled)return;
      const value=read()??lastValue;
      if(!value){cleanup();reject(lastError??Error('superfast wait could not read run state'));return;}
      cleanup();
      stats.endedAt=Date.now();
      onCheck?.({reason,stats});
      resolve({...value,waitReason:reason,waitStats:{...stats}});
    };
    const abort=()=>{if(settled)return;cleanup();reject(signal.reason ?? Error('wait aborted'));};
    const check=(fromTimer=false)=>{
      if(settled)return;
      stats.checks++;
      if(fromTimer)stats.timerChecks++;else stats.eventChecks++;
      if(signal?.aborted)return abort();
      const value=read();
      if(!value){if(failures>=8){cleanup();reject(Error('superfast wait cannot read run state: '+(lastError?.message??lastError)));}return;}
      if(value.status!=='running')return complete('terminal');
      if(value.pendingHelp?.length)return complete('help');
      const reason=ready?.(value);if(reason)return complete(reason);
    };
    run.listeners.add(check);signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>complete('timeout'),timeoutMs);
    // A recursive timer rather than one long-lived interval: each wake re-arms itself, so a single
    // failed check can never leave the periodic path dead for the rest of the wait.
    const arm=()=>{
      if(settled||!(pollMs>0))return;
      poll=setTimeout(()=>{poll=null;if(settled)return;check(true);arm();},pollMs);
      poll.unref?.();
    };
    arm();
    check();
  });
}
