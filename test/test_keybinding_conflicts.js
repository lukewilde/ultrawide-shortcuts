// Run with: gjs -m test/test_keybinding_conflicts.js
import { normalizeAccel } from '../keybinding-conflicts.js';

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) imports.system.exit(1);
