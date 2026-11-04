export function mountFlashTreeUI(ctx, readSession) {
  if(typeof document==='undefined')return ()=>{};
  document.querySelector('[data-cg-flash-tree-root]')?.remove();
  const states={starting:'正在启动',running:'执行中',idle:'空闲',released:'已释放',completed:'已完成',failed:'失败',cancelled:'已取消','waiting-help':'等待负责人回复','waiting-children':'等待子层事件'};
  const root=document.createElement('div');root.dataset.cgFlashTreeRoot='true';
  const style=document.createElement('style');style.textContent=`
.cg-flash-btn{border:1px solid var(--border-default,#494949);background:var(--bg-secondary,#272727);color:var(--text-primary,#eee);border-radius:7px;padding:5px 9px;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;margin-left:6px}
.cg-flash-mask{position:fixed;inset:0;z-index:10020;background:#0008;display:flex;justify-content:flex-end}
.cg-flash-panel{width:min(760px,96vw);height:100%;background:var(--bg-primary,#202020);color:var(--text-primary,#eee);border-left:1px solid #6666;box-shadow:-12px 0 40px #0005;display:flex;flex-direction:column;font-size:13px;line-height:1.6}
.cg-flash-head{padding:18px 22px 12px;border-bottom:1px solid #8884;display:flex;gap:12px;align-items:center}.cg-flash-head strong{font-size:17px;flex:1}.cg-flash-close{border:1px solid #8886;background:transparent;color:inherit;border-radius:6px;padding:4px 12px;cursor:pointer}
.cg-flash-body{overflow:auto;padding:18px 22px;flex:1}.cg-flash-note{opacity:.65;font-size:12px;margin:4px 0 14px}.cg-flash-run{border:1px solid #8885;border-radius:9px;margin:0 0 18px;padding:12px}.cg-flash-node{margin:12px 0 4px 12px;border-left:2px solid #718bd1;padding:2px 0 4px 14px}.cg-flash-node summary{cursor:pointer;overflow-wrap:anywhere}.cg-flash-node pre,.cg-flash-run pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;background:#8881;border:1px solid #8883;border-radius:5px;padding:10px;font:12px/1.6 ui-monospace,monospace}.cg-flash-badge{font-size:11px;border:1px solid #8886;border-radius:4px;padding:1px 5px;margin-left:7px}.cg-flash-live{color:#80c5fb}.cg-flash-help{color:#f5c16c}.cg-flash-progress{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}.cg-flash-stat{margin-bottom:14px}.cg-flash-error{color:#f39797}.cg-flash-task{opacity:.8;margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}
@media(prefers-color-scheme:light){.cg-flash-panel{background:var(--bg-primary,#fff);color:var(--text-primary,#222)}.cg-flash-btn{background:var(--bg-secondary,#f5f5f5);color:var(--text-primary,#222)}.cg-flash-live{color:#226bb2}.cg-flash-help{color:#986100}}
`;root.append(style);document.body.append(root);
  const button=document.createElement('button');button.className='cg-flash-btn';button.textContent='ϟ 闪电 Agent';button.title='查看当前会话的闪电 Agent 树、进度与任务包';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
  let mask=null,body=null,open=false,disposed=false,timer=null,busy=false,sessionId='',data=null,lastRender='',focusBefore=null;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const detail=(name,value,key)=>{const d=el('details');d.dataset.key=key;d.append(el('summary',name),el('pre',typeof value==='string'?value:JSON.stringify(value,null,2)));return d;};
  const draw=()=>{
    if(!body)return;const keep=new Set([...body.querySelectorAll('details[open]')].map(d=>d.dataset.key));const scroll=body.scrollTop;body.replaceChildren();
    if(!sessionId){body.append(el('p','请先打开一个会话。'));return;}
    if(!data){body.append(el('p','正在读取当前会话的闪电 Agent…'));return;}
    body.append(el('div',`活跃 ${data.active} · 本次记录 ${data.total}（含执行者与汇总者）`,'cg-flash-stat'),el('div',data.notice,'cg-flash-note'));
    if(!data.nodes.length){body.append(el('p','当前会话暂无闪电 Agent。启动闪电任务后会自动显示。'));return;}
    const groups=new Map();for(const node of data.nodes){const id=node.runId??node.agentId.replace(/^session-cgflash-/,'').replace(/-[^-]+$/,'');if(!groups.has(id))groups.set(id,[]);groups.get(id).push(node);}
    for(const [id,nodes] of groups){const run=data.runs.find(r=>r.runId===id),box=el('section',undefined,'cg-flash-run');box.append(el('strong',run?.objective??'闪电任务批次'),el('div',`${id} · ${run?.status??'已观测'}`,'cg-flash-note'));
      if(run)box.append(detail('完整批次任务包',{objective:run.objective,materials:run.materials,constraints:run.constraints,acceptance:run.acceptance},id+'-package'));
      const containers=new Map();
      for(const n of [...nodes].sort((a,b)=>(a.depth??1)-(b.depth??1))){const row=el('div',undefined,'cg-flash-node'),d=el('details');d.dataset.key=n.agentId;const title=el('summary',`${n.kind==='organizer'?'整理协调者 S':n.kind==='leader'?'小组长 '+n.role:n.role==='S'?'汇总者 S':'执行者 '+n.role}`),state=el('span',states[n.state]??n.state,'cg-flash-badge '+(n.state==='waiting-help'?'cg-flash-help':['starting','running'].includes(n.state)?'cg-flash-live':''));title.append(state);d.append(title,el('div',n.agentId,'cg-flash-note'));
        const last=n.reports?.at(-1);row.append(el('div',last?`${last.kind==='help'?'求助':last.kind==='artifact'?'提前交付':'最新进度'}：${last.message}`:'尚未收到主动计划或进度汇报','cg-flash-task'));
        if(n.tools?.length)row.append(el('div','当前工具：'+n.tools.map(t=>t.name).join('、'),'cg-flash-live'));
        d.append(detail('任务包与文件范围',n.taskPackage||n.branch||'暂无记录',n.agentId+'-package'));
        for(const r of n.reports??[])d.append(el('div',`${r.kind} · ${new Date(r.at).toLocaleTimeString()}\n${r.message}`,'cg-flash-progress'));
        if(n.result)d.append(detail('执行结果',n.result,n.agentId+'-result'));if(n.help)d.append(detail('求助负责人/升级状态',n.help,n.agentId+'-help'));row.prepend(d);(containers.get(n.parentAgentId)??box).append(row);containers.set(n.agentId,row);
      }
      if(run?.summary)box.append(detail('批次汇总',run.summary,id+'-summary'));if(run?.error)box.append(el('div',run.error,'cg-flash-error'));body.append(box);
    }
    for(const d of body.querySelectorAll('details'))if(keep.has(d.dataset.key))d.open=true;body.scrollTop=scroll;
  };
  const poll=async()=>{if(disposed||!open||busy)return;const current=readSession()??'';if(current!==sessionId){sessionId=current;data=null;lastRender='';draw();}if(!current)return;busy=true;
    try{const result=await ctx.connection.rpc.call('/api','dsh-codex-ui/flash-tree',{sessionId:current});if(disposed||!open||current!==readSession())return;if(!result?.ok)throw Error(result?.error?.message??'读取失败');data=result.value;button.textContent=`ϟ 闪电 Agent · ${data.active}`;const signature=JSON.stringify([data.sessionId,data.active,data.runs,data.nodes]);if(signature!==lastRender){lastRender=signature;draw();}}
    catch(error){if(body&&current===readSession()){body.replaceChildren(el('p','读取闪电树失败：'+error.message,'cg-flash-error'));lastRender='';}}
    finally{busy=false;}
  };
  const close=()=>{open=false;button.setAttribute('aria-expanded','false');clearInterval(timer);timer=null;mask?.remove();mask=null;body=null;focusBefore?.focus?.();};
  button.onclick=()=>{if(open){close();return;}open=true;focusBefore=document.activeElement;button.setAttribute('aria-expanded','true');mask=el('div',undefined,'cg-flash-mask');const panel=el('section',undefined,'cg-flash-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','当前会话闪电 Agent 树');const head=el('div',undefined,'cg-flash-head'),x=el('button','关闭','cg-flash-close');x.onclick=close;head.append(el('strong','ϟ 当前会话 · 闪电 Agent 树'),x);body=el('div',undefined,'cg-flash-body');panel.append(head,body);mask.append(panel);mask.addEventListener('click',e=>{if(e.target===mask)close();});root.append(mask);data=null;lastRender='';draw();void poll();timer=setInterval(poll,2000);x.focus();};
  const key=e=>{if(!open)return;if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const f=[...mask.querySelectorAll('button,summary,[tabindex="0"]')];const first=f[0],last=f.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);
  const sync=()=>{if(disposed)return;const id=readSession()??'';button.hidden=!id;if(!id&&open)close();if(id!==sessionId){button.textContent='ϟ 闪电 Agent';if(open)void poll();}if(button.isConnected)return;const peer=[...document.querySelectorAll('button')].find(n=>!root.contains(n)&&/费用明细/.test(n.textContent??''));if(peer?.parentElement)peer.parentElement.append(button);};
  const mountTimer=setInterval(sync,1000);sync();
  return ()=>{disposed=true;close();clearInterval(mountTimer);document.removeEventListener('keydown',key);button.remove();root.remove();};
}