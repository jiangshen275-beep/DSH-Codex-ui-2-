// 「助手停下来等你」的提示音。
//
// 为什么需要它：助手提问或请求批准时，界面只是安静地换成一张卡。人不看屏幕就完全不知道
// 自己被等着了 —— 实际发生过很多次：「我以为你还在跑，结果你一直卡在提问上」。
// 所以这条链不播「任务结束」那声，播的是一个专门的疑问音（一声往上滑的「嗯？」，
// 见 playQuestionTone）。
//
// 判据为什么用投影而不是 DOM：提问卡是接管 composer 渲染的（宿主 `conversation.composer`
// slot，根节点 `data-question-key`），所以 DOM 里只存在**当前这一条会话**的提问。而人恰恰
// 在切到别的会话、或最小化的时候才需要被叫 —— 那一刻 DOM 里什么都没有。宿主自己维护了一份
// 跨会话的服务端投影 `userQuestions`（`dsh-client-ui-user-questions` 的
// `binding.session.projections.faceOf("userQuestions")`，`active[].state === "open"` 就是
// 「还等着人回答」），它不随视图切换消失，所以以它为准。
//
// 提醒方式按用户明确要求：出现时响一次，之后每 20 秒补一声，直到这件事被处理掉。

/** 补响间隔。用户选的是「响一次，隔二十秒再补一声，直到我处理」。 */
const ASK_REPEAT_MS = 20000;
/** 补响上限。设了它是为了「人去睡了」这种情况：一直响通宵不是提醒，是折磨。 */
const ASK_MAX_MS = 30 * 60 * 1000;

/**
 * 一个音，往上滑：392 → 660 Hz，0.34 秒。听起来就是「嗯？」。
 *
 * 音色不是纯正弦：纯正弦在笔记本小喇叭上会发闷，听不清。这里叠了二次谐波 0.22、
 * 三次谐波 0.08（用 PeriodicWave 一次成型），基波 392–660 加上泛音正好落在喇叭能听见的段。
 * 频率走高而不是走低，是因为问句的语调天生往上翘 —— 平的一声像通知，往下掉像结束。
 */
let askToneCtx = null;
let askToneLast = 0;

/** 谐波表只跟 AudioContext 绑定，建一次反复用；存在 ctx 上，ctx 重建时自然失效。 */
function askToneWave(ctx) {
  if (ctx.__cgAskWave !== undefined) return ctx.__cgAskWave;
  let wave = null;
  try {
    if (typeof ctx.createPeriodicWave === 'function') {
      // 实部（cos 系数）全 0，虚部（sin 系数）就是要叠的谐波。
      wave = ctx.createPeriodicWave(
        new Float32Array([0, 0, 0, 0]),
        new Float32Array([0, 1, 0.22, 0.08]),
        { disableNormalization: false },
      );
    }
  } catch {
    // 造不出波表就退回普通正弦，宁可音色差一点，也不能没声。
  }
  ctx.__cgAskWave = wave;
  return wave;
}

function askToneVoice(ctx, at, f0, f1, dur) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const wave = askToneWave(ctx);
  if (wave === null) osc.type = 'sine';
  else osc.setPeriodicWave(wave);
  osc.frequency.setValueAtTime(f0, at);
  // 线性上滑：指数滑音听上去像「啾」，线性才像人把尾音抬起来。
  osc.frequency.linearRampToValueAtTime(f1, at + dur);
  const peak = 0.5;
  // 头 8ms 起振：从零直接跳上去会「啪」一声，这点时间听不出来但能消掉爆音。
  // 0.55 之后开始收尾，最后 6ms 归零，防止截断产生咔哒。
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.008);
  gain.gain.setValueAtTime(peak, at + dur * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.004, at + dur - 0.006);
  gain.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/**
 * 播一次。返回是否真的启动了。
 *
 * Electron 里不需要用户先点过页面：`webPreferences.autoplayPolicy` 缺省就是
 * `no-user-gesture-required`，本机 `lib/main.js` 五处 webPreferences 都没有改这个字段，
 * 启动命令行也没有 `--autoplay-policy`，所以 `AudioContext` 一创建就是 running。
 * 仍然留着 suspended → resume() 的兜底，那是给没有音频设备、或策略被改过的环境留的。
 */
