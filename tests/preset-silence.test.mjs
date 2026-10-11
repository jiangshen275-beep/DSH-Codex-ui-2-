import test from 'node:test';
import assert from 'node:assert/strict';
import { presetSilences, SILENT_PRESETS } from '../src/turbo-policy.js';

// The plugin's whole host-side prompt surface is gated on this one predicate, so it is worth pinning:
// a session started on a silenced preset must receive no language contract, persona, orchestration
// block, Codex prompt or identity line at all.
test('the preset silence switch is keyed on the session agent preset', () => {
  assert.deepEqual(SILENT_PRESETS, ['clean']);
  assert.equal(presetSilences({ session: { header: { agentPreset: 'clean' } } }), true);
  for (const preset of ['standard', 'ptc', 'minimal', 'cordis', 'Clean', '']) {
    assert.equal(presetSilences({ session: { header: { agentPreset: preset } } }), false, `${preset} must not be silenced`);
  }
  // Fail open: anything unrecognised keeps the plugin's normal behaviour.
  assert.equal(presetSilences(undefined), false);
  assert.equal(presetSilences({}), false);
  assert.equal(presetSilences({ session: {} }), false);
  assert.equal(presetSilences({ session: { header: {} } }), false);
});
