/**
 * Agent 日记面板。
 *
 * 左列是全部日记，右侧是编辑器。数据全在服务端（`src/diary.js`），这里只发 RPC：
 * list / read / create / write / rename / remove。面板本身不缓存内容，保存后再读一次，
 * 免得界面上的字和磁盘上的文件对不上。
 *
 * 为什么不做成设置里的一页：日记是要反复翻、反复改的东西，挤在设置弹窗里看不全，也留不住
 * 滚动位置。主面板能占满整个右侧区域。
 */

/** 与服务端 `src/diary.js` 的 DIARY_METHOD 保持一致。 */
const DIARY_RPC_METHOD = 'dsh-codex-ui/diary';

/**
 * 交给 Agent 的固定格式：`阅读[日记名]`。
 *
 * 这个字符串是用户和 Agent 之间的约定，不是给人看的装饰。用户把它粘进会话，Agent 看到方括号
 * 里的名字就知道去读哪一篇。`agent_diary` 的工具描述里写着同一条规则，两边改一处必须改另一处。
 * 名字里万一出现 ] ，读出来会对不上，所以换成全角的。
 */
function diaryReadCommand(name) {
  return `阅读[${String(name ?? '').replace(/]/g, '］')}]`;
}

/**
 * 宿主上下文。
 *
 * 这个文件的函数被拼在工厂体顶层，不在 `apply(ctx)` 的闭包里，所以不能直接用 `ctx`——
 * 那是个未声明的标识符，`ctx?.x` 一样会抛 ReferenceError（可选链救不了未声明变量）。
 * 早先就这么写错了：一次 list 直接抛出去、promise 永不 resolve，面板停在「正在读…」。
 * 由 `apply` 在注册面板前调 `setDiaryHost(ctx)` 注入。
 */
let diaryHostCtx = null;

function setDiaryHost(ctx) {
  diaryHostCtx = ctx;
}

/**
 * 调一次服务端。
 *
 * 宿主把插件 RPC 挂在 `/api` 下（见 client.js 里 restart 那次调用），信封由 rpc.call 组装。
 * 失败一律折成 `{ ok: false, error }`，让调用方只需要看一个字段。
 */
async function diaryCall(payload) {
  try {
    const rpc = diaryHostCtx?.connection?.rpc;
    if (!rpc || typeof rpc.call !== 'function') {
      return { ok: false, error: { code: 'diary/rpc', message: '当前宿主没有提供 RPC 通道。' } };
    }
    const result = await rpc.call('/api', DIARY_RPC_METHOD, payload);
    if (result && typeof result === 'object' && typeof result.ok === 'boolean') return result;
    // 宿主把服务端的 server-response 原样转回来，result 就是内层那个 { ok, value }。
    return { ok: false, error: { code: 'diary/rpc', message: `返回格式不认识：${JSON.stringify(result).slice(0, 200)}` } };
  } catch (error) {
    return { ok: false, error: { code: 'diary/rpc', message: String(error?.message ?? error) } };
  }
}

