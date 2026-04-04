// Run with: gjs -m test/test_positioning.js
import { gridToPixels, parsePositionPresets } from '../positioning.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`FAIL: ${msg}`); }
}

function assertRect(actual, expected, msg) {
  assert(
    actual.x === expected.x &&
    actual.y === expected.y &&
    actual.width === expected.width &&
    actual.height === expected.height,
    `${msg}: expected {x:${expected.x},y:${expected.y},w:${expected.width},h:${expected.height}}, ` +
    `got {x:${actual.x},y:${actual.y},w:${actual.width},h:${actual.height}}`
  );
}

// --- gridToPixels tests ---

// Full-width on 16x1 grid (1920px wide monitor at origin)
const fullHD = { x: 0, y: 0, width: 1920, height: 1080 };

// Left quarter: cols 0-3 of 16
assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 3, row: 0 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 0, y: 0, width: 480, height: 1080 },
  'left quarter of 1920px'
);

// Right half: cols 8-15 of 16
assertRect(
  gridToPixels({ anchor: { col: 8, row: 0 }, target: { col: 15, row: 0 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 960, y: 0, width: 960, height: 1080 },
  'right half of 1920px'
);

// With monitor offset (second monitor at x=1920)
const secondMon = { x: 1920, y: 0, width: 2560, height: 1440 };
assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 7, row: 0 } }, { cols: 16, rows: 1 }, secondMon),
  { x: 1920, y: 0, width: 1280, height: 1440 },
  'left half on offset monitor'
);

// 2D grid: top-left quadrant of 4x4
assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 1, row: 1 } }, { cols: 4, rows: 4 }, fullHD),
  { x: 0, y: 0, width: 960, height: 540 },
  'top-left quadrant on 4x4 grid'
);

// Reversed anchor/target (target before anchor)
assertRect(
  gridToPixels({ anchor: { col: 3, row: 0 }, target: { col: 0, row: 0 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 0, y: 0, width: 480, height: 1080 },
  'reversed anchor/target'
);

// --- parsePositionPresets tests ---

// Single preset
const single = parsePositionPresets('16x1 1:1 4:1');
assert(single.length === 1, 'single preset: count');
assert(single[0].gridSize.cols === 16, 'single preset: cols');
assert(single[0].gridSize.rows === 1, 'single preset: rows');
assert(single[0].selection.anchor.col === 0, 'single preset: anchor col (0-indexed)');
assert(single[0].selection.target.col === 3, 'single preset: target col (0-indexed)');

// Multiple presets with inherited grid size
const multi = parsePositionPresets('16x1 1:1 4:1, 1:1 3:1');
assert(multi.length === 2, 'multi preset: count');
assert(multi[1].gridSize.cols === 16, 'multi preset: inherited grid cols');
assert(multi[1].selection.target.col === 2, 'multi preset: second target col');

// Different grid in second preset
const diffGrid = parsePositionPresets('16x1 1:1 8:1, 4x4 1:1 2:2');
assert(diffGrid.length === 2, 'diff grid: count');
assert(diffGrid[1].gridSize.cols === 4, 'diff grid: second preset cols');
assert(diffGrid[1].gridSize.rows === 4, 'diff grid: second preset rows');

// Empty/null input
assert(parsePositionPresets('').length === 0, 'empty string');
assert(parsePositionPresets(null).length === 0, 'null input');
assert(parsePositionPresets(undefined).length === 0, 'undefined input');

// User's actual presets
const preset1 = parsePositionPresets('16x1 1:1 4:1, 1:1 3:1');
assert(preset1[0].selection.anchor.col === 0 && preset1[0].selection.target.col === 3, 'user preset1 first');
assert(preset1[1].selection.anchor.col === 0 && preset1[1].selection.target.col === 2, 'user preset1 second');

const preset4 = parsePositionPresets('16x1 1:1 8:1, 1:1 12:1');
assert(preset4[0].selection.target.col === 7, 'user preset4 first: left half');
assert(preset4[1].selection.target.col === 11, 'user preset4 second: left 3/4');

// --- gridToPixels with cellGap ---
// 4-column 400px wide grid, 10px gap between cells
// cellW = (400 - 3*10) / 4 = 92.5
const gapArea = { x: 0, y: 0, width: 400, height: 1080 };

assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 0, row: 0 } }, { cols: 4, rows: 1 }, gapArea, 10),
  { x: 0, y: 0, width: 92.5, height: 1080 },
  'cellGap: first cell'
);

assertRect(
  gridToPixels({ anchor: { col: 1, row: 0 }, target: { col: 1, row: 0 } }, { cols: 4, rows: 1 }, gapArea, 10),
  { x: 102.5, y: 0, width: 92.5, height: 1080 },
  'cellGap: second cell'
);

assertRect(
  gridToPixels({ anchor: { col: 2, row: 0 }, target: { col: 3, row: 0 } }, { cols: 4, rows: 1 }, gapArea, 10),
  { x: 205, y: 0, width: 195, height: 1080 },
  'cellGap: right half span (cols 2-3)'
);

// Vertical gap: 2-row 200px tall grid, 20px row gap
// cellH = (200 - 1*20) / 2 = 90
const vGapArea = { x: 0, y: 0, width: 1920, height: 200 };
assertRect(
  gridToPixels({ anchor: { col: 0, row: 1 }, target: { col: 0, row: 1 } }, { cols: 1, rows: 2 }, vGapArea, 20),
  { x: 0, y: 110, width: 1920, height: 90 },
  'cellGap vertical: second row'
);

// cellGap=0 is identical to no-gap call
assertRect(
  gridToPixels({ anchor: { col: 0, row: 0 }, target: { col: 3, row: 0 } }, { cols: 16, rows: 1 }, fullHD, 0),
  { x: 0, y: 0, width: 480, height: 1080 },
  'cellGap=0 matches no-gap'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  imports.system.exit(1);
}
