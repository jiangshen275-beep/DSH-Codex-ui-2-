import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_CATALOG, PROVIDER_REGIONS, providerGroups } from '../src/providers.js';

// The catalogue is reference data, so the assertions are about shape and honesty rather than about a
// particular release: every entry must be usable by the view, the region split must cover everything,
// and nothing may be listed twice.
test('the provider catalogue is complete enough to render and honest about its scope', () => {
  assert.ok(PROVIDER_CATALOG.length >= 20, `expected a broad list, got ${PROVIDER_CATALOG.length}`);
  const ids = new Set();
  const names = new Set();
  for (const provider of PROVIDER_CATALOG) {
    assert.ok(typeof provider.id === 'string' && provider.id !== '', 'every provider needs an id');
    assert.ok(typeof provider.name === 'string' && provider.name !== '', `provider ${provider.id} needs a name`);
    assert.ok(PROVIDER_REGIONS.includes(provider.region), `provider ${provider.id} must be 国内 or 国外`);
    assert.ok(provider.models.length >= 2, `provider ${provider.id} needs a usable model list`);
    assert.ok(provider.models.every(model => typeof model === 'string' && model.trim() !== ''), `provider ${provider.id} has an empty model entry`);
    assert.ok(!ids.has(provider.id), `duplicate provider id: ${provider.id}`);
    assert.ok(!names.has(provider.name), `duplicate provider name: ${provider.name}`);
    ids.add(provider.id);
    names.add(provider.name);
    // No point offering a link the browser cannot follow.
    assert.ok(provider.site === undefined || /^https:\/\//.test(provider.site), `provider ${provider.id} has a non-https site`);
  }
  // Both halves of the split the reader asked for must be populated.
  for (const region of PROVIDER_REGIONS) {
    assert.ok(PROVIDER_CATALOG.some(provider => provider.region === region), `no providers for ${region}`);
  }
  const groups = providerGroups();
  assert.deepEqual(groups.map(group => group.region), PROVIDER_REGIONS, 'groups come back in display order');
  assert.equal(groups.reduce((sum, group) => sum + group.providers.length, 0), PROVIDER_CATALOG.length, 'grouping loses nothing');
  assert.deepEqual(providerGroups([]), [], 'an empty catalogue renders no groups');
});
