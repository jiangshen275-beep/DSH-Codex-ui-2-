/** 4.1: resolve CSS-module identities at runtime, never patch the host archive. */
export const CG_LEGACY_MODULES = {
  '@deepseek-ai/dsh-client-ui-layout/AppFrame.module.css': ['BynINW_frame','BynINW_centerCol','BynINW_sidebarCol','BynINW_rightbarCol','BynINW_handle'],
  '@deepseek-ai/dsh-client-ui-conversation/ConversationRoot.module.css': ['Dc7zOa_root','Dc7zOa_composerStack','Dc7zOa_composerSeat','Dc7zOa_embeddedBody','Dc7zOa_scrollBody','Dc7zOa_composerHero','Dc7zOa_heroWorkspaceRow'],
  '@deepseek-ai/dsh-client-ui-conversation/InputBar.module.css': ['RlGAzG_root','RlGAzG_dock','RlGAzG_hero','RlGAzG_row','RlGAzG_tools','RlGAzG_modes','RlGAzG_trailing','RlGAzG_add','RlGAzG_primary'],
  '@deepseek-ai/dsh-client-ui-conversation/QueueDock.module.css': ['v1kfCW_row','v1kfCW_file','v1kfCW_thumb'],
  '@deepseek-ai/dsh-client-ui-message-feedback/MessageFeedbackActions.module.css': ['vpunvW_action'],
  '@deepseek-ai/dsh-client-ui-chat/ReasoningRow.module.css': ['_3GBCTG_root'],
  '@deepseek-ai/dsh-client-ui-trajectory/TrajectoryTable.module.css': ['haSm5q_thinkingToggle'],
  '@deepseek-ai/dsh-client-ui-permission-presets/PermissionSelect.module.css': ['iWlSmW_trigger','iWlSmW_chevron'],
};

export function cgHostClassAliases(styleEntries) {
  const aliases = new Map();
  for (const entry of styleEntries) {
    const legacy = CG_LEGACY_MODULES[entry.id];
    if (!legacy) continue;
    const present = [...new Set([...entry.css.matchAll(/\.([_a-zA-Z][_a-zA-Z0-9-]*)/g)].map(m => m[1]))];
    for (const oldName of legacy) {
      const suffix = oldName.slice(oldName.indexOf('_', oldName.startsWith('_') ? 1 : 0) + 1);
      const candidates = present.filter(name => name.endsWith('_' + suffix));
      if (candidates.length === 1 && candidates[0] !== oldName) aliases.set(candidates[0], oldName);
    }
  }
  return aliases;
}

export function startHostUpgradeCompat(ctx) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const key = '__cgHostUpgradeCompatStop';
  window[key]?.();
  let aliases = new Map(), frame = 0;
  const pending = new Set();
  const tagSelector = 'style[data-plugin-css]';
  function adapt(root) {
    if (!root || root.nodeType !== 1 || !aliases.size) return;
    const apply = node => {
      for (const cls of [...node.classList]) {
        const old = aliases.get(cls);
        if (old && !node.classList.contains(old)) node.classList.add(old);
      }
    };
    apply(root);
    // Query only host classes that actually need adapting, not every element per mutation.
    const selector = [...aliases.keys()].map(name => '.' + name).join(',');
    if (selector) for (const node of root.querySelectorAll(selector)) apply(node);
  }
  function readStyles() {
    const next = cgHostClassAliases([...document.querySelectorAll(tagSelector)].map(tag => ({ id: tag.dataset.pluginCss, css: tag.textContent ?? '' })));
    const signature = JSON.stringify([...next]);
    if (signature === JSON.stringify([...aliases])) return;
    aliases = next;
    adapt(document.body);
    document.documentElement.dataset.cgHostCompat = '4.1.0';
  }
  const flush = () => {
    frame = 0;
    for (const root of pending) adapt(root);
    pending.clear();
  };
  const schedule = root => {
    pending.add(root);
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const headObserver = new MutationObserver(readStyles);
  headObserver.observe(document.head ?? document.documentElement, { childList: true, subtree: true, characterData: true });
  const bodyObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') schedule(record.target);
      else for (const node of record.addedNodes) if (node.nodeType === 1) schedule(node);
    }
  });
  bodyObserver.observe(document.body ?? document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  readStyles();
  const stop = () => {
    headObserver.disconnect(); bodyObserver.disconnect();
    if (frame) cancelAnimationFrame(frame);
    pending.clear();
    if (window[key] === stop) delete window[key];
  };
  window[key] = stop;
  if (typeof ctx.effect === 'function') ctx.effect(() => stop);
}

