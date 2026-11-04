import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { superfastSpeedToolDenial as deny } from '../src/superfast-speed-policy.js';
import { SUPERFAST_POLICY, SUPERFAST_CHILD_NOTE, modeBanner, lightningNudge } from '../src/turbo-policy.js';

const root = path.resolve('tests');
const job = (paths = [root]) => ({ kind: 'executor', role: 'C', cwd: process.cwd(), branch: { write_paths: paths }, report() {} });
const exec = (name, args = {}) => ({ tool: { name }, arguments: args });

test('writable executor can run native build/test and collect or cancel jobs without changing inherited options', () => {
  for (const name of ['ops_bash', 'pwsh', 'job_output', 'job_kill']) {
    const j = job(), e = exec(name, { command: 'test', job_id: 'native-job' });
    const before = JSON.stringify({ j, e });
    assert.equal(deny(j, e), undefined, name);
    assert.equal(JSON.stringify({ j, e }), before);
  }
});

test('read-only and malformed branches cannot execute or manage commands', () => {
  for (const paths of [[], null, [''], [null]]) {
    for (const name of ['ops_bash', 'pwsh', 'job_output', 'job_kill']) assert.ok(deny(job(paths), exec(name)), name);
  }
});

test('known reads skills and executor reports stay available', () => {
  for (const name of ['read', 'read_image', 'glob', 'grep', 'ops_glob', 'ops_grep', 'ops_inspect_local_file', 'web_fetch', 'web_search', 'working_directory', 'load_workspace_dependencies', 'job_list', 'list_agents', 'skill', 'superfast_report']) {
    assert.equal(deny(job([]), exec(name)), undefined, name);
  }
  assert.ok(deny(job(), exec('working_directory', { cd: root })));
});

test('native file edits retain canonical write_paths checks', () => {
  for (const name of ['write', 'edit']) {
    assert.equal(deny(job(), exec(name, { file_path: path.join(root, 'owned.txt') })), undefined);
    assert.ok(deny(job(), exec(name, { file_path: path.resolve('outside.txt') })));
    assert.ok(deny(job([]), exec(name, { file_path: path.join(root, 'owned.txt') })));
  }
  const owned = path.join(root, 'superfast-speed-policy.test.mjs');
  assert.equal(deny(job(), exec('ops_replace', { path: owned })), undefined);
  assert.ok(deny(job(), exec('ops_replace', { path: path.resolve('package.json') })));
  assert.ok(deny(job(), exec('ops_replace', { path: root })));
});

test('delegation goals schedules interactive control and unknown side effects remain blocked', () => {
  for (const name of ['subagent', 'subagent_fork', 'send_message', 'workflow', 'create_goal', 'update_goal', 'schedule_create', 'schedule_update', 'schedule_delete', 'flash_start', 'flash_run', 'flash_control', 'superfast_start', 'superfast_control', 'computer', 'write_unknown', 'exec', 'exec_command', 'sidebar_rail']) {
    assert.ok(deny(job(), exec(name)), name);
  }
});

test('summary jobs never gain execution or tool access', () => {
  for (const name of ['ops_bash', 'pwsh', 'skill', 'read', 'superfast_report']) assert.ok(deny({ ...job(), kind: 'summary' }, exec(name)), name);
});

test('superfast contracts consistently describe capacity driven DAG dispatch and direct final delivery', () => {
  for (const text of [SUPERFAST_POLICY, modeBanner('superfast'), lightningNudge(1, 1, 'superfast')]) {
    assert.match(text, /32/);
    assert.match(text, /DAG/);
    assert.match(text, /capacity/);
    assert.match(text, /wait/);
    assert.match(text, /不必跑整理S|取消必跑整理S/);
    assert.match(text, /max_tokens/);
  }
  assert.match(SUPERFAST_POLICY, /程序化无损汇集/);
  assert.match(SUPERFAST_POLICY, /不无脑重跑已证实分支全套/);
  assert.match(SUPERFAST_POLICY, /证据过期/);
  assert.match(SUPERFAST_POLICY, /关键集成检查/);
  assert.match(SUPERFAST_POLICY, /artifact、分支完成、容量变化/);
  assert.match(SUPERFAST_CHILD_NOTE, /shell并非write_paths强制路径沙箱/);
  assert.match(SUPERFAST_CHILD_NOTE, /继承宿主权限与审批/);
});