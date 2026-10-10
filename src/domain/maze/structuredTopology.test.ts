import { describe, expect, it } from 'vitest';
import type { GridPosition, MazeRoomState, MazeState } from '../types';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { generateChestsForMaze } from '../items/chests';
import { generateMaze } from './generate';
import { cellKey } from './key';
import { movePosition, opposite } from './movement';
import { findPath, nextDirectionToTarget } from './solver';
import { generateStructuredMaze } from './structuredGenerate';
import { ROOM_BUFFER } from './structuredRooms';
import { computeVisibleCells } from './visibility';

const SIZES = [[1, 1], [1, 9], [9, 1], [2, 9], [3, 3], [3, 7], [5, 5], [5, 9], [9, 9], [9, 13], [13, 9], [15, 15], [21, 25], [31, 37], [61, 65], [7, 31], [31, 7]];
const SEEDS = [0, 1, 2, 3, 7, 19, 42, 123, 1000, 20261008];

describe('structured-v2 topology contract', () => {
  it.each(SIZES)('keeps %ix%i footprints, graph, links and objectives consistent across seeds', (rows, columns) => {
    for (const seed of SEEDS) {
      const maze = generateStructuredMaze(rows, columns, seededRng(seed));
      expect(maze, `determinism ${rows}x${columns}, seed ${seed}`).toEqual(generateStructuredMaze(rows, columns, seededRng(seed)));
      verifyTopology(maze);
    }
  });

  it('handles adversarial constant random sources without retrying', () => {
    for (const value of [0, 0.42, 0.999999]) {
      for (const [rows, columns] of SIZES) verifyTopology(generateStructuredMaze(rows, columns, () => value));
    }
  });

  it('varies room footprints and graph choices without using a universal hub star', () => {
    const layouts = SEEDS.map(seed => generateStructuredMaze(31, 37, seededRng(seed)).layout!);
    expect(new Set(layouts.map(layout => JSON.stringify(layout.rooms))).size).toBeGreaterThan(5);
    expect(new Set(layouts.map(layout => JSON.stringify(layout.connections))).size).toBeGreaterThan(5);
    expect(layouts.some(layout => layout.connections!.some(edge => edge.kind === 'loop'))).toBe(true);
    for (const layout of layouts) {
      const hub = layout.rooms.find(room => room.kind === 'hub')!;
      expect(layout.connections!.filter(edge => edge.fromRoomId === hub.id || edge.toRoomId === hub.id).length).toBeLessThan(layout.rooms.length - 1);
    }
  });

  it('keeps auto exit routing and visibility on the same traversable graph', () => {
    let maze = generateStructuredMaze(31, 37, seededRng(20261008));
    const reachable = reachableKeys(maze);
    for (const position of computeVisibleCells(maze)) expect(reachable.has(cellKey(position))).toBe(true);
    let steps = 0;
    while (cellKey(maze.active) !== cellKey(maze.end) && steps < maze.cells.length) {
      const direction = nextDirectionToTarget(maze);
      expect(direction).toBeDefined();
      maze = { ...maze, active: movePosition(maze.active, direction!) };
      steps++;
    }
    expect(maze.active).toEqual(maze.end);
  });

  it('serializes v2 layout and preserves saved v1 geometry without regeneration', () => {
    const maze = generateStructuredMaze(9, 13, seededRng(42));
    expect(JSON.parse(JSON.stringify(maze))).toEqual(maze);
    const classic = generateMaze(9, 13, seededRng(42));
    const v1: MazeState = { ...classic, layout: { version: 'structured-v1', rooms: maze.layout!.rooms, mainPath: [], zones: [] } };
    const saved = createNewGameState({ maze: v1 });
    const normalized = normalizeGameState(JSON.parse(JSON.stringify(saved)));
    expect(normalized.maze.cells).toEqual(v1.cells);
    expect(normalized.maze.layout).toEqual(v1.layout);
    expect(normalized.maze.start).toEqual(v1.start);
    expect(normalized.maze.end).toEqual(v1.end);
  });

  it.each([[0, 9], [9, 0], [-1, 9], [1.5, 9], [9, NaN], [Infinity, 9]])('rejects invalid dimensions %s x %s', (rows, columns) => {
    expect(() => generateStructuredMaze(rows, columns)).toThrow(RangeError);
  });
});

