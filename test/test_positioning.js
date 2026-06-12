// Run with: gjs -m test/test_positioning.js
import { gridToPixels, pickNeighbour, shrinkWorkArea } from '../positioning.js';

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

// --- gridToPixels with cellGap ---
// 4 cols, 400px wide, 10px gap: cellW = (400 - 3*10) / 4 = 92.5
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

// 2 rows, 200px tall, 20px gap: cellH = (200 - 1*20) / 2 = 90
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

// --- gridToPixels clamps out-of-bounds selections to the grid ---
assertRect(
  gridToPixels({ anchor: { col: 99, row: 0 }, target: { col: 99, row: 0 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 1800, y: 0, width: 120, height: 1080 },
  'col past grid clamps to last column'
);

assertRect(
  gridToPixels({ anchor: { col: 0, row: 3 }, target: { col: 3, row: 3 } }, { cols: 16, rows: 1 }, fullHD),
  { x: 0, y: 0, width: 480, height: 1080 },
  'row past shrunk grid clamps to row 0'
);

// --- shrinkWorkArea tests ---

assertRect(
  shrinkWorkArea({ x: 0, y: 0, width: 1920, height: 1080 }, 16),
  { x: 16, y: 16, width: 1888, height: 1048 },
  'shrinkWorkArea: 16px margin'
);

assertRect(
  shrinkWorkArea({ x: 100, y: 50, width: 800, height: 600 }, 0),
  { x: 100, y: 50, width: 800, height: 600 },
  'shrinkWorkArea: zero margin no-op'
);
assertRect(
  shrinkWorkArea({ x: 100, y: 50, width: 800, height: 600 }),
  { x: 100, y: 50, width: 800, height: 600 },
  'shrinkWorkArea: omitted margin no-op'
);

const portraitShrunk = shrinkWorkArea({ x: 0, y: 0, width: 600, height: 1000 }, 500);
assert(
  portraitShrunk.width > 0 && portraitShrunk.height > 0,
  `shrinkWorkArea: oversized margin keeps area positive, got w:${portraitShrunk.width},h:${portraitShrunk.height}`
);

assertRect(
  shrinkWorkArea({ x: 0, y: 0, width: 1920, height: 1080 }, -10),
  { x: 0, y: 0, width: 1920, height: 1080 },
  'shrinkWorkArea: negative margin clamps to 0'
);

// --- pickNeighbour tests ---

function assertEq(actual, expected, msg) {
  assert(actual === expected, `${msg}: expected ${expected}, got ${actual}`);
}

// 16-col @1920 candidates as pixel rects (1-row grid, constant y/height)
const H = { y: 0, height: 1080 };
const leftQ = { x: 0, width: 480, ...H };     // centerX 240
const centerH = { x: 480, width: 960, ...H };  // centerX 960
const rightQ = { x: 1440, width: 480, ...H };  // centerX 1680
const sameCtr = { x: 240, width: 1440, ...H }; // centerX 960 (same center as centerH, wider)
const cands = [leftQ, centerH, rightQ, sameCtr];

// Window sitting on centerH
const winCenter = { x: 480, width: 960, ...H };
assertEq(pickNeighbour(winCenter, cands, 'left'), 0, 'left picks leftQ');
assertEq(pickNeighbour(winCenter, cands, 'right'), 2, 'right picks rightQ');
// same-center variant (index 3) excluded from left/right
assert(pickNeighbour(winCenter, cands, 'left') !== 3, 'left excludes same-center variant');
assert(pickNeighbour(winCenter, cands, 'right') !== 3, 'right excludes same-center variant');

// Wider/narrower: window on leftQ (width 480)
const winLeft = { x: 0, width: 480, ...H };
assertEq(pickNeighbour(winLeft, cands, 'wider'), 1, 'wider picks nearest-width (centerH over sameCtr)');
assertEq(pickNeighbour(winLeft, cands, 'narrower'), -1, 'narrower at narrowest extreme is -1');

assertEq(pickNeighbour(winLeft, cands, 'left'), -1, 'left at leftmost extreme is -1');

// Wider tie-break by position: equal-width candidates, pick closer center
const winNarrow = { x: 720, width: 480, ...H }; // centerX 960
const wideFar = { x: 0, width: 960, ...H };      // centerX 480, dWidth 480
const wideNear = { x: 420, width: 960, ...H };   // centerX 900, dWidth 480 (closer center)
assertEq(pickNeighbour(winNarrow, [wideFar, wideNear], 'wider'), 1, 'wider tie-break picks nearer center');

// Monitor offset: work area origin x=1920
const offLeft = { x: 1920, width: 1280, y: 0, height: 1440 };  // centerX 2560
const offRight = { x: 3200, width: 1280, y: 0, height: 1440 }; // centerX 3840
const winOffLeft = { x: 1920, width: 1280, y: 0, height: 1440 };
assertEq(pickNeighbour(winOffLeft, [offLeft, offRight], 'right'), 1, 'offset monitor: right picks the right rect');

assertEq(pickNeighbour(winCenter, cands, 'sideways'), -1, 'unknown direction is -1');

// --- Left/right symmetry: on a center tie, both directions must prefer the
// narrower split regardless of config order ---
const symWin = { x: 480, width: 960, ...H }; // cx 960
const leftNarrow = { x: 480, width: 480, ...H };  // cx 720, narrower
const leftWide = { x: 0, width: 1440, ...H };     // cx 720, wider
const rightWide = { x: 480, width: 1440, ...H };  // cx 1200, wider (lower index than rightNarrow)
const rightNarrow = { x: 960, width: 480, ...H }; // cx 1200, narrower
const symCands = [leftNarrow, leftWide, rightWide, rightNarrow];
assertEq(pickNeighbour(symWin, symCands, 'left'), 0, 'left center-tie prefers narrower');
assertEq(pickNeighbour(symWin, symCands, 'right'), 3, 'right center-tie prefers narrower (not lower-index wider)');
assert(
  symCands[pickNeighbour(symWin, symCands, 'left')].width ===
  symCands[pickNeighbour(symWin, symCands, 'right')].width,
  'left and right pick equal-width (symmetric) splits'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  imports.system.exit(1);
}
