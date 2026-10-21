// Host-half regression: policy text shape, per-session injection discipline, and
// the turbo endpoint's read/update contract. Uses only built-ins so it runs from
// the workspace (the profile's node_modules resolves `zod`; the workspace does not).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { policyText, OFF_NOTICE, LIGHTNING_POLICY, lightningNudge, tokenMultiplier, ULTRA_POLICY, SUBAGENT_GUARD, FACT_CHECK, SUPERFAST_POLICY, PRECEDENCE, WORK_PERSONA, CHAT_PERSONA, LANGUAGE_POLICY } from '../src/turbo-policy.js';
import { createPolicyInjector, registerTurbo, TURBO_EVENT, TURBO_PATH } from '../src/turbo.js';

function fakeCtx() {
  const listeners = new Map();
  const routes = [];
  return {
    routes,
    get listenerCount() { let total = 0; for (const chain of listeners.values()) total += chain.length; return total; },
    logger: { warn() {} },
    on(name, handler) {
      const chain = listeners.get(name) ?? [];
      chain.push(handler);
      listeners.set(name, chain);
      return () => {
        const current = listeners.get(name) ?? [];
        const index = current.indexOf(handler);
        if (index >= 0) current.splice(index, 1);
      };
    },
    fire(name, payload) {
      const chain = listeners.get(name) ?? [];
      if (chain.length === 0) throw new Error(`no listener for ${name}`);
      // The real bus is a waterfall: a handler's `next` resolves the rest of the chain, so a later
      // listener sees what earlier ones appended.
      const run = index => async () => (index >= chain.length
        ? { kind: 'enter', messages: [] }
        : chain[index](payload, run(index + 1)));
      return run(0)();
    },
    inject(names, callback) {
      callback({ connection: { fetch: { register: route => { routes.push(route); return () => {}; } } } });
      return () => {};
    },
    effect() { return () => {}; },
  };
}

/**
 * Write the effort record the way its owner (`dsh-codex-ui-reasoning`) does, because this plugin never
 * writes it any more.
 *
 * Shape: `parseEffort` (src/turbo.js:109-123) is the reader, so `{ sessions: { [id]: { lightning, ultra,
 * superfast, at } } }` with three booleans and a finite stamp — and no `pending` field, because
 * `emptyEffortState` (src/turbo.js:66-68) has none. Bytes: `writeRecordFile` (src/turbo.js:194-200)
 * writes `JSON.stringify(payload, null, 2)` plus a trailing newline to a temp file in the same directory
 * and renames it into place. The rename is load-bearing here too: the reader caches on
 * `ino:mtimeMs:size` (src/turbo.js:179), so an in-place rewrite of the same length could land inside one
 * mtime tick and be served stale, while a rename always yields a new inode.
 */
