import { describe, expect, it } from 'vitest';
import { generateMaze } from '../../domain/maze/generate';
import { generateStructuredMaze } from '../../domain/maze/structuredGenerate';
import { movePosition } from '../../domain/maze/movement';
import { cellKey } from '../../domain/maze/key';
import { collectWalls } from './drawMaze';
import { isMazeFloorCell } from './mazeFloor';

describe('topology-authoritative wall projection', () => {
  it('draws exactly the closed floor edges and never a wall through a doorway', () => {
    const maze = generateStructuredMaze(31, 37, () => 0.42);
    const walls = collectWalls(maze);
    const expectedHorizontal = new Set<string>();
    const expectedVertical = new Set<string>();
    for (const cell of maze.cells.filter(cell => isMazeFloorCell(maze, cell))) {
      const { row, column } = cell;
      if (!cell.links.includes('north')) expectedHorizontal.add(`${row}:${column}`);
      if (!cell.links.includes('south')) expectedHorizontal.add(`${row + 1}:${column}`);
      if (!cell.links.includes('west')) expectedVertical.add(`${row}:${column}`);
      if (!cell.links.includes('east')) expectedVertical.add(`${row}:${column + 1}`);
      for (const direction of cell.links) {
        const next = movePosition(cell, direction);
        const wall = cellKey({ row: Math.max(row, next.row), column: Math.max(column, next.column) });
        expect((direction === 'north' || direction === 'south' ? walls.horizontal : walls.vertical).has(wall)).toBe(false);
      }
    }
    expect(walls.horizontal).toEqual(expectedHorizontal);
    expect(walls.vertical).toEqual(expectedVertical);
    expect(maze.cells.filter(cell => !isMazeFloorCell(maze, cell)).length).toBeGreaterThan(0);
  });

  it('leaves classic and saved v1 isolated cells visible with four walls', () => {
    const maze = generateMaze(1, 1);
    expect(isMazeFloorCell(maze, maze.cells[0])).toBe(true);
    expect(collectWalls(maze)).toEqual({ horizontal: new Set(['0:0', '1:0']), vertical: new Set(['0:0', '0:1']) });
    maze.layout = { version: 'structured-v1', rooms: [], mainPath: [], zones: [] };
    expect(isMazeFloorCell(maze, maze.cells[0])).toBe(true);
    expect(collectWalls(maze)).toEqual({ horizontal: new Set(['0:0', '1:0']), vertical: new Set(['0:0', '0:1']) });
    maze.layout.version = 'structured-v2';
    expect(isMazeFloorCell(maze, maze.cells[0])).toBe(true);
  });
});
