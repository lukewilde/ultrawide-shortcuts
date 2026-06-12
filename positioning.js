// positioning.js — Pure grid math. No gi:// imports.

// Convert a 0-indexed grid selection to pixel coordinates within a work area.
export function gridToPixels(selection, gridSize, workArea, cellGap = 0) {
  const { cols, rows } = gridSize;
  // Clamp so a stale stored position (or a since-shrunk grid) can't go off-screen.
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

// Shrink a work area by an edge margin on all sides, clamped so the result
// stays positive on small/portrait monitors.
export function shrinkWorkArea(workArea, margin = 0) {
  const maxMargin = Math.max(0, Math.floor(Math.min(workArea.width, workArea.height) / 2) - 1);
  const m = Math.max(0, Math.min(margin, maxMargin));
  return {
    x: workArea.x + m,
    y: workArea.y + m,
    width: workArea.width - 2 * m,
    height: workArea.height - 2 * m,
  };
}

const EPS = 2;

// Pick the index of the neighbouring candidate rect in a direction
// ('left'|'right'|'wider'|'narrower'), or -1 if none qualifies. Candidates the
// window already sits on (within EPS px) are excluded.
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

    // `tie` compares lexicographically. Left/right tie-break on absolute
    // candidate width (narrower wins), not |Δwidth| — that keeps the two
    // directions mirror-symmetric instead of falling through to config order.
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