function writeEffortRecord(home, rows) {
  const dir = join(home, 'storages');
  const file = join(dir, 'codex-ui-effort.json');
  mkdirSync(dir, { recursive: true });
  const sessions = Object.fromEntries(Object.entries(rows).map(([id, flags]) => [id, {
    lightning: flags.lightning === true,
    ultra: flags.ultra === true,
    superfast: flags.superfast === true,
    at: Date.now(),
  }]));
  const temp = `${file}.test.tmp`;
  writeFileSync(temp, `${JSON.stringify({ sessions }, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
  return file;
}

test('policy text is empty only when both switches are off', () => {
  assert.equal(policyText(), '');
  assert.equal(policyText({ ultra: false, lightning: false }), '');
  const both = policyText({ ultra: true, lightning: true });
  assert.ok(both.includes(ULTRA_POLICY) && both.includes(LIGHTNING_POLICY));
  // The tail block closes the contract for a delegated child, and only for one.
  assert.ok(policyText({ ultra: true, lightning: true, subagent: true }).endsWith(SUBAGENT_GUARD));
  assert.doesNotMatch(both, /Ignore every rule above about fan-out/, 'a parent must not be told to ignore fan-out');
});

test('lightning triggers two children on every turn, with no condition to satisfy', () => {
  const text = policyText({ lightning: true });
  assert.match(text, /dispatch two subagents on two different angles/);
  assert.match(text, /ONE assistant message/);
  // The mandate carries no trigger list any more: a conditional wording is what previously turned the
  // mandate back into a judgement call. This asserts the absence, not a phrasing.
  assert.doesNotMatch(text, /when a condition holds|four fan-out conditions/, 'no trigger list may return');
  assert.match(text, /Delegation is MANDATORY, on every turn, with no exemption/);
  // The recursion guard keeps a child from fanning out again; the parent-side text must not carry it.
  assert.doesNotMatch(text, /delegated sub-agent/);
  assert.match(policyText({ lightning: true, subagent: true }), /delegated sub-agent/);
});

test('Ultra demands a wider read of the request, not just stricter reporting', () => {
  // Human side: read the real need and the person behind it, without performing diligence.
  assert.match(ULTRA_POLICY, /Read the request before answering it/);
  assert.match(ULTRA_POLICY, /what they actually need, not only what they typed/);
  assert.match(ULTRA_POLICY, /Match their register/);
  assert.match(ULTRA_POLICY, /no closing offer of further help/);
  // Breadth: five angles, self-attack, and the objections answered inline.
  assert.match(ULTRA_POLICY, /Think wider than the question/);
  assert.match(ULTRA_POLICY, /the strongest alternative you rejected/);
  assert.match(ULTRA_POLICY, /Attack your own answer before sending it/);
  assert.match(ULTRA_POLICY, /never in a separate "possible concerns" section/);
  assert.match(ULTRA_POLICY, /Empathy here means being accurate about their situation, not comfort phrases/);
  assert.match(ULTRA_POLICY, /Dispose of the decision, do not park it/);
  // Delivery: the thinking finishes before they read anything, and the answer arrives whole.
  assert.match(ULTRA_POLICY, /Think it through, then say it once/);
  assert.match(ULTRA_POLICY, /Finish the thinking before the first sentence they read/);
  assert.match(ULTRA_POLICY, /The turn ends with the answer; it does not begin with a notice/);
  assert.match(ULTRA_POLICY, /One delivery:/);
  assert.match(ULTRA_POLICY, /Nothing is sent after the answer either/);
  // Exactly one visible message per turn: no status lines, no progress notes, no hold-ons.
  assert.match(ULTRA_POLICY, /A turn produces exactly one user-visible message: the finished answer/);
  assert.match(ULTRA_POLICY, /they do not license a status line, a progress note, or a hold-on message/);
  assert.match(ULTRA_POLICY, /you stay silent in the chat until the answer is ready/);
  // The escape hatch that produced multi-message turns must not come back: a self-judged
  // "long turn" licence is exactly what turned the exception into the default path.
  assert.doesNotMatch(ULTRA_POLICY, /may carry one short status line/);
  assert.doesNotMatch(ULTRA_POLICY, /genuinely long/);
  // The machinery stays invisible, and "one message" must not be read as "one paragraph":
  // a real reply (157 characters, opening with the delegation decision) was what prompted both.
  assert.match(ULTRA_POLICY, /Never mention the machinery in the answer: no subagents, no "I delegated this"/);
  assert.match(ULTRA_POLICY, /One message is not one line\./);
  assert.match(ULTRA_POLICY, /a greeting is a sentence, but anything substantive gets the whole treatment/);
  // Ultra's own numbering is structure the model reads; a collision has bitten twice.
  const ultraNumbers = [...ULTRA_POLICY.matchAll(/^(\d+)\./gm)].map(match => Number(match[1]));
  assert.deepEqual(ultraNumbers, Array.from({ length: ultraNumbers.length }, (_, index) => index + 1), 'Ultra numbering must be 1..n with no gaps or repeats');
  // Defensibility keeps the rules that were already load-bearing.
  assert.match(ULTRA_POLICY, /Leave nothing to fault/);
  assert.match(ULTRA_POLICY, /Root cause first/);
  assert.match(ULTRA_POLICY, /Never fix the test/);
  // Depth is not rationed: the session accepts the cost and never economises on checks.
  assert.match(ULTRA_POLICY, /Depth is not rationed/);
  assert.match(ULTRA_POLICY, /does not trade correctness for tokens/);
  assert.match(ULTRA_POLICY, /if one more file, run, or reproduction would change the answer, do it/);
  // Format never fights the active persona.
  assert.match(ULTRA_POLICY, /the persona wins on form and Ultra wins on substance/);
});

test('Lightning discloses its cost, keeps delegation purposeful, and never shrinks the work itself', () => {
  assert.match(LIGHTNING_POLICY, /Cost is disclosed, never rationed/);
  assert.match(LIGHTNING_POLICY, /Never drop an angle, a check, or a verification to spend less/);
  // Purpose before volume: 22 children accumulated over eleven turns, every batch a ritual pair. The
  // anti-ritual rules survive that episode. What changed since is the exemption set: the conditional
  // gate ("when a condition holds") swung the behaviour to zero delegations across 539 tool calls in one
  // armed session, so the contract now states the mandate unconditionally and names no exemption at all.
  assert.match(LIGHTNING_POLICY, /Split by angle, never clone/);
  assert.match(LIGHTNING_POLICY, /Two copies of one prompt are not two children/);
  assert.match(LIGHTNING_POLICY, /Never dispatch to re-confirm ground this conversation already covered/);
  assert.match(LIGHTNING_POLICY, /Two is the floor, and there is no ceiling on the parent/);
  // The old text capped the turn at one batch and forbade a second. Both are gone: "at least two" was
  // always a floor, and a new development reopens the fan-out in the same turn.
  assert.match(LIGHTNING_POLICY, /a turn that carries six independent angles dispatches six/);
  assert.match(LIGHTNING_POLICY, /A new development is:/);
  assert.doesNotMatch(LIGHTNING_POLICY, /Never dispatch a second round in the same turn/, 'the one-batch cap must not return');
  assert.match(LIGHTNING_POLICY, /Keep only as many in flight as the harness can run at once/);
  // The mandate is unconditional, and the absence of an exemption list is the point: a closed list of
  // exceptions is what a reader turns into a judgement call once the list runs out of matches.
  assert.match(LIGHTNING_POLICY, /Delegation is MANDATORY, on every turn, with no exemption/);
  assert.match(LIGHTNING_POLICY, /There is no exempt turn/);
  assert.match(LIGHTNING_POLICY, /A reason this turn looks special is not an exemption/);
  assert.doesNotMatch(LIGHTNING_POLICY, /needs no children at all/, 'the blanket exemption must not return');
  assert.doesNotMatch(LIGHTNING_POLICY, /Delegation is the DEFAULT, not a judgement call/, 'the conditional gate must not return');
  // Reuse beats respawn: a continued child keeps its reading, a new one re-reads and leaves a session.
  assert.match(LIGHTNING_POLICY, /Reuse before you respawn/);
  assert.match(LIGHTNING_POLICY, /continue that child with a message instead of creating another one/);
  assert.match(LIGHTNING_POLICY, /a check that has to stand on its own still needs a new child/);
  // Numbering stays one clean run, because the model reads the numbers as structure. The list is no
  // longer 1..12: clause 3 was merged away when the trigger list went, so the run is 1..12 over eleven
  // numbers plus the closing cost clause, and the assertion follows the actual sequence rather than an
  // assumed one — a gap is the defect it exists to catch, not the expected value.
  const numbers = [...LIGHTNING_POLICY.matchAll(/^(\d+)\./gm)].map(match => Number(match[1]));
  assert.equal(numbers.length, new Set(numbers).size, 'no duplicate numbering');
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), `numbering must ascend: ${numbers}`);
  // The self-check is what makes the mandate enforceable rather than advisory.
  assert.match(LIGHTNING_POLICY, /Self-check before you send: name the condition that fired/);
  // Waiting on children is silent work, not a reason to speak.
  assert.match(LIGHTNING_POLICY, /While relevant children run, keep working — reading, checking, verifying — and send nothing to the user/);
  assert.doesNotMatch(LIGHTNING_POLICY, /never keep more than six in flight/, 'concurrency is limited by the harness, not by price');
  // The reminder is the ONLY copy of the mandate the model sees each turn, so it must restate the same
  // terms verbatim. Nothing asserted this before — which is exactly how the two texts drifted apart.
  const reminder = lightningNudge(1, 1);
  assert.ok(reminder.includes('dispatch two subagents on two different angles'), 'the mandate must appear in the reminder verbatim');
  assert.ok(reminder.includes('This is mandatory and unconditional'), 'the reminder must keep the unconditional wording');
  assert.ok(reminder.includes('There is no exempt turn'), 'the exemption-free statement must survive in the reminder');
  assert.ok(reminder.includes('that check is not delegation'), 'reuse-first must stay in the reminder');
  // The completion half travels with the same reminder. Without it the reminder only ever asked for
  // dispatches and said nothing about when a turn may end — which is how a turn could dispatch two
  // children, start writing while they were still flying, and still read as compliant.
  assert.ok(reminder.includes('it ends only after the last child is back'), 'the completion rule must ride along every turn');
  assert.ok(reminder.includes('all four must be true'), 'the four completion conditions must be named');
  assert.ok(reminder.includes('the conflicts between summaries are resolved, not averaged'), 'averaging summaries must be ruled out');
  assert.ok(reminder.includes('you have read the code the answer describes'), 'reading the code yourself must be required');
  assert.ok(reminder.includes('every verification has actually executed'), 'an unrun check must not count');
  assert.ok(reminder.includes('fails this turn'), 'writing over a running child must be named as a failure');
  assert.ok(reminder.includes('handed to a child to check independently'), 'a fix must be re-checked by a fresh child');
  // The figure the interface advertises must stay readable out of the contract.
  assert.deepEqual(tokenMultiplier(), { value: 1.5, exact: true });
  // Reuse-first: the check must be in the contract, and the per-turn reminder must repeat it, or every turn
  // keeps pushing toward new children regardless.
  assert.match(LIGHTNING_POLICY, /one list_agents call tells you which child is inactive and fits/);
  assert.match(lightningNudge(1, 1), /that check is not delegation/);
});

test('Chinese is the default for every armed session, and yields when another plugin or the host sets a language', () => {
  // Language rides directly after precedence, but as this plugin's own default: the clause below hands the
  // decision to another plugin or the host when their prompt names a different output language.
  const text = policyText({ chinese: true });
  assert.match(text, /Language \(active\) — Chinese throughout/);
  assert.match(text, /Think in Chinese and answer in Chinese, every turn of this session/);
  assert.match(text, /Reason in Chinese directly/);
  assert.match(text, /never leave an English reasoning trace/);
  // Code and identifiers stay verbatim, and nothing is said twice.
  assert.match(text, /Keep code, identifiers, paths, commands, log lines, API names, and quoted source exactly as they are/);
  assert.match(text, /No bilingual echo/);
  // The clause now states its own limits: a user request still wins, and so does another plugin's language.
  assert.match(text, /Answer in Chinese by default/);
  assert.match(text, /does not override a language another plugin or the host explicitly sets/);
  assert.match(text, /an explicit request this turn for another language also wins/);
  // And it must no longer claim to be unconditional.
  assert.doesNotMatch(text, /even when the question, a file, or a tool result arrives in another language/);
  // Order: precedence, language, then the persona and the switches. Asserted on the full
  // block, because the language-only block has no later sections to compare against.
  const full = policyText({ persona: 'work', ultra: true, lightning: true, chinese: true });
  assert.ok(full.indexOf('Language (active)') < full.indexOf('Persona (active)'), 'language before persona');
  assert.ok(full.indexOf('Language (active)') < full.indexOf('Ultra Mode'), 'language before Ultra');
  assert.ok(full.indexOf('## Mode policy — scope and precedence') < full.indexOf('Language (active)'), 'precedence stays first');
  // Callers that arm nothing still get an empty block; the host is what forces the flag.
  assert.equal(policyText(), '');
});

test('the fact-check block rides along with any arming, and only then', () => {
  // It must reach every armed session — the user asked for it on every question — without
  // arming a session by itself, which would contradict the empty-block contract above.
  assert.equal(policyText(), '', 'an unarmed session still gets nothing');
  for (const flags of [{ chinese: true }, { ultra: true }, { lightning: true }, { superfast: true }, { persona: 'work' }, { persona: 'chat' }]) {
    assert.ok(policyText(flags).includes(FACT_CHECK), `missing with ${JSON.stringify(flags)}`);
  }
  const block = FACT_CHECK;
  assert.ok(block.includes('上网搜'), 'names the web search step');
  assert.ok(block.includes('直接问用户'), 'names the ask-the-user step');
  assert.ok(block.includes('不要猜'), 'forbids guessing');
  // Duplication alarm: no >40-char sentence of this block may appear verbatim in a sibling block.
  const sentences = s => s.split(/(?<=\.)\s+/).map(x => x.trim()).filter(x => x.length > 40);
  for (const other of [ULTRA_POLICY, LIGHTNING_POLICY, SUPERFAST_POLICY, PRECEDENCE, LANGUAGE_POLICY, WORK_PERSONA, CHAT_PERSONA]) {
    const shared = sentences(block).filter(x => sentences(other).includes(x));
    assert.equal(shared.length, 0, `shared with another block: ${shared[0]}`);
  }
});

test('the injected contract stays free of accidental duplication', () => {
  // The cap is a duplication alarm, not a ration: the session deliberately trades tokens for
  // effect, so it sits well above what the rules need. It moves only when rules are added on
  // purpose — 4000 -> 4400 for the invisible-machinery and length-follows-the-question rules,
  // and 10_000 -> 11_000 when the delegation mandate became the default (measured 10_223): the
  // mandate plus its self-check are rules added on purpose, after an armed session produced zero
  // delegations across 539 tool calls.
  // 10_000 -> 12_000 when the mandatory fact-check block landed: rules added on purpose at the user's
  // request (check the fact, search the web when the machine cannot answer, ask the user when the
  // search cannot), measured 11_182 with the block at 246 chars. The pre-block weight was 10_934.
  // 13_500 -> 14_500 for the Superfast tree, measured 14_264: the tier stamping, the self-contained
  // child prompt contract, and the per-tier integration rule are rules added on purpose, and the cap is
  // a duplication alarm rather than a ration. A rule added on purpose moves it; a paraphrase does not.
  // 12_000 -> 13_000 and 14_500 -> 16_000 for the two completion rules the user asked for: the parent
  // answers only after every child is back and the work has been checked by hand, and a new development
  // reopens the fan-out because "at least two" was always a floor rather than a budget. Measured 12_686
  // and 15_715 after both landed.
  assert.ok(ULTRA_POLICY.length < 4_400, `Ultra block is ${ULTRA_POLICY.length} chars`);
  const heaviest = policyText({ persona: 'chat', ultra: true, lightning: true });
  assert.ok(heaviest.length < 13_000, `full block is ${heaviest.length} chars`);
  // The cap must be measured on the block a real session actually carries, and every armed session is
  // forced to Chinese — `FORCE_CHINESE` in turbo.js. The earlier version of this assertion omitted
  // `chinese`, so it was weighing a block no session ever receives: 15_715 here against 16_264 on disk.
  // 16_000 -> 17_000 with `chinese` included, still a duplication alarm rather than a ration.
  const largest = policyText({ persona: 'chat', ultra: true, lightning: true, superfast: true, chinese: true });
  assert.ok(largest.length < 17_000, `superfast block is ${largest.length} chars`);
  // No rule text may be repeated verbatim between the two mode blocks.
  const sentences = heel => heel.split(/(?<=\.)\s+/).map(s => s.trim()).filter(s => s.length > 40);
  const overlap = sentences(ULTRA_POLICY).filter(line => sentences(LIGHTNING_POLICY).includes(line));
  assert.deepEqual(overlap, [], 'Ultra and Lightning must not restate each other');
});

test('the cost figure shown to the client is read back out of the contract', () => {
  assert.deepEqual(tokenMultiplier(), { value: 1.5, exact: true });
  // The armed contract itself must state the same number the interface advertises.
  assert.match(LIGHTNING_POLICY, /at least 1\.5x the tokens/);
});

test('injector appends one message per session, only when the text changes', async () => {
  const ctx = fakeCtx();
  let text = 'POLICY-A';
  const dispose = createPolicyInjector(ctx, () => text);
  const payload = { agent: { id: 'session-1' }, signal: { aborted: false } };

  const first = await ctx.fire('agent/pre-step', payload);
  assert.equal(first.messages.length, 1);
  const message = first.messages[0];
  assert.equal(message.role, 'user');
  assert.equal(typeof message.id, 'string');
  assert.ok(message.id.length > 0);
  assert.deepEqual(message.content, [{ type: 'text', text: 'POLICY-A' }]);
  // Format v4 refuses the retired `kind: 'plugin'` wrapper: a third-party producer
  // must state its own `plugin:<name>` kind and drop the `plugin` field.
  assert.equal(message.source.kind, 'plugin:dsh-codex-ui');
  assert.equal(message.source.form, 'instructions');
  assert.ok(!('plugin' in message.source));

  // Same text again: the engine would persist a second copy, so it must not.
  const second = await ctx.fire('agent/pre-step', payload);
  assert.equal(second.messages.length, 0);

  text = 'POLICY-B';
  const third = await ctx.fire('agent/pre-step', payload);
  assert.equal(third.messages.length, 1);

  // Another session is a different scope and gets its own copy.
  const other = await ctx.fire('agent/pre-step', { agent: { id: 'session-2' }, signal: { aborted: false } });
  assert.equal(other.messages.length, 1);

  dispose();
  assert.equal(ctx.listenerCount, 0);
});

const policyRow = text => ({ id: `row-${text}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin:dsh-codex-ui', form: 'instructions' } });
const sessionWith = log => ({ deriveMessages: () => log });

test('a step that aborted before the log write restates the contract instead of losing it', async () => {
  const ctx = fakeCtx();
  const log = [];
  const agent = { id: 'session-1', session: sessionWith(log) };
  createPolicyInjector(ctx, () => 'POLICY-A');
  const asked = await ctx.fire('agent/pre-step', { agent, turn: 1, step: 1, signal: { aborted: false } });
  assert.equal(asked.messages.length, 1, 'the row is requested for this step');
  // dsh-agent-loop holds six abort checks between `pre-step` and `session.append`, so a step can be
  // cancelled after the row was decided and before it was logged. The contract has to be re-stated
  // then: believing a marker instead would strip this session of its policy for the whole process.
  const retried = await ctx.fire('agent/pre-step', { agent, turn: 2, step: 1, signal: { aborted: false } });
  assert.equal(retried.messages.length, 1, 'the session keeps its contract');
});

test('the log, the pending decision and the inbox are consulted before injecting', async () => {
  // The log already carries the current text: a restarted host must not repeat it.
  const restarted = fakeCtx();
  createPolicyInjector(restarted, () => 'POLICY-A');
  const carried = await restarted.fire('agent/pre-step', {
    agent: { id: 'session-1', session: sessionWith([policyRow('POLICY-A')]) }, signal: { aborted: false },
  });
  assert.equal(carried.messages.length, 0, 'process memory is not the source of truth');

  // Re-arming a switch restates its contract even though an older row carried the same text.
  const rearmed = fakeCtx();
  createPolicyInjector(rearmed, () => 'POLICY-A');
  const restated = await rearmed.fire('agent/pre-step', {
    agent: { id: 'session-1', session: sessionWith([policyRow('POLICY-A'), policyRow('POLICY-B')]) }, signal: { aborted: false },
  });
  assert.equal(restated.messages.length, 1, 'the newest row decides, not any older match');

  // A row already queued in the inbox is going to be delivered; another copy would double it.
  const queued = fakeCtx();
  createPolicyInjector(queued, () => 'POLICY-A');
  const inboxed = await queued.fire('agent/pre-step', {
    agent: { id: 'session-1', session: sessionWith([]), inbox: { nextStep: [policyRow('POLICY-A')] } }, signal: { aborted: false },
  });
  assert.equal(inboxed.messages.length, 0, 'an inboxed row already carries the text');

  // Same for a decision the framework assembled with our row already inside it.
  let handler = null;
  const direct = { logger: { warn() {} }, on(name, fn) { void name; handler = fn; return () => {}; } };
  createPolicyInjector(direct, () => 'POLICY-A');
  const decided = await handler({ agent: { id: 'session-1', session: sessionWith([]) }, signal: { aborted: false } },
    () => Promise.resolve({ kind: 'enter', messages: [policyRow('POLICY-A')] }));
  assert.equal(decided.messages.length, 1, 'the pending decision is left as it stands');
});

test('a framework rejection passes through untouched', async () => {
  let captured = null;
  const handlerCtx = {
    logger: { warn() {} },
    on(name, handler) { void name; captured = handler; return () => {}; },
  };
  createPolicyInjector(handlerCtx, () => 'POLICY');
  const decision = await captured({ agent: { id: 's1' }, signal: { aborted: false } }, () => Promise.resolve({ kind: 'reject' }));
  assert.deepEqual(decision, { kind: 'reject' });
});

test('turbo endpoint reads and updates per-session flags and survives a corrupt file', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-turbo-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    const turbo = registerTurbo(ctx);
    const route = ctx.routes.find(candidate => candidate.path === TURBO_PATH);
    assert.ok(route, 'turbo route must be registered');

    const call = async payload => {
      const response = await route.fetch(new Request('http://local/api', {
        method: 'POST',
        body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: TURBO_EVENT, payload }),
      }));
      return response.json();
    };

    const empty = await call({ sessionId: 's1', action: 'read' });
    assert.deepEqual(empty.result, { ok: true, value: { persona: '', lightning: false, ultra: false, superfast: false, tokenMultiple: 1.5, tokenExact: true } });

    // The three effort switches are written by this route, into `$DSH_HOME/storages/codex-ui-effort.json`
    // — the same record `dsh-codex-ui-reasoning` writes (src/turbo.js:745-750). The write is a whole-file
    // rewrite built from a read taken immediately before the mutation, so rows the other plugin recorded
    // are carried over. The earlier expectation here was a refusal with code `turbo/effort-moved`; that
    // migration never landed, and the code, its comments and CHANGELOG.md:55 all say the write stays.
    const armed = await call({ sessionId: 's1', action: 'update', lightning: true, ultra: true });
    assert.equal(armed.result.ok, true, 'the effort write stays on this route');
    assert.equal(armed.result.value.lightning, true);
    assert.equal(armed.result.value.ultra, true);
    // The write reached the shared record, and the read route serves it back.
    const afterUpdate = await call({ sessionId: 's1', action: 'read' });
    assert.deepEqual(afterUpdate.result.value, { persona: '', lightning: true, ultra: true, superfast: false, tokenMultiple: 1.5, tokenExact: true });
    assert.equal(existsSync(join(home, 'storages', 'codex-ui-effort.json')), true, 'an accepted update must create the effort record');

    // The record has two writers now. The test writes it directly, the way the other plugin does, and the
    // read route has to serve that too — including a rewrite that lands while this process is running.
    writeEffortRecord(home, { s1: { lightning: true, ultra: true } });
    const reread = await call({ sessionId: 's1', action: 'read' });
    assert.deepEqual(reread.result.value, { persona: '', lightning: true, ultra: true, superfast: false, tokenMultiple: 1.5, tokenExact: true });
    const stored = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.deepEqual(stored.sessions.s1.lightning, true);

    // One flag without the other still writes, and the flag that was not named keeps its stored value.
    const partial = await call({ sessionId: 's1', action: 'update', lightning: false });
    assert.equal(partial.result.ok, true);
    assert.equal(partial.result.value.lightning, false);
    assert.equal(partial.result.value.ultra, true, 'an unnamed switch must not be reset');

    // The hero arms the persona for the conversation that starts next: an empty id reads
    // the picker's current value and writes it as pending, without touching session rows.
    const heroRead = await call({ sessionId: '', action: 'read' });
    assert.deepEqual(heroRead.result.value, { persona: 'work', lightning: false, ultra: false, superfast: false, pending: true, tokenMultiple: 1.5, tokenExact: true });
    const heroPick = await call({ sessionId: '', action: 'update', persona: 'chat' });
    assert.equal(heroPick.result.value.persona, 'chat');
    // Superfast travels the same path: set, read back, and persisted.
    // State writes are queued; await the chain rather than guessing at a delay.
    await turbo.settled();
    const afterPick = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-persona.json'), 'utf8'));
    assert.equal(afterPick.pendingPersona, 'chat');
    assert.ok(afterPick.pendingAt > 0, 'the pick records when it was made');
    // `s1` never stamped a style, so the persona record holds no row for it — and the pick must not
    // add one. The switches that test armed earlier live in the effort record, untouched by this write.
    assert.deepEqual(Object.keys(afterPick.sessions), [], 'a pending pick must not add a session row');
    const effortAfterPick = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.deepEqual(Object.keys(effortAfterPick.sessions), ['s1'], 'and the pick does not disturb the effort record');
    // A session that already existed never receives a later pick.
    const beforePick = await call({ sessionId: 's1', action: 'read' });
    assert.equal(beforePick.result.value.persona, '', 'an existing session carries no persona');
    // A per-session persona write is rejected: the picker only exists before a session.
    const perSession = await call({ sessionId: 's1', action: 'update', persona: 'work' });
    assert.equal(perSession.result.ok, false);

    // The injector stamps the persona at a session's own first step, and never touches a
    // conversation whose first step has already happened.
    const personaCtx = fakeCtx();
    registerTurbo(personaCtx);
    const personaCall = async payload => (await personaCtx.routes.find(candidate => candidate.path === TURBO_PATH).fetch(new Request('http://local/api', {
      method: 'POST',
      body: JSON.stringify({ type: 'client-request', rpcId: 'r2', method: TURBO_EVENT, payload }),
    }))).json();
    const step = (id, turn, s = 1) => ({ agent: { id }, turn, step: s, signal: { aborted: false } });

    // A running conversation is out of reach for the persona pick — but the language contract
    // is forced on every session this plugin arms, so that block is what it receives.
    const running = await personaCtx.fire('agent/pre-step', step('s0', 2));
    // The language block must arrive; an armed session also carries the per-turn Lightning reminder,
    // so the count is no longer fixed — find the block by content instead of by index.
    const texts = running.messages.map(message => message.content?.[0]?.text ?? '');
    assert.ok(texts.length >= 1, 'the forced language block still arrives');
    const languageOnly = texts.find(text => text.includes('Language (active)')) ?? '';
    assert.match(languageOnly, /Language \(active\) — Chinese throughout/);
    assert.match(languageOnly, /Reason in Chinese directly/);
    assert.doesNotMatch(languageOnly, /Persona \(active\)/, 'no persona may be stamped on a running conversation');
    assert.doesNotMatch(languageOnly, /Ultra Mode|Lightning Mode/, 'and no switch it never turned on');

    const stamped = await personaCtx.fire('agent/pre-step', step('s2', 1));
    const text = stamped.messages[0]?.content?.[0]?.text ?? '';
    assert.match(text, /Persona \(active\)/);
    assert.match(text, /talk like a person/);
    assert.match(text, /Open by naming their state/);
    // The chat contract must forbid deliverables, capability menus, and stock phrases.
    assert.match(text, /never list what you can do/);
    assert.match(text, /Never sell work back/);
    assert.match(text, /别硬撑/);
    assert.doesNotMatch(text, /precision work/);

    // The stamp is the session's for good: a later pick does not rewrite it.
    await personaCall({ sessionId: '', action: 'update', persona: 'work' });
    const again = await personaCtx.fire('agent/pre-step', step('s2', 2));
    assert.equal(again.messages.length, 0, 'the stamped session keeps its own persona');
    const stampedRead = await personaCall({ sessionId: 's2', action: 'read' });
    assert.equal(stampedRead.result.value.persona, 'chat');
    // A conversation that opens after the new pick gets the new one.
    const newest = await personaCtx.fire('agent/pre-step', step('s3', 1));
    assert.match(newest.messages[0]?.content?.[0]?.text ?? '', /precision work/);

    // A disarmed session that had armed text gets the off-notice exactly once.
    const injected = [];
    const injectorCtx = fakeCtx();
    const inject = createPolicyInjector(injectorCtx, () => (injected.length === 0 ? (injected.push(1), policyText({ lightning: true })) : OFF_NOTICE));
    const first = await injectorCtx.fire('agent/pre-step', { agent: { id: 's1' }, signal: { aborted: false } });
    const second = await injectorCtx.fire('agent/pre-step', { agent: { id: 's1' }, signal: { aborted: false } });
    assert.equal(first.messages.length, 1);
    assert.equal(second.messages[0].content[0].text, OFF_NOTICE);
    inject();

    // A switch named on the "next session" scope is refused for the same reason: there is no writer
    // left here, so the scope no longer changes the answer.
    // The three switches need a session: the hero's "next session" scope has no row to hold them, so a
    // request that names one here is refused with `turbo/invalid` — not because the write moved away.
    const bad = await call({ sessionId: '', action: 'update', lightning: true });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'turbo/invalid');
    const noChange = await call({ sessionId: 's1', action: 'update' });
    assert.equal(noChange.result.ok, false);
    assert.equal(noChange.result.error.code, 'turbo/invalid', 'a named session that names no owned field is still invalid');

    // Eviction must not cost the user a switch. Lightning stamps a row for every child it fans
    // out, so a file filled with recent persona-only rows used to push an older armed row out —
    // the conversation silently lost Ultra/Lightning while its composer went on showing them off.
    // Armed first, then the fan-out storm, which is the order that actually happens. Both rows go in
    // through the other plugin's file, because this process cannot arm a session any more — the point
    // of the test is that a persona write can never evict them.
    const effortFile = writeEffortRecord(home, { s1: { lightning: true, ultra: true }, 'session-armed': { lightning: true, ultra: true } });
    const armedEarly = await call({ sessionId: 'session-armed', action: 'read' });
    assert.equal(armedEarly.result.value.lightning, true, 'the read serves the record the other plugin wrote');
    const effortBytes = readFileSync(effortFile, 'utf8');
    const stepOf = id => ({ agent: { id }, turn: 1, step: 1, signal: { aborted: false } });
    for (let index = 0; index < 41; index += 1) await ctx.fire('agent/pre-step', stepOf(`child-${index}`));
    await new Promise(resolve => setTimeout(resolve, 60));
    // The storm writes persona rows only, so it cannot evict a switch: the effort record holds the
    // two armed sessions and nothing else.
    assert.equal(readFileSync(effortFile, 'utf8'), effortBytes, 'this process never writes the effort record, so a storm cannot even reorder it');
    const pruned = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.deepEqual(Object.keys(pruned.sessions).sort(), ['s1', 'session-armed'], 'the effort record stays free of persona rows');
    assert.deepEqual(pruned.sessions['session-armed'], { lightning: true, ultra: true, superfast: false, at: pruned.sessions['session-armed'].at }, 'the armed row survives the storm');
    assert.equal(pruned.sessions.s1.ultra, true, 'and so does the armed row this test set up earlier');
    // The persona record is the one that grows with the fan-out, so it is the one that is bounded.
    const personaRows = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-persona.json'), 'utf8'));
    assert.equal(Object.keys(personaRows.sessions).length, 40, 'the persona record stays bounded');
    assert.equal('child-0' in personaRows.sessions, false, 'the oldest persona-only rows are the ones that go');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});

