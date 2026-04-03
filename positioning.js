// positioning.js — Pure-function grid math. No gi:// imports.

/**
 * Convert a grid selection to pixel coordinates within a work area.
 * @param {{anchor: {col: number, row: number}, target: {col: number, row: number}}} selection - 0-indexed
 * @param {{cols: number, rows: number}} gridSize
 * @param {{x: number, y: number, width: number, height: number}} workArea
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function gridToPixels(selection, gridSize, workArea) {
  const { cols, rows } = gridSize;
  const col1 = Math.min(selection.anchor.col, selection.target.col);
  const row1 = Math.min(selection.anchor.row, selection.target.row);
  const col2 = Math.max(selection.anchor.col, selection.target.col);
  const row2 = Math.max(selection.anchor.row, selection.target.row);

  return {
    x: workArea.x + (col1 / cols) * workArea.width,
    y: workArea.y + (row1 / rows) * workArea.height,
    width: ((col2 - col1 + 1) / cols) * workArea.width,
    height: ((row2 - row1 + 1) / rows) * workArea.height,
  };
}

/**
 * Parse a position preset string into structured preset objects.
 * Format: "COLSxROWS C1:R1 C2:R2[, [COLSxROWS] C1:R1 C2:R2]..."
 * Coordinates in the string are 1-indexed; returned values are 0-indexed.
 * Subsequent presets inherit the grid size if not specified.
 *
 * @param {string|null|undefined} str
 * @returns {Array<{gridSize: {cols: number, rows: number}, selection: {anchor: {col: number, row: number}, target: {col: number, row: number}}}>}
 */
export function parsePositionPresets(str) {
  if (!str || !str.trim()) return [];

  const parts = str.split(',').map(s => s.trim());
  const result = [];
  let gridSize = null;

  for (const part of parts) {
    const tokens = part.split(/\s+/);
    let idx = 0;

    if (tokens[idx].includes('x')) {
      const [cols, rows] = tokens[idx].split('x').map(Number);
      gridSize = { cols, rows };
      idx++;
    }

    if (!gridSize || tokens.length < idx + 2) continue;

    const [c1, r1] = tokens[idx].split(':').map(Number);
    const [c2, r2] = tokens[idx + 1].split(':').map(Number);

    result.push({
      gridSize: { ...gridSize },
      selection: {
        anchor: { col: c1 - 1, row: r1 - 1 },
        target: { col: c2 - 1, row: r2 - 1 },
      },
    });
  }

  return result;
}