function verifyTopology(maze: MazeState) {
  const { rooms, connections = [], mainPath } = maze.layout!;
  const owners = new Map<string, string>();
  const expectedLinks = new Set<string>();
  const byKey = new Map(maze.cells.map(cell => [cellKey(cell), cell]));
  expect(maze.cells).toHaveLength(maze.rows * maze.columns);
  expect(rooms.length).toBeLessThanOrEqual(8);
  const capacity = Math.ceil(maze.rows / 2) * Math.ceil(maze.columns / 2);
  if (capacity >= 5) {
    expect(rooms.map(room => room.kind)).toEqual(expect.arrayContaining(['start', 'hub', 'exit', 'treasure', 'boss']));
  }
  for (const room of rooms) {
    expect(room.row >= 0 && room.column >= 0 && room.row + room.rows <= maze.rows && room.column + room.columns <= maze.columns).toBe(true);
    expect(contains(room, room.center)).toBe(true);
    for (const other of rooms) {
      if (room === other) continue;
      expect(room.row + room.rows + ROOM_BUFFER <= other.row || other.row + other.rows + ROOM_BUFFER <= room.row ||
        room.column + room.columns + ROOM_BUFFER <= other.column || other.column + other.columns + ROOM_BUFFER <= room.column).toBe(true);
    }
    for (let row = room.row; row < room.row + room.rows; row++) {
      for (let column = room.column; column < room.column + room.columns; column++) {
        const position = { row, column };
        expect(owners.has(cellKey(position))).toBe(false);
        owners.set(cellKey(position), room.id);
        if (row + 1 < room.row + room.rows) addLink(expectedLinks, position, { row: row + 1, column });
        if (column + 1 < room.column + room.columns) addLink(expectedLinks, position, { row, column: column + 1 });
      }
    }
  }
  const corridorOwners = new Map<string, string>();
  const pairs = new Set<string>();
  expect(connections.filter(edge => edge.kind === 'tree')).toHaveLength(rooms.length - 1);
  for (const connection of connections) {
    const from = rooms.find(room => room.id === connection.fromRoomId)!;
    const to = rooms.find(room => room.id === connection.toRoomId)!;
    const pair = [from.id, to.id].sort().join('|');
    expect(pairs.has(pair)).toBe(false);
    pairs.add(pair);
    expect(connection.width).toBe(1);
    expect(onBoundary(from, connection.fromDoor)).toBe(true);
    expect(onBoundary(to, connection.toDoor)).toBe(true);
    expect(connection.path[0]).toEqual(connection.fromDoor);
    expect(connection.path.at(-1)).toEqual(connection.toDoor);
    expect(connection.path.length).toBeGreaterThanOrEqual(3);
    for (const position of connection.path.slice(1, -1)) {
      const key = cellKey(position);
      expect(owners.has(key), `corridor crosses room at ${key}`).toBe(false);
      expect(corridorOwners.has(key), `corridors cross at ${key}`).toBe(false);
      corridorOwners.set(key, connection.id);
      expect(byKey.get(key)?.links).toHaveLength(2);
    }
    for (let index = 1; index < connection.path.length; index++) {
      const a = connection.path[index - 1];
      const b = connection.path[index];
      expect(Math.abs(a.row - b.row) + Math.abs(a.column - b.column)).toBe(1);
      addLink(expectedLinks, a, b);
    }
  }
  const actualLinks = new Set<string>();
  for (const cell of maze.cells) {
    expect(new Set(cell.links).size).toBe(cell.links.length);
    if (!owners.has(cellKey(cell)) && !corridorOwners.has(cellKey(cell))) expect(cell.links).toEqual([]);
    for (const direction of cell.links) {
      const next = movePosition(cell, direction);
      expect(byKey.get(cellKey(next))?.links).toContain(opposite(direction));
      actualLinks.add(`${cellKey(cell)}>${cellKey(next)}`);
    }
  }
  // Exact equality rejects hidden openings, blanket widening, and inherited classic links.
  expect(actualLinks).toEqual(expectedLinks);
  expect(mainPath[0]).toEqual(maze.start);
  expect(mainPath.at(-1)).toEqual(maze.end);
  const hub = rooms.find(room => room.kind === 'hub');
  if (hub) expect(mainPath).toContainEqual(hub.center);
  for (let index = 1; index < mainPath.length; index++) {
    expect(actualLinks.has(`${cellKey(mainPath[index - 1])}>${cellKey(mainPath[index])}`)).toBe(true);
  }
  const reachable = reachableKeys(maze);
  expect(reachable).toEqual(new Set(maze.cells.filter(cell => cell.links.length > 0 || cellKey(cell) === cellKey(maze.start)).map(cellKey)));
  const targets = [maze.end, ...rooms.map(room => room.center), ...generateChestsForMaze(1, maze).map(chest => chest.position)];
  for (const target of targets) expect(findPath(maze, target)).toBeDefined();
}

function addLink(links: Set<string>, a: GridPosition, b: GridPosition) {
  links.add(`${cellKey(a)}>${cellKey(b)}`);
  links.add(`${cellKey(b)}>${cellKey(a)}`);
}

function contains(room: MazeRoomState, position: GridPosition) {
  return position.row >= room.row && position.column >= room.column && position.row < room.row + room.rows && position.column < room.column + room.columns;
}

function onBoundary(room: MazeRoomState, position: GridPosition) {
  return contains(room, position) && (position.row === room.row || position.row === room.row + room.rows - 1 || position.column === room.column || position.column === room.column + room.columns - 1);
}

function reachableKeys(maze: MazeState) {
  const cells = new Map(maze.cells.map(cell => [cellKey(cell), cell]));
  const seen = new Set([cellKey(maze.start)]);
  const queue = [maze.start];
  for (const current of queue) {
    for (const direction of cells.get(cellKey(current))!.links) {
      const next = movePosition(current, direction);
      if (seen.has(cellKey(next))) continue;
      seen.add(cellKey(next));
      queue.push(next);
    }
  }
  return seen;
}

function seededRng(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