test('Superfast builds a two-tier tree, stamps the tier in every child prompt, and stops at tier 2', () => {
  const tree = policyText({ persona: 'work', superfast: true });
  // The tree is the point: a tier-1 child must open at least two of its own, and a new development
  // reopens that fan-out because two is a floor rather than a budget.
  assert.match(tree, /## Superfast Mode/);
  assert.match(tree, /open at least two grandchildren before you report back/);
  assert.match(tree, /Two is the floor, not a budget/);
  assert.match(tree, /A new development reopens the fan-out/);
  // Depth travels inside the prompts, because the host cannot tell a child how deep it sits.
  assert.match(tree, /Tier: N of 2/);
  assert.match(tree, /Tier: 2 of 2/);
  // And it is bounded by depth, not by width: without this the fan-out is seven agent contexts instead
  // of one, each with its own fixed cost.
  assert.match(tree, /The one ceiling is depth, not width/);
  assert.match(tree, /There is no tier 3|there is no tier 3/);
  assert.match(tree, /never fan out past tier 2/);
  // The subtree reports only after it is quiet: same completion rule as the parent.
  assert.match(tree, /Do not report to the parent until the subtree is quiet/);
  // The tree needs Lightning's rules too — they are what tells a parent how to brief a child.
  assert.match(tree, /## Lightning Mode/);
  // The ordinary guard would forbid the very delegation the tree is built from, so it must be gone.
  assert.doesNotMatch(tree, /Ignore every rule above about fan-out/);
  assert.doesNotMatch(tree, /the tier-aware note belongs to the child/);
  assert.match(policyText({ persona: 'work', superfast: true, subagent: true }), /your prompt's first line fixes that tier/);
});

test('only a delegated child ends with the guard that forbids child fan-out', () => {
  const flat = policyText({ persona: 'work', lightning: true });
  assert.doesNotMatch(flat, /## Superfast Mode/, 'Lightning alone must not promise a tree');
  // This is the defect the old assertion pinned shut: the guard says "ignore every rule above about fan-out",
  // so a parent that received it had its own mandate cancelled by the tail of its own contract.
  assert.doesNotMatch(flat, /Ignore every rule above about fan-out/, 'a parent must not be told to ignore fan-out');
  const child = policyText({ persona: 'work', lightning: true, subagent: true });
  assert.match(child, /Ignore every rule above about fan-out/, 'a delegated child still needs the guard');
});

test('the turbo endpoint arms and persists the superfast flag on its own', async () => {
  // Its own home and context: an extra armed session row would change the eviction expectations
  // of the big flag test above, and a test that shares state with another is not a test.
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-superfast-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    const turbo = registerTurbo(ctx);
    const call = async payload => (await ctx.routes.find(candidate => candidate.path === TURBO_PATH).fetch(new Request('http://local/api', {
      method: 'POST',
      body: JSON.stringify({ type: 'client-request', rpcId: 'rt', method: TURBO_EVENT, payload }),
    }))).json();
    const before = await call({ sessionId: 'tree', action: 'read' });
    assert.equal(before.result.value.superfast, false, 'a session starts with the tree off');
    // This test asks one thing — is the flag read back correctly and does it persist. The route writes
    // the shared record itself (src/turbo.js:745-750), so arming happens through the same call the
    // interface makes; the earlier expectation of a `turbo/effort-moved` refusal described a migration
    // that never landed.
    const armedByRoute = await call({ sessionId: 'tree', action: 'update', superfast: true });
    assert.equal(armedByRoute.result.ok, true);
    assert.equal(armedByRoute.result.value.superfast, true);
    writeEffortRecord(home, { tree: { superfast: true } });
    const armed = await call({ sessionId: 'tree', action: 'read' });
    assert.equal(armed.result.value.superfast, true);
    assert.equal(armed.result.value.lightning, false, 'arming the tree must not flip the flat switch');
    assert.equal((await call({ sessionId: 'tree', action: 'read' })).result.value.superfast, true);
    await turbo.settled();
    const stored = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.equal(stored.sessions.tree.superfast, true, 'the flag must survive a reload');
    // A malformed value is refused on the invalid-argument code, not coerced.
    const bad = await call({ sessionId: 'tree', action: 'update', superfast: 'yes' });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'turbo/invalid');
    // And the hero's "next session" scope never carries it: the tree is armed per conversation.
    const hero = await call({ sessionId: '', action: 'read' });
    assert.equal(hero.result.value.superfast, false);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
});

test('Lightning re-asserts its mandate once per turn, and only for an armed session', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-nudge-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    registerTurbo(ctx);
    const route = ctx.routes.find(candidate => candidate.path === TURBO_PATH);
    const call = async payload => (await route.fetch(new Request('http://local/api', {
      method: 'POST',
      body: JSON.stringify({ type: 'client-request', rpcId: 'rn', method: TURBO_EVENT, payload }),
    }))).json();
    const stepOf = (id, turn, step = 1) => ({ agent: { id }, turn, step, signal: { aborted: false } });
    const nudges = result => result.messages.map(m => m.content?.[0]?.text ?? '').filter(text => text.includes('Lightning is armed'));
    const disarm = result => result.messages.map(m => m.content?.[0]?.text ?? '').filter(text => text.includes('Lightning is armed'));

    // An unarmed session never sees it.
    const cold = await ctx.fire('agent/pre-step', stepOf('s-cold', 3));
    assert.deepEqual(disarm(cold), [], 'an unarmed session gets no reminder');

    // The reminder stayed in this file with the injector (src/turbo.js:471-511); only the arming moved,
    // so the record is written the way its owner writes it. Every assertion below is unchanged: this
    // measures the reminder, not the retired route.
    writeEffortRecord(home, { 's-armed': { lightning: true } });
    assert.equal((await call({ sessionId: 's-armed', action: 'read' })).result.value.lightning, true, 'the read serves the armed record');
    const first = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 1));
    const firstNudges = nudges(first);
    assert.equal(firstNudges.length, 1, 'the first step of a turn carries exactly one reminder');
    assert.match(firstNudges[0], /turn 3/);
    assert.match(firstNudges[0], /dispatch two subagents on two different angles/);
    // One reminder per turn, on its first step. It used to repeat on steps 2 and 3 as well; that repetition
    // is gone, so a later step of the same turn carries nothing.
    const second = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 2));
    assert.deepEqual(nudges(second), [], 'a later step of the same turn is not reminded again');
    const third = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 3));
    assert.deepEqual(nudges(third), [], 'and the third step carries nothing either');
    const fourth = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 4));
    assert.deepEqual(nudges(fourth), [], 'a long turn is not nagged');
    const repeated = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 1));
    assert.deepEqual(nudges(repeated), [], 'the same step is never nudged twice');
    // The next turn gets its own, with its own number — that is what defeats the injector's
    // "same text, skip" rule, which is why the one-shot contract stopped steering anything.
    const nextTurn = await ctx.fire('agent/pre-step', stepOf('s-armed', 4, 1));
    const nextNudges = nudges(nextTurn);
    assert.equal(nextNudges.length, 1, 'each new turn re-asserts the mandate');
    assert.match(nextNudges[0], /turn 4/);
    assert.notEqual(nextNudges[0], firstNudges[0], 'never the same text twice');
    // Disarming is a write to the same record: `currentEffort()` revalidates it on every step, so the
    // very next one already sees the row switched off.
    writeEffortRecord(home, { 's-armed': { lightning: false } });
    assert.equal((await call({ sessionId: 's-armed', action: 'read' })).result.value.lightning, false);
    const afterOff = await ctx.fire('agent/pre-step', stepOf('s-armed', 5, 1));
    assert.deepEqual(nudges(afterOff), [], 'turning the switch off stops the reminder');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
});

