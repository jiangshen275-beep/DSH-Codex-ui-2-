import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recordDecision, listDecisions, clearDecisions, reviewLogDir, REVIEW_LOG_DIR } from '../src/review-log.js';

function tempHome() {
  return mkdtempSync(path.join(tmpdir(), 'review-log-'));
}

test('records a decision and reads it back newest first', () => {
  const home = tempHome();
  recordDecision({ tool: 'ops_bash', preset: 'review', decision: 'allow', reason: '读文件' }, home);
  recordDecision({ tool: 'write', preset: 'review', decision: 'ask_user', reason: '会覆盖既有文件', ruleIds: ['D1'] }, home);
  const items = listDecisions(home);
  assert.equal(items.length, 2);
  assert.equal(items[0].decision, 'ask_user');
  assert.deepEqual(items[0].ruleIds, ['D1']);
  rmSync(home, { recursive: true, force: true });
});

test('secrets never reach the record file', () => {
  const home = tempHome();
  recordDecision({
    tool: 'ops_bash',
    decision: 'allow',
    reason: '用 sk-abcdef1234567890 认证',
    evidence: 'token=ghp_ABCDEFGHIJKLMNOP',
    modelText: '-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----'
  }, home);
  const file = path.join(reviewLogDir(home), 'decisions.jsonl');
  const raw = readFileSync(file, 'utf8');
  assert.equal(raw.includes('sk-abcdef1234567890'), false);
  assert.equal(raw.includes('ghp_ABCDEFGHIJKLMNOP'), false);
  assert.equal(raw.includes('BEGIN RSA PRIVATE KEY'), false);
  assert.match(raw, /\[疑似令牌\]|\[疑似键值凭据\]|\[私钥块\]/);
  rmSync(home, { recursive: true, force: true });
});

test('clear empties the log', () => {
  const home = tempHome();
  recordDecision({ tool: 'read', decision: 'allow' }, home);
  assert.equal(listDecisions(home).length, 1);
  clearDecisions(home);
  assert.equal(listDecisions(home).length, 0);
  rmSync(home, { recursive: true, force: true });
});

test('missing home is handled without throwing', () => {
  assert.doesNotThrow(() => recordDecision({ tool: 'read', decision: 'allow' }, ''));
  assert.deepEqual(listDecisions(''), []);
});

test('a corrupt line does not hide the rest', () => {
  const home = tempHome();
  recordDecision({ tool: 'read', decision: 'allow' }, home);
  const file = path.join(reviewLogDir(home), 'decisions.jsonl');
  appendFileSync(file, '{not json\n', 'utf8');
  assert.equal(listDecisions(home).length, 1);
  rmSync(home, { recursive: true, force: true });
});
