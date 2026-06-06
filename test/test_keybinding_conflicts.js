// Run with: gjs -m test/test_keybinding_conflicts.js
import { normalizeAccel, mergeBackupRecords } from '../keybinding-conflicts.js';

let passed = 0;
let failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; } else { failed++; console.error(`FAIL: ${msg}`); }
}

// Modifier order is irrelevant after normalization.
assert(normalizeAccel('<Super>Left') === normalizeAccel('<Super>Left'), 'identical accels match');
assert(normalizeAccel('<Alt><Super>Left') === normalizeAccel('<Super><Alt>Left'),
  'modifier order does not matter');
// Different key does not match.
assert(normalizeAccel('<Super>Left') !== normalizeAccel('<Super>Right'), 'different key differs');
// Case-insensitive modifiers.
assert(normalizeAccel('<SUPER>Left') === normalizeAccel('<super>Left'), 'modifier case-insensitive');
// Different modifier set does not match.
assert(normalizeAccel('<Super>Left') !== normalizeAccel('<Alt><Super>Left'), 'extra modifier differs');

// --- mergeBackupRecords ---
const rec = (key, original) =>
  ({ schema: 'org.gnome.mutter.keybindings', key, original });

// Fresh records for new keys are appended.
{
  const out = mergeBackupRecords([rec('toggle-tiled-left', ['<Super>Left'])],
    [rec('toggle-tiled-right', ['<Super>Right'])]);
  assert(out.length === 2, 'merge appends records for new keys');
}
// An existing original is never replaced by a later value.
{
  const out = mergeBackupRecords([rec('maximize', ['<Super>Up'])],
    [rec('maximize', [])]);
  assert(out.length === 1 && out[0].original.length === 1
    && out[0].original[0] === '<Super>Up',
  'existing original wins over a later (stripped) value');
}
// Records untouched this run survive so restore() can still return them.
{
  const out = mergeBackupRecords([rec('maximize', ['<Super>Up'])], []);
  assert(out.length === 1 && out[0].key === 'maximize',
    'untouched existing records are kept');
}
// Same key in different schemas does not collide.
{
  const out = mergeBackupRecords(
    [{ schema: 'a', key: 'maximize', original: ['x'] }],
    [{ schema: 'b', key: 'maximize', original: ['y'] }]);
  assert(out.length === 2, 'same key in different schemas kept separately');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) imports.system.exit(1);