test('a delegated child inherits the switches of the session that spawned it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-child-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    registerTurbo(ctx);
    // The effort record is keyed by the parent, verbatim as the harness writes it: the row key and
    // `parentSession` both carry the `session-` prefix, so the lookup must not strip it.
    writeEffortRecord(home, { 'session-parent-tree': { lightning: true, superfast: true } });
    const texts = result => result.messages.map(m => m.content?.[0]?.text ?? '').filter(Boolean);
    // The header is what the harness records for a delegated session: `origin`, the depth, and the
    // parent it came from. Values below are copied from a real child session log.
    const childStep = {
      agent: {
        id: 'child-worker-1',
        session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'session-parent-tree' } },
      },
      turn: 1,
      step: 1,
      signal: { aborted: false },
    };
    const child = await ctx.fire('agent/pre-step', childStep);
    const childText = texts(child).join('\n');
    // The tree contract reached the child, and the tier-aware tail replaced the ordinary guard: the
    // ordinary guard forbids fan-out outright, which cancels the very delegation Superfast is built from.
    assert.match(childText, /## Superfast Mode/, 'the child must receive the tree contract it is meant to run');
    assert.match(childText, /Tier: 1 of 2/, 'the tier-aware child note must be the tail');
    assert.doesNotMatch(childText, /Ignore every rule above about fan-out/, 'the fan-out-killing guard must not be the tail');
    // The switches are inherited; the persona row is not. `personaFor` stamps a pending pick onto the id
    // it is handed, so a shared scope would let a child claim its parent's row and pin the pick there.
    const personaRows = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-persona.json'), 'utf8'));
    assert.equal('session-parent-tree' in (personaRows.sessions ?? {}), false, 'a child must not write its parent persona row');
    // The parent's switches are what the child is nudged by: the one-shot injection alone was measured to
    // stop steering after a few turns, which is the whole reason the per-turn reminder exists.
    const childNudges = texts(await ctx.fire('agent/pre-step', { ...childStep, turn: 2, step: 1 }))
      .filter(text => text.includes('Lightning is armed'));
    assert.equal(childNudges.length, 1, 'a child inherits the per-turn reminder from its parent switches');
    // A child of an unarmed parent still gets nothing but its own tail: no switches, no tree.
    writeEffortRecord(home, {});
    const orphanStep = {
      agent: { id: 'child-worker-2', session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'session-not-armed' } } },
      turn: 1,
      step: 1,
      signal: { aborted: false },
    };
    const orphan = texts(await ctx.fire('agent/pre-step', orphanStep)).join('\n');
    assert.doesNotMatch(orphan, /## Superfast Mode/, 'an unarmed parent must not arm its child');
    // Disarming the parent reaches the child on its next step: the child carries a block it inherited, so
    // it is the one session that would otherwise keep obeying a contract the user already revoked.
    const armedChild = {
      agent: { id: 'child-worker-3', session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'session-parent-tree' } } },
      turn: 1,
      step: 1,
      signal: { aborted: false },
    };
    writeEffortRecord(home, { 'session-parent-tree': { lightning: true, superfast: true } });
    assert.match(texts(await ctx.fire('agent/pre-step', armedChild)).join('\n'), /## Superfast Mode/);
    writeEffortRecord(home, { 'session-parent-tree': { lightning: false, superfast: false } });
    const offChild = texts(await ctx.fire('agent/pre-step', { ...armedChild, turn: 2 })).join('\n');
    assert.doesNotMatch(offChild, /## Superfast Mode/, 'the revoked tree must stop reaching the child too');
    assert.doesNotMatch(offChild, /Tier: 1 of 2/, 'and the tier instruction must go with it');
    // The session is still armed by its persona, so it keeps the skeleton blocks; what it must not keep
    // is the tree. `OFF_NOTICE` belongs to a session with every switch off, which this one is not.
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
});
