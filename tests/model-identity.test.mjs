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
  // repeating instead: it must say the other identifiers are not its identity.
  assert.match(catalog, /不是你的身份/);
  assert.match(catalog, /不要用它们回答/);
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