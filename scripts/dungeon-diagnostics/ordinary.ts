import { generateStructuredMaze } from '../../src/domain/maze/structuredGenerate';
import { nameRooms } from '../../src/domain/maze/structuredRooms';
import { movePosition, opposite } from '../../src/domain/maze/movement';
import type { GridPosition, MazeState } from '../../src/domain/types';
import { graphMetrics } from './graph';

export function seededRng(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// Mirrors the private gameFactory progression; a separate test checks real descent.
export function floorDimensions(level: number) {
  if (!Number.isSafeInteger(level) || level < 1 || level > 128) throw new RangeError('Diagnostic floor bound is 1..128');
  let mazeMaxRooms = 32;
  for (let floor = 1; floor < level; floor++) {
    mazeMaxRooms = Math.ceil(mazeMaxRooms * 1.3);
    if (!Number.isSafeInteger(mazeMaxRooms)) throw new RangeError('Diagnostic progression exceeds exact integer range');
  }
  const rows = Math.max(9, Math.ceil(Math.sqrt(mazeMaxRooms)));
  return { mazeMaxRooms, rows, columns: rows + 4 };
}

export function measureOrdinary(seed: number, level: number, maxCells = 100_000) {
  const dimensions = floorDimensions(level);
  if (dimensions.rows * dimensions.columns > maxCells) return {
    seed, level, version: 'structured-v2', status: 'limited', dimensions, reason: 'cell-allocation-limit', metrics: null,
  };
  return { seed, level, ...measureOrdinarySize(dimensions.rows, dimensions.columns, seed), dimensions };
}

export function measureOrdinarySize(rows: number, columns: number, seed: number) {
  let rngCalls = 0;
  const rng = seededRng(seed);
  const maze = generateStructuredMaze(rows, columns, () => { rngCalls++; return rng(); });
  return inspectOrdinary(maze, rngCalls);
}

export function inspectOrdinary(maze: MazeState, rngCalls: number | null = null) {
  const { rows, columns } = maze;
  const rooms = maze.layout!.rooms;
  const links = maze.layout!.connections!;
  const graph = graphMetrics(rooms.map(room => room.id), links.map(link => ({ from: link.fromRoomId, to: link.toRoomId })));
  const roomArea = rooms.reduce((total, room) => total + room.rows * room.columns, 0);
  const passages = new Set(links.flatMap(link => link.path.slice(1, -1).map(key)));
  const occupied = maze.cells.filter(cell => cell.links.length > 0 || key(cell) === key(maze.start));
  const search = cellSearch(maze);
  const fromStart = search(maze.start);
  let distanceTotal = 0;
  let pairs = 0;
  for (let index = 0; index < rooms.length; index++) {
    const distances = search(rooms[index].center);
    for (const other of rooms.slice(index + 1)) {
      const distance = distances.get(key(other.center));
      if (distance === undefined) continue;
      distanceTotal += distance;
      pairs++;
    }
  }
  let overlapPairs = 0;
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    const x = rooms[a], y = rooms[b];
    if (x.row < y.row + y.rows && y.row < x.row + x.rows && x.column < y.column + y.columns && y.column < x.column + x.columns) overlapPairs++;
  }
  const roomCells = new Set(rooms.flatMap(room => Array.from({ length: room.rows * room.columns }, (_, i) =>
    key({ row: room.row + Math.floor(i / room.columns), column: room.column + i % room.columns }))));
  const cellsByKey = new Map(maze.cells.map(cell => [key(cell), cell]));
  const legal = (position: GridPosition) => Number.isInteger(position.row) && Number.isInteger(position.column)
    && position.row >= 0 && position.row < rows && position.column >= 0 && position.column < columns;
  const invalidLocalLinks = maze.cells.reduce((count, cell) => count + cell.links.filter(direction => {
    const target = movePosition(cell, direction);
    return !legal(cell) || !legal(target) || !cellsByKey.get(key(target))?.links.includes(opposite(direction));
  }).length + cell.links.length - new Set(cell.links).size, 0);
  const connectorViolations = links.reduce((count, link) => count + link.path.slice(1).filter((cell, i) =>
    !legal(cell) || !legal(link.path[i]) || !cellsByKey.get(key(link.path[i]))?.links.some(direction =>
      key(movePosition(link.path[i], direction)) === key(cell) && cellsByKey.get(key(cell))?.links.includes(opposite(direction)))).length, 0);
  const corridorSteps = links.map(link => link.path.length - 1);
  const invalidRoles = rooms.filter(room => !room.kind || !room.name || !Array.isArray(room.tags)).length;
  return { version: 'structured-v2', status: 'complete', metrics: {
    rooms: rooms.length, graph, roomArea, allocatedCells: rows * columns,
    walkableCells: occupied.length, reachableCells: fromStart.size,
    roomCoverage: roomArea / (rows * columns), walkableCoverage: occupied.length / (rows * columns),
    passageCells: passages.size, roomFractionOfWalkable: roomArea / occupied.length,
    maxRoomSide: Math.max(...rooms.flatMap(room => [room.rows, room.columns])),
    minRoomSide: Math.min(...rooms.flatMap(room => [room.rows, room.columns])),
    meanCorridorSteps: links.length ? corridorSteps.reduce((a, b) => a + b, 0) / links.length : 0,
    maxCorridorSteps: Math.max(0, ...corridorSteps), exitSteps: fromStart.get(key(maze.end)) ?? null,
    meanRoomPairSteps: pairs ? distanceTotal / pairs : 0, invalidRoles, overlapPairs, connectorViolations, invalidLocalLinks,
    duplicateCells: maze.cells.length - cellsByKey.size,
    corridorRoomIntrusions: [...passages].filter(cell => roomCells.has(cell)).length,
    sockets: null, socketUtilization: null, rngCalls,
  }, geometry: { rooms, paths: links.map(link => link.path), start: maze.start, end: maze.end, bounds: { row: 0, column: 0, rows, columns } } };
}

function key(cell: GridPosition) { return `${cell.row},${cell.column}`; }

function cellSearch(maze: MazeState) {
  const cells = new Map(maze.cells.map(cell => [key(cell), cell]));
  return (start: GridPosition) => {
    const distances = new Map([[key(start), 0]]);
    const queue = [start];
    for (const cell of queue) for (const direction of cells.get(key(cell))?.links ?? []) {
      const next = movePosition(cell, direction);
      if (next.row < 0 || next.column < 0 || next.row >= maze.rows || next.column >= maze.columns
        || !cells.get(key(next))?.links.includes(opposite(direction))) continue;
      if (distances.has(key(next))) continue;
      distances.set(key(next), distances.get(key(cell))! + 1);
      queue.push(next);
    }
    return distances;
  };
}

export function roleBoundaryProbe(count = 12) {
  const footprints = Array.from({ length: count }, (_, index) => ({ row: 0, column: index * 4,
    rows: 3, columns: 3, center: { row: 1, column: index * 4 + 1 } }));
  const rooms = nameRooms(footprints, 1);
  return { requestedRooms: count, invalidRoles: rooms.filter(room => !room.kind || !room.name || !Array.isArray(room.tags)).length,
    roles: rooms.map(room => room.kind ?? null) };
}
