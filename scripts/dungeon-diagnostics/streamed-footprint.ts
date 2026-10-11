import type { Bounds } from '../../src/domain/expedition/topology/types';

export function enclosingBounds(rectangles: Bounds[]): Bounds | null {
  if (!rectangles.length) return null;
  const row = Math.min(...rectangles.map(value => value.row));
  const column = Math.min(...rectangles.map(value => value.column));
  return { row, column, rows: Math.max(...rectangles.map(value => value.row + value.rows)) - row,
    columns: Math.max(...rectangles.map(value => value.column + value.columns)) - column };
}

// Sweep rectangle boundaries, not the potentially sparse world-coordinate grid.
function unionArea(rectangles: Bounds[]) {
  const rows = [...new Set(rectangles.flatMap(value => [value.row, value.row + value.rows]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 1; index < rows.length; index++) {
    const intervals = rectangles.filter(value => value.row < rows[index] && value.row + value.rows > rows[index - 1])
      .map(value => [value.column, value.column + value.columns]).sort((a, b) => a[0] - b[0]);
    let end = -Infinity;
    let width = 0;
    for (const [left, right] of intervals) {
      width += Math.max(0, right - Math.max(left, end));
      end = Math.max(end, right);
    }
    area += width * (rows[index] - rows[index - 1]);
  }
  return area;
}

export function footprint(rectangles: Bounds[]) {
  const bounds = enclosingBounds(rectangles);
  const area = unionArea(rectangles);
  const boundingArea = bounds ? bounds.rows * bounds.columns : 0;
  return { bounds, summedArea: rectangles.reduce((sum, value) => sum + value.rows * value.columns, 0),
    unionArea: area, boundingArea, coverage: boundingArea ? area / boundingArea : null };
}