export function playQuestionTone() {
  try {
    const now = Date.now();
    // 一秒内不重复：同一件事可能同时从投影和 DOM 两条路被看见。
    if (now - askToneLast < 900) return false;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (typeof AudioCtor !== 'function') return false;
    if (askToneCtx === null || askToneCtx.state === 'closed') askToneCtx = new AudioCtor();
    const ctx = askToneCtx;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        const resumed = ctx.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      } catch {
        // 起不来就算了，下面照常排音，能响就响。
      }
    }
    const at = ctx.currentTime + 0.02;
    askToneVoice(ctx, at, 392, 660, 0.34);
    askToneLast = now;
    return true;
  } catch {
    // 提示音不该变成页面上的错误，更不该拖累提问卡本身。
    return false;
  }
}

/**
 * 盯住「有没有事情在等我」。
 *
 * 投影里 `active[]` 每项带 `callId` 与 `state`：`open` 是还等着人回答，`continued` 是已经
 * 答过、会话接着往下跑（那种不该再叫）。只认 `open`。
 */
export function startAskAlert(ctx) {
  if (typeof document === 'undefined') return;

  // 热重载会让 apply 再跑一遍。旧订阅装在上一份闭包里，不会自己消失 —— 两个订阅就是一轮
  // 两声、两套补响。所以先拆掉上一次的。
  try {
    if (typeof window.__cgAskStop === 'function') window.__cgAskStop();
  } catch {
    // 拆不掉也继续，去抖还能兜住重复。
  }
  window.__cgAskStop = null;
  window.__cgAskSound = playQuestionTone;

  // 服务引用必须在**此刻**取出来存住，之后一概用这两个局部变量。
  //
  // 这是踩过的坑：cordis 的服务访问是带上下文活性检查的。`ctx.sessions` 在 apply 执行时
  // 是 active 的，可一旦在 store 的订阅回调、或者 setInterval 里再去读 `ctx.sessions`，
  // 当前 context 已经不是当初那个，直接抛
  // `cannot get required service "sessions" in inactive context` ——
  // 结果就是每 5 秒刷一条错误、一声都不响。取一次存住就没有这个问题。
  let sessions = null;
  try {
    sessions = ctx?.sessions ?? null;
  } catch {
    sessions = null;
  }

  // 真正管用的那个信号源：宿主自己记着「哪个会话此刻在等人」。
  //
  // 为什么换到它：投影那条路（`row.projectionValues.userQuestions`）在默认配置下是结构性死的。
  // tool-ask-user 的投影默认 `mode: 'legacy'`，请求头里不带 timed schema，于是
  // `dsh-user-questions\lib\types\projection.js:208` 的 `if (!fold.timed) return fold` 让
  // `active` 永远是空数组 —— 键在、值空，看起来一切正常，其实一条也读不到。
  //
  // `uiSession.sessionStatus` 不一样：它是宿主画那张卡的同一步写进去的
  // （`dsh-client-ui-session\lib\client.js:733-747` 的 `publish` → `publishPendingInteractions`
  // → `publishStatus`），卡画得出来它就一定有值，和投影 fold 无关，也不要求会话被 retain 过。
  let sessionStatus = null;
  try {
    sessionStatus = ctx?.uiSession?.sessionStatus ?? null;
  } catch {
    sessionStatus = null;
  }

  /** 当前还等着人的提问，key = 会话 id + callId。 */
  const waiting = new Set();
  /** 每个已绑定会话的投影订阅。 */
  const projectionStops = new Map();
  let repeatTimer = null;
  let scanTimer = null;
  let domTimer = null;
  // 先声明再赋值：detach 里要用它，而 detach 在这之后才可能被调用。
  let observer = null;
  let firstRingAt = 0;
  let scans = 0;
  let lastScanDetail = null;
  /** 第一次对账只是取基线，不响：插件加载时就已经开着的提问，人早就看见了。 */
  let primed = false;

  const rowsOf = snapshot => {
    if (snapshot === null || snapshot === undefined) return [];
    const byId = snapshot.byId;
    if (byId !== null && typeof byId === 'object') return Object.values(byId);
    return Array.isArray(snapshot.items) ? snapshot.items : [];
  };
  const idOf = row =>
    typeof row?.id === 'string' ? row.id : typeof row?.sessionId === 'string' ? row.sessionId : '';

  /**
   * 主取数路径：问宿主「现在哪个会话在等我」。
   *
   * `sessionStatus.getSnapshot()` 返回 `Map<sessionId, {running, pendingInteraction, completionUnread}>`。
   * `pendingInteraction` 就是那张卡本身（`PendingQuestion` 实例或审批的 pending），
   * 字段见 `dsh-client-ui-user-questions\lib\client.js:135-193`：
   * `kind`（question / plan-review，审批那边是 single）、`key`、`sessionId`、`callId`、`review`。
   *
   * `review` 有值的是「已经答完、只用来回看的只读卡」，那种不能叫。
   * `callId` 可能缺（宿主没带 wait 的阻塞请求），那时用 `key` 兜住身份。
   */
  const collect = () => {
    const keys = new Set();
    let pendingSeen = 0;
    let rows = [];
    try {
      rows = rowsOf(sessions?.list?.getSnapshot?.());
    } catch {
      rows = [];
    }
    lastScanDetail = { rows: rows.length, pending: 0, faces: 0 };

    // 主路径。
    const source = sessionStatus;
    if (source !== null && typeof source.getSnapshot === 'function') {
      let snapshot;
      try {
        snapshot = source.getSnapshot();
      } catch {
        snapshot = null;
      }
      if (snapshot instanceof Map) {
        for (const [id, status] of snapshot) {
          const pending = status?.pendingInteraction;
          if (pending === undefined || pending === null) continue;
          // 只读的历史卡（已经答完、只供回看）不该叫。
          if (pending.review !== undefined && pending.review !== null) continue;
          pendingSeen += 1;
          const identity = pending.callId ?? pending.key ?? '';
          keys.add(`${String(id)}|${String(identity)}`);
        }
        lastScanDetail.pending = pendingSeen;
      }
    }

    // 备路径：会话列表行自带的投影值。默认配置下 `active` 恒空（投影走 legacy fold），
    // 所以这条路正常时候什么都读不到 —— 留着是给「有一天它被开启」和「有会话真的带值」兜底。
    for (const row of rows) {
      const id = idOf(row);
      if (id === '') continue;
      let pv;
      try {
        pv = row?.projectionValues?.userQuestions;
      } catch {
        pv = undefined;
      }
      if (pv === undefined || pv === null) continue;
      for (const q of pv.active ?? []) {
        if (q === null || typeof q !== 'object') continue;
        if (q.state !== 'open') continue;
        keys.add(`${id}|${String(q.callId)}`);
      }
    }

    // 退路：DOM。**无条件跑**，不再被上面两条的「看得见」与否否决 ——
    // 早先那个 `sawProjection` 开关正是让一切静默的帮凶：只要某一行的投影对象存在
    // （哪怕 active 恒空），DOM 路就被永久关掉，而投影那条路本来就是死的。
    try {
      if (document.querySelector('[data-question-key], [data-approval-key]') !== null) keys.add('__dom__');
    } catch {
      // querySelector 不该抛，抛了也不能拖累主链路。
    }
    return keys;
  };

  const ring = () => {
    if (waiting.size === 0) return;
    if (Date.now() - firstRingAt > ASK_MAX_MS) return;
    playQuestionTone();
  };

  const scheduleRepeat = () => {
    if (waiting.size === 0) {
      if (repeatTimer !== null) clearTimeout(repeatTimer);
      repeatTimer = null;
      return;
    }
    // 已经排上了就别动它。巡检每 5 秒也会调到这里，若每次都重置计时器，
    // 补响就永远等不到 —— 那样「隔 20 秒再响一声」会静默失效。
    if (repeatTimer !== null) return;
    repeatTimer = setTimeout(() => {
      repeatTimer = null;
      if (waiting.size === 0) return;
      ring();
      scheduleRepeat();
    }, ASK_REPEAT_MS);
  };

  const reconcile = () => {
    scans += 1;
    const next = collect();
    const wasEmpty = waiting.size === 0;
    let appeared = false;
    for (const key of next) if (!waiting.has(key)) appeared = true;
    waiting.clear();
    for (const key of next) waiting.add(key);
    // 补响的截止时刻只在「从没有到有」时定一次。每次巡检都重设它（或者在有等待时清零），
    // 会让 ring() 里的超时判断永远成立或永远不成立——两种都是静默失效。
    if (waiting.size === 0) firstRingAt = 0;
    else if (wasEmpty) firstRingAt = Date.now();
    if (appeared) {
      // 首次对账只取基线；之后的「从无到有」才是真的有人新停下来等。
      if (primed) ring();
    }
    primed = true;
    // 投影那条路（face 订阅）已经证明是死的：默认 `mode:'legacy'` 下 fold 不更新时间，
    // 订阅挂上去也永远不会回调，只会在每次对账时白白跑一遍 binding 查找。所以这里不再
    // 逐个会话挂订阅，改由下面 sessionStatus 的单一订阅负责「立刻知道」。
    scheduleRepeat();
  };

  const detach = () => {
    if (repeatTimer !== null) clearTimeout(repeatTimer);
    repeatTimer = null;
    if (scanTimer !== null) clearInterval(scanTimer);
    scanTimer = null;
    if (domTimer !== null) clearTimeout(domTimer);
    domTimer = null;
    try {
      observer.disconnect();
    } catch {
      // 拆不掉不影响别的。
    }
    for (const stop of projectionStops.values()) stop();
    projectionStops.clear();
    try {
      if (typeof unsubscribeStatus === 'function') unsubscribeStatus();
    } catch {
      // 拆不掉不影响别的。
    }
    try {
      if (typeof unsubscribeList === 'function') unsubscribeList();
    } catch {
      // 同上。
    }
    waiting.clear();
  };
  window.__cgAskStop = detach;
  // 自检口：不靠猜「到底有没有人在等」，也不靠耳朵。
  window.__cgAskDiag = () => ({
    scans,
    primed,
    waiting: [...waiting],
    subscriptions: projectionStops.size,
    lastScan: lastScanDetail,
    hasSessions: sessions !== null && typeof sessions.binding === 'function',
    hasList: typeof sessions?.list?.subscribe === 'function',
    hasSessionStatus: sessionStatus !== null && typeof sessionStatus.subscribe === 'function',
  });

  const list = sessions?.list;
  let unsubscribeList = null;
  try {
    if (list !== undefined && list !== null && typeof list.subscribe === 'function') {
      unsubscribeList = list.subscribe(reconcile);
    }
  } catch {
    unsubscribeList = null;
  }

  // 推送路径：宿主一把卡挂上去，这里立刻就知道，不用等巡检。
  let unsubscribeStatus = null;
  try {
    if (sessionStatus !== null && typeof sessionStatus.subscribe === 'function') {
      unsubscribeStatus = sessionStatus.subscribe(reconcile);
    }
  } catch {
    unsubscribeStatus = null;
  }

  // 每 5 秒自己巡一遍。订阅是「快」的路，巡检是「不漏」的路：插件 apply 的那一刻
  // 宿主可能还没建好这个会话的 binding，list 也不一定再通知一次，那样就永远订阅不上、
  // 永远静默 —— 这正是第一次实测失败的样子。巡检让最坏情况只是慢 5 秒。
  scanTimer = setInterval(() => {
    try {
      reconcile();
    } catch {
      // 巡检里出错不能变成未捕获异常，否则宿主会把整条订阅链踢掉。
    }
  }, 5000);

  // 盯着 DOM 当最后一道保险。**无条件**观察：早先只在 list 订阅失败时才看 DOM，
  // 结果 list 订阅成功、但投影一条都读不到时，这条退路形同不存在，一处也不叫。
  // 120ms 合并：提问卡一出现会有几十次结构变动，逐次对账没必要。
  observer = new MutationObserver(() => {
    if (domTimer !== null) return;
    domTimer = setTimeout(() => {
      domTimer = null;
      try {
        reconcile();
      } catch {
        // 同上，不能让 DOM 观察把插件弄崩。
      }
    }, 120);
  });
  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch {
    // body 还没挂上就等下一次对账，不影响主链路。
  }

  reconcile();
}


