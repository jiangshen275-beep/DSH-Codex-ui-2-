// request(payload) must return the host RPC result {ok,value,error}.
export function startAuthorizedResume(ctx, {
  request,
  now = Date.now,
  setTimeout: schedule = setTimeout,
  clearTimeout: cancel = clearTimeout,
  intervalMs = 1500,
  maxAttempts = 120,
  maxDurationMs = 5 * 60 * 1000,
  clientId = globalThis.crypto?.randomUUID?.() ?? `resume-${Date.now()}-${Math.random()}`
} = {}) {
  // Minimal/teardown contexts cannot deliver a session prompt; do not leave polling handles.
  if (typeof ctx?.sessions?.using !== 'function' || typeof ctx?.connection?.rpc?.call !== 'function') return () => {};
  if (typeof request !== 'function') throw new TypeError('Authorized resume request function required');
  let disposed = false, timer = null, attempts = 0, delivered = null;
  const started = now();
  const delay = Math.max(1000, Math.min(2000, intervalMs));
  const limit = Math.max(1, Math.min(1200, Number.isSafeInteger(maxAttempts) ? maxAttempts : 120));
  const duration = Math.max(1000, Math.min(24 * 60 * 60 * 1000, maxDurationMs));
  const again = () => {
    if (!disposed && attempts < limit && now() - started < duration) timer = schedule(tick, delay);
  };
  const tick = async () => {
    timer = null;
    if (disposed) return;
    attempts += 1;
    try {
      if (!delivered) {
        const result = await request({ action: 'claim', clientId });
        if (disposed) return;
        if (result?.ok === true && result.terminal === true) { disposed = true; return; }
        const item = result?.ok === true ? result.value : null;
        if (!item || typeof item.requestId !== 'string' || !item.requestId || typeof item.sessionId !== 'string' || !item.sessionId || typeof item.message !== 'string' || !item.message.trim()) { again(); return; }
        const accepted = await ctx.sessions.using(item.sessionId, { source: 'controllerOperation' }, reference =>
          reference.binding.session.prompt([{ type: 'text', text: item.message }], 'queue'));
        if (accepted?.ok === false || accepted === false) { again(); return; }
        // Preserve this before ACK. Network retry must never resend an already accepted prompt.
        delivered = item;
        if (disposed) return;
      }
      const ack = await request({ action: 'ack', requestId: delivered.requestId, clientId });
      if (ack?.ok === true && ack.value?.acknowledged === true) { disposed = true; return; }
    } catch { /* Keep manifest unacknowledged; bounded retry survives transient RPC errors. */ }
    again();
  };
  const dispose = () => { disposed = true; if (timer !== null) cancel(timer); timer = null; };
  timer = schedule(tick, delay);
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose);
  return dispose;
}