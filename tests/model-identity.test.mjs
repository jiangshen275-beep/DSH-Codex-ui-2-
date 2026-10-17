// Host half of the model-name feature: the prompt text that makes the assistant answer to the name the
// UI shows for the running model — the owner's own name if there is one, otherwise the catalog's.
import assert from 'node:assert/strict';
import test from 'node:test';
import { identityText, setAliases, currentAliases } from '../src/model-identity.js';

test('the identity section names the running model, owner name first and catalog name second', () => {
  setAliases({ aliases: { 'deepseek/official': '阿斯特拉' }, names: { 'deepseek/official': 'DeepSeek', 'other/gpt-6-astra': 'GPT-6 Astra' } });
  // The owner's name wins where both exist.
  const own = identityText({ provider: 'deepseek', model: 'official' });
  assert.match(own, /你就是「阿斯特拉」/);
  // A catalog name alone still produces a section: this is the case that used to be empty.
  const catalog = identityText({ provider: 'other', model: 'gpt-6-astra' });
  assert.match(catalog, /你就是「GPT-6 Astra」/);
  // The wording has to outrank the harness's own identity line, which is what the assistant kept
  // repeating instead: it must say the other identifiers are not its name.
  assert.match(catalog, /不是你的名字/);
  assert.match(catalog, /不要用它们回答/);
  // A name stated as a constant is not narrated as an event. These words were once *in* the prompt as a
  // negative list and a model echoed them straight back ("运行环境本轮更新的身份指定覆盖了上一条回答"),
  // so their absence is the contract now, not a style preference.
  for (const word of ['变更', '更新', '覆盖', '此前的名字', '身份指定', '运行环境指定', '配置', '注入']) {
    assert.doesNotMatch(catalog, new RegExp(word), `身份段不应出现事件化措辞：${word}`);
  }
  // Introducing itself is one path and one shape: a self-introduction, never a search log. The maker
  // used to be a required lookup; it is gone now, because the only ways to fill that slot were to guess
  // or to search, and both produced a maker nobody had verified. So the absence of the search demand is
  // the contract now, pinned here beside the template it belongs to.
  assert.doesNotMatch(catalog, /联网搜索/);
  assert.doesNotMatch(catalog, /必须执行的一步/);
  assert.doesNotMatch(catalog, /<厂家>|旗下的模型/);
  assert.match(catalog, /第一句「我是「[^」]+」」/);
  assert.match(catalog, /我能做的事：/);
  assert.match(catalog, /不要把检索过程、搜索结果清单、报道标题或链接写进正文/);
  // The one-sentence path must stay separate from the introduce-yourself path, or "你是什么模型"
  // gets stretched into the full template.
  assert.match(catalog, /只问"你是什么模型"（不问厂家、不问能力）时/);
  // The reasoning trace is on screen too, so the rule has to cover it: a model that names its real route
  // id while thinking has leaked exactly what the rename hides.
  assert.match(catalog, /思考过程中同样适用/);
  assert.match(catalog, /不要在推理里推测、罗列或提及/);
  // A model named nowhere adds no bytes at all, so the prompt stays as it was.
  assert.equal(identityText({ provider: 'other', model: 'unnamed' }), '');
  assert.equal(identityText(undefined), '');
  assert.equal(identityText({ provider: 'other' }), '');
});

test('the name maps are validated rather than trusted', () => {
  setAliases({
    aliases: { 'a/b': '  spaced  ', 'c/d': '', '': 'no key', 'e/f': 42, 'g/h': 'x'.repeat(400) },
    names: { 'i/j': 'Catalog' },
  });
  const { aliases, names } = currentAliases();
  assert.equal(aliases['a/b'], 'spaced', 'trimmed');
  assert.equal(aliases['c/d'], undefined, 'an empty name is not a name');
  assert.equal(aliases[''], undefined);
  assert.equal(aliases['e/f'], undefined, 'a non-string is refused');
  assert.equal(aliases['g/h'].length, 120, 'capped so a prompt cannot be flooded');
  assert.equal(names['i/j'], 'Catalog', 'the catalog map is kept separately');
  assert.deepEqual(currentAliases().aliases, aliases);
  assert.deepEqual(setAliases(null), { aliases: {}, names: {} }, 'a null payload clears rather than throws');
  assert.deepEqual(setAliases('nonsense'), { aliases: {}, names: {} }, 'a string is not a map');
  assert.deepEqual(setAliases([{ 'a/b': 'x' }]), { aliases: {}, names: {} }, 'an array is not a map either');
});
test('a provider string that does not match the catalog still finds the name, but never across accounts', () => {
  // The Host may report `deepseek-official` while the catalog keys the same model under another
  // provider id. Exactly one match by model id is taken; two different names for one model id are
  // treated as ambiguous and produce nothing, so one account's name cannot leak to another.
  setAliases({ aliases: {}, names: { 'deepseek-official/gpt-6-astra': 'GPT-6 Astra' } });
  assert.match(identityText({ provider: 'deepseek-account', model: 'gpt-6-astra' }), /GPT-6 Astra/);
  setAliases({ aliases: {}, names: { 'a/gpt-6-astra': 'GPT-6 Astra', 'b/gpt-6-astra': '别的名字' } });
  assert.equal(identityText({ provider: 'c', model: 'gpt-6-astra' }), '', 'ambiguous by model id, so silent');
  assert.match(identityText({ provider: 'b', model: 'gpt-6-astra' }), /别的名字/, 'an exact key still wins');
});