export const CG_PERMISSION_COPY = {
  'workspace-write': { label: '请求批准', detail: '编辑外部文件和使用互联网时始终询问' },
  auto: { label: '帮我批准', detail: '仅对检测到的风险操作请求批准' },
  review: { label: '帮我批准', detail: '仅对检测到的风险操作请求批准' },
  'danger-full-access': { label: '完全访问权限', detail: '可不受限制地访问互联网和你电脑上的任何文件' },
};
export function cgPermissionItems(items) {
  const order = ['workspace-write', 'review', 'auto', 'danger-full-access'];
  // Unknown host-defined options remain available. Only the explicitly retired read-only UI option is hidden.
  return items.filter(item => item.id !== 'read-only').slice().sort((a,b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
  });
}
export function cgPermissionTree(node, R) {
  if (!R.isValidElement(node)) return node;
  const props = node.props;
  if (Array.isArray(props.items) && props.items.some(item => CG_PERMISSION_COPY[item.id])) {
    const items = cgPermissionItems(props.items).map(item => {
      const copy = CG_PERMISSION_COPY[item.id];
      if (!copy) return item;
      return { ...item, label: R.createElement('span', { className: 'cg-permission-copy' },
        R.createElement('span', { className: 'cg-permission-name' }, copy.label,
          item.id === 'auto' && R.createElement('small', { className: 'cg-permission-exp' }, 'EXP')),
        R.createElement('span', { className: 'cg-permission-description' }, copy.detail)) };
    });
    let anchor = props.anchor;
    if (R.isValidElement(anchor)) {
      const value = props.selectedId;
      const label = value === 'danger-full-access' ? '完全访问' : CG_PERMISSION_COPY[value]?.label;
      const children = R.Children.map(anchor.props.children, child => {
        if (!R.isValidElement(child) || !String(child.props.className ?? '').split(/\s+/).some(cls => cls.endsWith('_triggerLabel'))) return child;
        return label ? R.cloneElement(child, {}, label) : child;
      });
      anchor = R.cloneElement(anchor, { 'data-cg-permission-trigger': '', ...(label ? { 'aria-label': `更改权限，当前：${label}` } : {}) }, children);
    }
    // Keep native Menu, onSelect, onClose, disabled state and RiskConfirmation untouched.
    return R.createElement('span', { className: 'cg-permission-control' }, R.cloneElement(node, { items, anchor }));
  }
  if (props.children === undefined) return node;
  return R.cloneElement(node, {}, R.Children.map(props.children, child => cgPermissionTree(child, R)));
}
export function registerPermissionUpgradeCompat(ctx) {
  // Do not inject a dependency on the same slot we replace: registration changes that
  // dependency and can prevent the client entry from ever settling on a cold boot.
  let stopped = false, timer = 0, dispose, attempts = 0;
  const install = () => {
    if (stopped) return;
    const entries = ctx.slots.entries('conversation.input.permission');
    if (entries.some(entry => entry.component?.cgPermissionCompat)) return;
    const native = entries.find(entry => typeof entry.component === 'function' && entry.component.name !== 'PermissionCompat');
    if (!native) { if (++attempts < 12) timer = setTimeout(install, 500); return; }
    function PermissionCompat(props) {
      return cgPermissionTree(native.component(props), React);
    }
    PermissionCompat.cgPermissionCompat = true;
    try {
      dispose = ctx.slots.register({ ...native.options, name: 'conversation.input.permission', priority: -20,
        locale: native.locale, store: native.store, inject: native.inject }, PermissionCompat);
    } catch (error) {
      console.warn('[dsh-codex-ui] permission presentation unavailable:', error);
    }
  };
  timer = setTimeout(install, 0);
  ctx.effect(() => () => { stopped = true; clearTimeout(timer); if (typeof dispose === 'function') dispose(); });
}