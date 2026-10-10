import type { Direction, GridPosition, MazeCellState, MazeRoomState, MazeState, MazeZoneState } from '../types';
import { defaultRng, type Rng } from '../combat/rng';
import { cellKey } from './key';
import { movePosition, opposite } from './movement';
import { revealMazeVisibility } from './visibility';
import { nameRooms, placeRoomFootprints } from './structuredRooms';
import { orthogonalPath, planRoomGraph, routeRoomConnections } from './structuredGraph';

export { roomTagsForKind } from './structuredRooms';

export function generateStructuredMaze(rows: number, columns: number, rng: Rng = defaultRng): MazeState {
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1) {
    throw new RangeError('Structured maze dimensions must be positive integers.');
  }
  const { footprints, latticeRows, latticeColumns } = placeRoomFootprints(rows, columns, rng);
  const { edges, mainRoute, hubIndex } = planRoomGraph(latticeRows, latticeColumns, rng);
  const rooms = nameRooms(footprints, hubIndex);
  const connections = routeRoomConnections(rooms, edges);
  const cells: MazeCellState[] = Array.from({ length: rows * columns }, (_, index) => ({
    row: Math.floor(index / columns), column: index % columns, links: [],
  }));
  const byKey = new Map(cells.map(cell => [cellKey(cell), cell]));
  for (const room of rooms) carveRoom(byKey, room);
  for (const connection of connections) carvePath(byKey, connection.path);
  const start = { row: 0, column: 0 };
  const end = { row: rows - 1, column: columns - 1 };
  const mainPath: GridPosition[] = [start];
  for (let index = 1; index < mainRoute.length; index++) {
    const from = rooms[mainRoute[index - 1]];
    const to = rooms[mainRoute[index]];
    const connection = connections.find(edge => edge.fromRoomId === from.id && edge.toRoomId === to.id || edge.fromRoomId === to.id && edge.toRoomId === from.id)!;
    const path = connection.fromRoomId === from.id ? connection.path : [...connection.path].reverse();
    mainPath.push(...orthogonalPath([mainPath[mainPath.length - 1], from.center, path[0]]).slice(1), ...path.slice(1));
  }
  mainPath.push(...orthogonalPath([mainPath[mainPath.length - 1], rooms[rooms.length - 1].center, end]).slice(1));

  return revealMazeVisibility({
    rows, columns, cells, start, end, active: start, visited: [start],
    layout: { version: 'structured-v2', rooms, connections, mainPath, zones: createZones(rows, columns) },
  });
}

function carveRoom(byKey: Map<string, MazeCellState>, room: MazeRoomState) {
  for (let row = room.row; row < room.row + room.rows; row++) {
    for (let column = room.column; column < room.column + room.columns; column++) {
      if (row + 1 < room.row + room.rows) linkCells(byKey, { row, column }, 'south');
      if (column + 1 < room.column + room.columns) linkCells(byKey, { row, column }, 'east');
    }
  }
}

function carvePath(byKey: Map<string, MazeCellState>, path: GridPosition[]) {
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const direction = to.row > from.row ? 'south' : to.row < from.row ? 'north' : to.column > from.column ? 'east' : 'west';
    linkCells(byKey, from, direction);
  }
}

function linkCells(byKey: Map<string, MazeCellState>, from: GridPosition, direction: Direction) {
  const fromCell = byKey.get(cellKey(from))!;
  const toCell = byKey.get(cellKey(movePosition(from, direction)))!;
  if (!fromCell.links.includes(direction)) fromCell.links.push(direction);
  const reverse = opposite(direction);
  if (!toCell.links.includes(reverse)) toCell.links.push(reverse);
}

function createZones(rows: number, columns: number): MazeZoneState[] {
  const northEnd = Math.max(1, Math.floor(rows / 3));
  const southStart = Math.max(northEnd, Math.ceil(rows * 2 / 3));
  return [
    { id: 'north-wing', name: 'North Wing', tint: 'rgba(66, 105, 82, 0.14)', rowStart: 0, rowEnd: northEnd, columnStart: 0, columnEnd: columns },
    { id: 'central-vaults', name: 'Central Vaults', tint: 'rgba(77, 95, 143, 0.12)', rowStart: northEnd, rowEnd: southStart, columnStart: 0, columnEnd: columns },
    { id: 'south-catacombs', name: 'South Catacombs', tint: 'rgba(137, 86, 58, 0.13)', rowStart: southStart, rowEnd: rows, columnStart: 0, columnEnd: columns },
  ];
}