function DiaryPanel() {
  const [state, setState] = React.useState({ loading: true, items: [], dir: '', error: '' });
  const [selected, setSelected] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [renaming, setRenaming] = React.useState('');
  // 新建用面板里的输入框问名字：Electron 里 window.prompt 是空操作，点了不会弹任何东西。
  const [creating, setCreating] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  // 删除要按两下：第一下变成「确认删」，三秒内再按才真删。
  const [confirmDelete, setConfirmDelete] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async (keepName) => {
    const listed = await diaryCall({ action: 'list' });
    if (listed.ok !== true) {
      setState({ loading: false, items: [], dir: '', error: `${listed.error?.code ?? 'diary/failed'}: ${listed.error?.message ?? ''}` });
      return [];
    }
    const items = Array.isArray(listed.value?.items) ? listed.value.items : [];
    setState({ loading: false, items, dir: listed.value?.dir ?? '', error: '' });
    const wanted = keepName ?? selected;
    if (wanted !== '' && items.some(item => item.name === wanted)) return items;
    return items;
  }, [selected]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const listed = await diaryCall({ action: 'list' });
      if (!alive) return;
      if (listed.ok !== true) {
        setState({ loading: false, items: [], dir: '', error: `${listed.error?.code ?? 'diary/failed'}: ${listed.error?.message ?? ''}` });
        return;
      }
      const items = Array.isArray(listed.value?.items) ? listed.value.items : [];
      setState({ loading: false, items, dir: listed.value?.dir ?? '', error: '' });
      // 打开面板默认落在最近改过的那篇，省一次点击。
      if (items.length > 0) {
        const first = items[0].name;
        const read = await diaryCall({ action: 'read', name: first });
        if (!alive) return;
        if (read.ok === true) {
          setSelected(first);
          setDraft(read.value?.text ?? '');
          setDirty(false);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const open = async (name) => {
    if (busy) return;
    // 不用 window.confirm：Electron 里它不可靠（见新建那段的说明），拦住的分支可能永远为真，
    // 结果就是点了别的日记纹丝不动。切走时直接丢弃未保存的改动，并在状态行说明白。
    const droppedEdits = dirty;
    setBusy(true);
    const read = await diaryCall({ action: 'read', name });
    setBusy(false);
    if (read.ok !== true) { setNote(`打不开：${read.error?.message ?? ''}`); return; }
    setSelected(name);
    setDraft(read.value?.text ?? '');
    setDirty(false);
    setNote(droppedEdits ? `上一篇没保存的改动已丢弃` : '');
    setConfirmDelete('');
    setRenaming('');
  };

  const save = async () => {
    if (selected === '' || busy) return;
    setBusy(true);
    const written = await diaryCall({ action: 'write', name: selected, content: draft });
    setBusy(false);
    if (written.ok !== true) { setNote(`保存失败：${written.error?.message ?? ''}`); return; }
    setDirty(false);
    setNote('已保存');
    await refresh(selected);
  };

  /**
   * 把 `阅读[名字]` 复制到剪贴板。
   *
   * navigator.clipboard 要求安全上下文，DSH 是 http://127.0.0.1，算安全上下文；万一宿主换了
   * 别的地址或接口被禁，退回 execCommand 那条老路，别让按钮变成点了没反应。
   */
  const copyNamed = async (name) => {
    if (typeof name !== 'string' || name === '') return;
    const text = diaryReadCommand(name);
    try {
      await navigator.clipboard.writeText(text);
      setNote(`已复制 ${text}`);
      return;
    } catch { /* 落到下面的兜底 */ }
    try {
      const holder = document.createElement('textarea');
      holder.value = text;
      holder.setAttribute('readonly', '');
      holder.style.position = 'fixed';
      holder.style.opacity = '0';
      document.body.appendChild(holder);
      holder.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(holder);
      setNote(copied ? `已复制 ${text}` : `复制失败，手动抄一下：${text}`);
    } catch {
      setNote(`复制失败，手动抄一下：${text}`);
    }
  };

  /**
   * 新建。
   *
   * 早先这里用 window.prompt 问名字——在 Electron 里它是空操作：宿主没有实现 prompt，
   * 调用直接返回 null，于是「新建日记」点了毫无反应。名字改在面板里用输入框问。
   * 传进来的名字是空串就交给服务端排号（日记 / 日记(1) / 日记(2)…）。
   */
  const create = async (rawName) => {
    if (busy) return;
    setBusy(true);
    const created = await diaryCall({ action: 'create', name: typeof rawName === 'string' ? rawName.trim() : '' });
    setBusy(false);
    if (created.ok !== true) { setNote(`新建失败：${created.error?.message ?? ''}`); return; }
    const actual = created.value?.name ?? '';
    setSelected(actual);
    setDraft(created.value?.text ?? '');
    setDirty(false);
    setCreating(false);
    setCreateName('');
    setNote(`已新建「${actual}」`);
    await refresh(actual);
  };

  const rename = async () => {
    const wanted = renaming.trim();
    if (wanted === '' || selected === '' || busy) return;
    setBusy(true);
    const renamed = await diaryCall({ action: 'rename', name: selected, next: wanted });
    setBusy(false);
    if (renamed.ok !== true) { setNote(`改名失败：${renamed.error?.message ?? ''}`); return; }
    const actual = renamed.value?.name ?? wanted;
    setSelected(actual);
    setRenaming('');
    setNote(`已改名为「${actual}」`);
    await refresh(actual);
  };

  const drop = async () => {
    if (selected === '' || busy) return;
    if (confirmDelete !== selected) {
      setConfirmDelete(selected);
      setTimeout(() => setConfirmDelete(current => (current === selected ? '' : current)), 3000);
      return;
    }
    setBusy(true);
    const removed = await diaryCall({ action: 'remove', name: selected });
    setBusy(false);
    setConfirmDelete('');
    if (removed.ok !== true) { setNote(`删除失败：${removed.error?.message ?? ''}`); return; }
    setSelected('');
    setDraft('');
    setDirty(false);
    setNote('已删除');
    await refresh('');
  };

  const items = state.items;
  // 列表里一条：左半边点开，右半边那个小图标复制 `阅读[名字]`。
  // 复制做成行内图标而不是选中后再去顶栏按，是因为用户真正想要的是「不打开也能把指令拿出来」。
  // 外层仍是 button，内层用 span 接 onClick 并 stopPropagation，避免嵌套 button（非法结构）。
  const listRow = item => h('button', {
    key: item.name,
    type: 'button',
    onClick: () => open(item.name),
    title: `${item.name} · ${item.bytes} 字节`,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      width: '100%',
      textAlign: 'left',
      padding: '7px 8px 7px 10px',
      margin: '0 0 2px',
      border: 0,
      borderRadius: '8px',
      cursor: 'pointer',
      color: item.name === selected ? 'var(--cg-text)' : 'var(--dsw-alias-label-secondary)',
      background: item.name === selected ? 'var(--cg-hover)' : 'transparent',
      font: 'inherit',
      fontSize: '13px'
    }
  }, [
    h('span', {
      key: 'label',
      style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
    }, item.title || item.name),
    h('span', {
      key: 'copy',
      role: 'button',
      title: `复制 ${diaryReadCommand(item.name)}`,
      'aria-label': `复制 ${diaryReadCommand(item.name)}`,
      onClick: event => { event.stopPropagation(); copyNamed(item.name); },
      style: { flex: 'none', display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'pointer', opacity: 0.55 }
    }, h('svg', {
      width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
    }, [
      h('rect', { key: 'r', x: 9, y: 9, width: 11, height: 11, rx: 2 }),
      h('path', { key: 'p', d: 'M5 15V6a2 2 0 0 1 2-2h9' })
    ]))
  ]);

  return h('div', {
    style: { display: 'flex', height: '100%', minHeight: 0, color: 'var(--dsw-alias-label-primary)', background: 'var(--cg-main-bg, transparent)' }
  }, [
    h('div', {
      key: 'list',
      style: { width: '218px', flex: 'none', borderRight: '1px solid var(--cg-border)', display: 'flex', flexDirection: 'column', minHeight: 0 }
    }, [
      h('div', { key: 'head', style: { padding: '12px 12px 8px', fontSize: '13px', fontWeight: 600 } }, 'Agent 日记'),
      h('div', { key: 'new', style: { padding: '0 10px 8px' } },
        creating
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
            h('input', {
              key: 'name',
              value: createName,
              autoFocus: true,
              placeholder: '留空就叫「日记」',
              onChange: event => setCreateName(event.target.value),
              onKeyDown: event => {
                if (event.key === 'Enter') create(createName);
                if (event.key === 'Escape') { setCreating(false); setCreateName(''); }
              },
              style: {
                width: '100%', boxSizing: 'border-box', padding: '5px 9px', borderRadius: '7px',
                font: 'inherit', fontSize: '12px',
                border: '1px solid var(--cg-border)',
                background: 'var(--dsw-specific-input-major, transparent)',
                color: 'var(--cg-text)'
              }
            }),
            h('div', { key: 'actions', style: { display: 'flex', gap: '6px' } }, [
              h('button', {
                key: 'ok', type: 'button', onClick: () => create(createName), disabled: busy,
                style: { flex: 1, padding: '5px 10px', borderRadius: '7px', cursor: busy ? 'default' : 'pointer', border: '1px solid var(--cg-border)', background: 'var(--cg-hover)', color: 'var(--cg-text)', font: 'inherit', fontSize: '12px' }
              }, '建'),
              h('button', {
                key: 'cancel', type: 'button', onClick: () => { setCreating(false); setCreateName(''); },
                style: { flex: 1, padding: '5px 10px', borderRadius: '7px', cursor: 'pointer', border: '1px solid var(--cg-border)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: '12px' }
              }, '取消')
            ])
          ])
          : h('button', {
            type: 'button',
            onClick: () => { setCreating(true); setCreateName(''); },
            disabled: busy,
            style: {
              width: '100%', padding: '6px 10px', borderRadius: '8px', cursor: busy ? 'default' : 'pointer',
              border: '1px solid var(--cg-border)', background: 'transparent', color: 'var(--cg-text)', font: 'inherit', fontSize: '12px'
            }
          }, '新建日记')),
      h('div', { key: 'rows', style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 12px' } },
        state.loading
          ? h('div', { style: { padding: '8px 10px', fontSize: '12px', color: 'var(--cg-muted)' } }, '正在读…')
          : state.error !== ''
            // RPC 失败必须说出来。早先这里没有这一支，路由一坏就显示成「还没有日记」，
            // 把故障说成了空状态，看的人只会以为是自己没建过。
            ? h('div', { style: { padding: '8px 10px', fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, #f25a5a)', lineHeight: 1.6, wordBreak: 'break-word' } }, `读不到日记：${state.error}`)
            : items.length === 0
              ? h('div', { style: { padding: '8px 10px', fontSize: '12px', color: 'var(--cg-muted)', lineHeight: 1.6 } }, '还没有日记。点上面「新建日记」起一篇。')
              : items.map(listRow))
    ]),
    h('div', {
      key: 'editor',
      style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }
    }, selected === ''
      ? [h('div', {
        key: 'empty',
        style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cg-muted)', fontSize: '13px', padding: '24px', textAlign: 'center', lineHeight: 1.8 }
      }, items.length === 0
        ? '日记用来给下一个 Agent 交接现场：改了什么、用户的情绪和反馈、动了哪些重要文件、哪些还没做完。\n先在左边新建一篇。'
        : '左边选一篇开始看，或者新建一篇。')]
      : [
        h('div', {
          key: 'bar',
          style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderBottom: '1px solid var(--cg-border)', flexWrap: 'wrap' }
        }, [
          h('span', { key: 'name', style: { fontSize: '13px', fontWeight: 600 } }, selected),
          dirty ? h('span', { key: 'dirty', style: { fontSize: '11px', color: 'var(--cg-muted)' } }, '未保存') : null,
          h('span', { key: 'spacer', style: { flex: 1 } }),
          note === '' ? null : h('span', { key: 'note', style: { fontSize: '11px', color: 'var(--cg-muted)' } }, note),
          h('button', {
            key: 'copy', type: 'button', onClick: () => copyNamed(selected), disabled: busy,
            title: `复制「${diaryReadCommand(selected)}」，粘到会话里 Agent 就会读这一篇`,
            style: {
              padding: '5px 10px', borderRadius: '7px', font: 'inherit', fontSize: '12px',
              cursor: busy ? 'default' : 'pointer', border: '1px solid var(--cg-border)',
              background: 'transparent', color: 'var(--cg-text)'
            }
          }, '复制指令'),
          h('button', {
            key: 'save', type: 'button', onClick: save, disabled: busy || !dirty,
            style: {
              padding: '5px 12px', borderRadius: '7px', font: 'inherit', fontSize: '12px',
              cursor: busy || !dirty ? 'default' : 'pointer',
              border: '1px solid var(--cg-border)',
              background: dirty ? 'var(--cg-hover)' : 'transparent',
              color: 'var(--cg-text)', opacity: dirty ? 1 : 0.5
            }
          }, '保存'),
          h('button', {
            key: 'rename', type: 'button',
            onClick: () => setRenaming(renaming === '' ? selected : ''),
            disabled: busy,
            style: { padding: '5px 10px', borderRadius: '7px', font: 'inherit', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--cg-border)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }
          }, '改名'),
          h('button', {
            key: 'delete', type: 'button', onClick: drop, disabled: busy,
            style: {
              padding: '5px 10px', borderRadius: '7px', font: 'inherit', fontSize: '12px', cursor: 'pointer',
              border: '1px solid var(--cg-border)',
              background: confirmDelete === selected ? 'var(--dsw-alias-state-error-primary, #f25a5a)' : 'transparent',
              color: confirmDelete === selected ? '#ffffff' : 'var(--dsw-alias-label-secondary)'
            }
          }, confirmDelete === selected ? '确认删?' : '删除')
        ]),
        renaming === '' ? null : h('div', {
          key: 'renamebar',
          style: { display: 'flex', gap: '8px', padding: '8px 14px', borderBottom: '1px solid var(--cg-border)' }
        }, [
          h('input', {
            key: 'input',
            value: renaming,
            autoFocus: true,
            onChange: event => setRenaming(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') rename();
              if (event.key === 'Escape') setRenaming('');
            },
            style: {
              flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: '7px', font: 'inherit', fontSize: '12px',
              border: '1px solid var(--cg-border)', background: 'var(--dsw-specific-input-major, transparent)', color: 'var(--cg-text)'
            }
          }),
          h('button', {
            key: 'ok', type: 'button', onClick: rename,
            style: { padding: '5px 12px', borderRadius: '7px', font: 'inherit', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--cg-border)', background: 'var(--cg-hover)', color: 'var(--cg-text)' }
          }, '确定')
        ]),
        h('textarea', {
          key: 'text',
          value: draft,
          spellCheck: false,
          onChange: event => { setDraft(event.target.value); setDirty(true); setNote(''); },
          onKeyDown: event => {
            // Ctrl+S 保存：在这个面板里改字的人几乎都会先试一下。
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault();
              save();
            }
          },
          style: {
            flex: 1, minHeight: 0, resize: 'none', outline: 'none',
            padding: '14px 16px 40px', border: 0,
            background: 'transparent', color: 'var(--cg-text)',
            font: '13px/1.75 var(--dsw-font-family-code, ui-monospace, monospace)',
            tabSize: 2
          }
        })
      ])
  ]);
}
