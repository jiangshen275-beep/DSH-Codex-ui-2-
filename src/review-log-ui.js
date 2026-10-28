/** 审查者后台设置页：理由、证据摘要和权限结果，不展示原始内部推理。 */
let reviewLogHostCtx = null;
function setReviewLogHost(ctx) { reviewLogHostCtx = ctx; }
async function reviewLogCall(payload) {
  try {
    const rpc = reviewLogHostCtx?.connection?.rpc;
    if (!rpc?.call) throw new Error('宿主未提供 RPC 通道');
    const result = await rpc.call('/api', 'dsh-codex-ui/review-log', payload);
    if (typeof result?.ok !== 'boolean') throw new Error('审计接口返回格式异常');
    return result;
  } catch (error) { return { ok: false, error: { message: String(error.message ?? error) } }; }
}
function reviewDecisionLabel(value) {
  return ({ reviewing: '正在审查', allow: '建议放行', ask_user: '建议询问', error: '审查失败', bypass: '规则询问' })[value] || '状态未知';
}
function reviewPermissionLabel(value) {
  return ({ allow: '权限闸门放行', ask: '交给审批流程', deny: '下游拒绝', unknown: '待确认' })[value] || '待确认';
}
function ReviewLogPanel() {
  const [state, setState] = React.useState({ loading: true, items: [], dir: '', error: '' });
  const [selected, setSelected] = React.useState('');
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const loadId = React.useRef(0);
  const refresh = React.useCallback(async () => {
    const id = ++loadId.current;
    const response = await reviewLogCall({ action: 'list' });
    if (loadId.current !== id) return;
    if (!response.ok) { setState(prev => ({ ...prev, loading: false, error: response.error?.message || '读取失败' })); return; }
    setState({ loading: false, items: Array.isArray(response.value?.items) ? response.value.items : [], dir: response.value?.dir || '', error: '' });
  }, []);
  React.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => { clearInterval(timer); loadId.current++; };
  }, [refresh]);
  React.useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);
  const clear = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setBusy(true);
    try {
      const response = await reviewLogCall({ action: 'clear' });
      if (!response.ok) setState(prev => ({ ...prev, error: response.error?.message || '清空失败' }));
      else { setConfirmClear(false); await refresh(); }
    } finally { setBusy(false); }
  };
  const counts = state.items.reduce((out, item) => { out[item.decision] = (out[item.decision] || 0) + 1; return out; }, {});
  const field = (label, text) => text ? h('div', { className: 'cg-review-field' }, h('span', { className: 'cg-review-field-label' }, label), h('pre', null, text)) : null;
  return h('section', { className: 'cg-review-log', 'data-cg-review-panel': 'true' },
    h('h2', null, '审查者后台'),
    h('p', { className: 'cg-injection-intro' }, '每 2.5 秒更新。展示审查理由、命中规则、脱敏证据摘要与权限闸门结果；这些记录不代表工具已执行，也不代表用户已批准。原始参数、模型正文和内部推理不落盘。'),
    h('p', { className: 'cg-injection-hint' }, `最近 ${state.items.length} 条 · 放行建议 ${counts.allow || 0} · 询问建议 ${counts.ask_user || 0} · 审查失败 ${counts.error || 0}`),
    h('div', { className: 'cg-review-actions' },
      h('button', { type: 'button', className: 'cg-button', onClick: refresh, disabled: busy }, '刷新'),
      h('button', { type: 'button', className: 'cg-button', onClick: clear, disabled: busy || state.items.length === 0 }, confirmClear ? '确认清空（4 秒内再点）' : '清空记录')),
    state.error ? h('p', { role: 'alert', className: 'cg-injection-error' }, state.error) : null,
    state.loading ? h('p', null, '正在读取判定记录…') : null,
    !state.loading && state.items.length === 0 ? h('p', null, '暂无记录。「帮我批准」档的后续工具调用会出现在这里；完全访问档跳过模型审查。') : null,
    ...state.items.map(item => {
      const open = selected === item.id;
      const date = new Date(item.at);
      const at = Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : item.at;
      return h('article', { key: item.id, className: 'cg-review-item' },
        h('button', { type: 'button', className: 'cg-review-summary', 'aria-expanded': open, onClick: () => setSelected(open ? '' : item.id) },
          h('span', { className: `cg-review-decision ${item.decision === 'allow' ? 'cg-review-allow' : 'cg-review-ask'}` }, reviewDecisionLabel(item.decision)),
          h('span', { className: 'cg-review-tool' }, item.tool),
          h('span', { className: 'cg-review-time' }, at),
          h('span', { className: 'cg-review-rules' }, (item.ruleIds || []).join(' · ')),
          h('span', { className: 'cg-review-duration' }, `${item.durationMs} ms`)),
        h('p', { style: { margin: '0 12px 8px', overflowWrap: 'anywhere' } }, item.reason || '尚未返回理由'),
        open ? h('div', { className: 'cg-review-body' },
          field('权限闸门结果', reviewPermissionLabel(item.permission)),
          field('档位', item.preset),
          field('审查模型', [item.provider, item.model].filter(Boolean).join(' / ')),
          field('本地证据摘要', item.evidence),
          field('错误摘要', item.error)) : null);
    }),
    h('small', { className: 'cg-injection-hint' }, `记录目录：${state.dir || (state.loading ? '正在读取…' : state.error ? '读取失败，尚未确认' : 'DSH_HOME 未设置')}；最多保留最近 200 条。`));
}
export function registerReviewLogSection(ctx, mountSlot) {
  return mountSlot('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'codex-ui-review-log', order: 31, label: '审查者后台' }, ReviewLogPanel));
}
export { setReviewLogHost };