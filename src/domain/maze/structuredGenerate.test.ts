import { describe, expect, it } from 'vitest';
import type { GridPosition, MazeCellState, MazeState } from '../types';
import { generateMaze } from './generate';
import { cellKey } from './key';
import { generateStructuredMaze } from './structuredGenerate';

describe('generateStructuredMaze', () => {
  it('keeps the classic generator unlayered', () => {
    const maze = generateMaze(9, 13, constantRng);

    expect(maze.layout).toBeUndefined();
    expect(maze.cells).toHaveLength(117);
  });

  it('adds rooms, zones, and main paths without changing the grid shape', () => {
    const maze = generateStructuredMaze(21, 25, constantRng);

    expect(maze.rows).toBe(21);
    expect(maze.columns).toBe(25);
    expect(maze.cells).toHaveLength(525);
    expect(maze.layout?.version).toBe('structured-v1');
    expect(maze.layout?.rooms.length).toBeGreaterThanOrEqual(3);
    expect(maze.layout?.rooms.every((room) => room.tags.includes('questRelevant'))).toBe(true);
    expect(maze.layout?.zones.map((zone) => zone.id)).toEqual(['north-wing', 'central-vaults', 'south-catacombs']);
    expect(maze.layout?.mainPath.length).toBeGreaterThan(0);
    expect(maze.visibility?.explored.length).toBeGreaterThan(1);
  });

  it('carves each generated room into an open pocket', () => {
    const maze = generateStructuredMaze(21, 25, constantRng);
    const byKey = new Map(maze.cells.map((cell) => [cellKey(cell), cell]));
    const rooms = maze.layout?.rooms ?? [];

    expect(rooms.length).toBeGreaterThan(0);

    for (const room of rooms) {
      const center = byKey.get(cellKey(room.center));
      expect(center?.links.length).toBeGreaterThanOrEqual(2);

      for (let row = room.row; row < room.row + room.rows; row++) {
        for (let column = room.column; column < room.column + room.columns; column++) {
          expectRoomAdjacency(maze, byKey, { row, column }, room.row, room.column, room.rows, room.columns);
        }
      }
    }
  });
});

function expectRoomAdjacency(
  maze: MazeState,
  byKey: Map<string, MazeCellState>,
  position: GridPosition,
  roomRow: number,
  roomColumn: number,
  roomRows: number,
  roomColumns: number,
) {
  const cell = byKey.get(cellKey(position));
  expect(cell).toBeDefined();

  if (position.row > roomRow) expect(cell?.links).toContain('north');
  if (position.row < roomRow + roomRows - 1) expect(cell?.links).toContain('south');
  if (position.column > roomColumn) expect(cell?.links).toContain('west');
  if (position.column < roomColumn + roomColumns - 1) expect(cell?.links).toContain('east');
  expect(position.row).toBeGreaterThanOrEqual(0);
  expect(position.column).toBeGreaterThanOrEqual(0);
  expect(position.row).toBeLessThan(maze.rows);
  expect(position.column).toBeLessThan(maze.columns);
}

function constantRng() {
  return 0.42;
}
