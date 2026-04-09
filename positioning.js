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
  const col1 = Math.min(selection.anchor.col, selection.target.col);
  const row1 = Math.min(selection.anchor.row, selection.target.row);
  const col2 = Math.max(selection.anchor.col, selection.target.col);
  const row2 = Math.max(selection.anchor.row, selection.target.row);

  const cellW = (workArea.width - (cols - 1) * cellGap) / cols;
  const cellH = (workArea.height - (rows - 1) * cellGap) / rows;

  return {
    x: workArea.x + col1 * (cellW + cellGap),
    y: workArea.y + row1 * (cellH + cellGap),
    width: (col2 - col1 + 1) * cellW + (col2 - col1) * cellGap,
    height: (row2 - row1 + 1) * cellH + (row2 - row1) * cellGap,
  };
}
