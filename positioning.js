// positioning.js — Pure-function grid math. No gi:// imports.

/**
 * Convert a grid selection to pixel coordinates within a work area.
 * @param {{anchor: {col: number, row: number}, target: {col: number, row: number}}} selection - 0-indexed
 * @param {{cols: number, rows: number}} gridSize
 * @param {{x: number, y: number, width: number, height: number}} workArea
 * @param {number} [cellGap=0] - gap in pixels between adjacent cells
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function gridToPixels(selection, gridSize, workArea, cellGap = 0) {
  const { cols, rows } = gridSize;
  // Clamp into the grid so a stale/oversized stored position (e.g. 99:1 on a
  // 16-col grid, or a grid since shrunk) can't compute an off-screen rect.
  const clampCol = c => Math.max(0, Math.min(c, cols - 1));
  const clampRow = r => Math.max(0, Math.min(r, rows - 1));
  const col1 = clampCol(Math.min(selection.anchor.col, selection.target.col));
  const row1 = clampRow(Math.min(selection.anchor.row, selection.target.row));
  const col2 = clampCol(Math.max(selection.anchor.col, selection.target.col));
  const row2 = clampRow(Math.max(selection.anchor.row, selection.target.row));

  const cellW = (workArea.width - (cols - 1) * cellGap) / cols;
  const cellH = (workArea.height - (rows - 1) * cellGap) / rows;

  return {
    x: workArea.x + col1 * (cellW + cellGap),
    y: workArea.y + row1 * (cellH + cellGap),
    width: (col2 - col1 + 1) * cellW + (col2 - col1) * cellGap,
    height: (row2 - row1 + 1) * cellH + (row2 - row1) * cellGap,
  };
}

// Excludes candidates the window already sits on (within EPS px).
const EPS = 2;

/**
 * Pick the neighbouring candidate rectangle in a given direction.
 * Pure function — no gi:// imports.
 * @param {{x: number, y: number, width: number, height: number}} windowRect - focused window frame, pixels
 * @param {Array<{x: number, y: number, width: number, height: number}>} candidates - candidate rects, pixels
 * @param {'left'|'right'|'wider'|'narrower'} direction
 * @returns {number} index of chosen candidate, or -1 if none qualifies
 */
export function pickNeighbour(windowRect, candidates, direction) {
  const wcx = windowRect.x + windowRect.width / 2;
  const wcy = windowRect.y + windowRect.height / 2;

  const scored = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const ccx = c.x + c.width / 2;
    const ccy = c.y + c.height / 2;
    const dCenterX = ccx - wcx;
    const dCenterY = ccy - wcy;
    const dWidth = c.width - windowRect.width;
    const dHeight = c.height - windowRect.height;

    // `tie` is an ordered list compared lexicographically (each entry smaller
    // is better). It must be direction-symmetric: a plain |Δwidth| would score
    // a narrower-by-N and a wider-by-N candidate identically, leaving the pick
    // to fall through to config order — which differs left vs right and breaks
    // mirror symmetry. So left/right tie-break on absolute candidate width
    // (narrower wins) instead.
    let pass, primary, tie;
    if (direction === 'left') {
      pass = ccx < wcx - EPS;
      primary = Math.abs(dCenterX);
      tie = [c.width, Math.abs(dCenterY), Math.abs(dHeight)];
    } else if (direction === 'right') {
      pass = ccx > wcx + EPS;
      primary = Math.abs(dCenterX);
      tie = [c.width, Math.abs(dCenterY), Math.abs(dHeight)];
    } else if (direction === 'wider') {
      pass = c.width > windowRect.width + EPS;
      primary = Math.abs(dWidth);
      tie = [Math.abs(dCenterX), Math.abs(dCenterY), Math.abs(dHeight)];
    } else if (direction === 'narrower') {
      pass = c.width < windowRect.width - EPS;
      primary = Math.abs(dWidth);
      tie = [Math.abs(dCenterX), Math.abs(dCenterY), Math.abs(dHeight)];
    } else {
      return -1;
    }
    if (pass) scored.push({ i, primary, tie });
  }

  if (scored.length === 0) return -1;

  // Lexicographic minimum: smallest primary key, then smallest tie-break list.
  // Group near-equal primaries (within EPS) so size variants tie-break together.
  const minPrimary = Math.min(...scored.map(s => s.primary));
  const contenders = scored.filter(s => s.primary <= minPrimary + EPS);
  contenders.sort((a, b) => {
    for (let k = 0; k < a.tie.length; k++) {
      if (a.tie[k] !== b.tie[k]) return a.tie[k] - b.tie[k];
    }
    return a.i - b.i;
  });
  return contenders[0].i;
}
