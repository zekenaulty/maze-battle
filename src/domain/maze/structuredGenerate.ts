import type { Direction, GridPosition, MazeCellState, MazeRoomKind, MazeRoomState, MazeRoomTag, MazeState, MazeZoneState } from '../types';
import { defaultRng, type Rng } from '../combat/rng';
import { cellKey } from './key';
import { generateMaze } from './generate';
import { movePosition, opposite } from './movement';
import { revealMazeVisibility } from './visibility';

interface RoomSeed {
  kind: MazeRoomKind;
  name: string;
  position: GridPosition;
}

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
const FAR_ROOM_KINDS: Array<Pick<RoomSeed, 'kind' | 'name'>> = [
  { kind: 'treasure', name: 'Vault' },
  { kind: 'safe', name: 'Sanctuary' },
  { kind: 'boss', name: 'Guard Post' },
  { kind: 'treasure', name: 'Reliquary' },
  { kind: 'safe', name: 'Watch Room' },
];

export function generateStructuredMaze(rows: number, columns: number, rng: Rng = defaultRng): MazeState {
  const base = generateMaze(rows, columns, rng);
  const cells = base.cells.map((cell) => ({ ...cell, links: [...cell.links] }));
  const byKey = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const rooms = selectRooms(base, rng);
  const mainPath = new Map<string, GridPosition>();

  for (const room of rooms) {
    carveRoom(byKey, room);
  }

  for (const position of carveRoomConnections(byKey, rows, columns, rooms, rng)) {
    mainPath.set(cellKey(position), position);
  }

  return revealMazeVisibility({
    ...base,
    cells,
    layout: {
      version: 'structured-v1',
      rooms,
      mainPath: Array.from(mainPath.values()),
      zones: createZones(rows, columns),
    },
  });
}

function selectRooms(maze: MazeState, rng: Rng) {
  const targetCount = clamp(Math.floor((maze.rows * maze.columns) / 640) + 3, 3, 8);
  const roomSize = maze.rows >= 15 && maze.columns >= 15 ? 5 : 3;
  const seeds: RoomSeed[] = [
    { kind: 'start', name: 'Entry Hall', position: maze.start },
    { kind: 'hub', name: 'Central Hub', position: { row: Math.floor(maze.rows / 2), column: Math.floor(maze.columns / 2) } },
    { kind: 'exit', name: 'Descent Gate', position: maze.end },
  ];

  while (seeds.length < targetCount) {
    const candidate = farthestCandidate(maze, seeds, rng);
    const template = FAR_ROOM_KINDS[(seeds.length - 3) % FAR_ROOM_KINDS.length];
    seeds.splice(seeds.length - 1, 0, {
      ...template,
      name: `${template.name} ${seeds.length - 2}`,
      position: candidate,
    });
  }

  return seeds.map((seed, index) => createRoom(seed, roomSize, maze.rows, maze.columns, index));
}

function createRoom(seed: RoomSeed, size: number, rows: number, columns: number, index: number): MazeRoomState {
  const roomRows = Math.min(rows, seed.kind === 'hub' && size >= 5 ? size : Math.max(3, size));
  const roomColumns = Math.min(columns, seed.kind === 'hub' && size >= 5 ? size : Math.max(3, size));
  const row = clamp(seed.position.row - Math.floor(roomRows / 2), 0, Math.max(0, rows - roomRows));
  const column = clamp(seed.position.column - Math.floor(roomColumns / 2), 0, Math.max(0, columns - roomColumns));

  return {
    id: `${seed.kind}-${index}`,
    kind: seed.kind,
    name: seed.name,
    row,
    column,
    rows: roomRows,
    columns: roomColumns,
    center: {
      row: clamp(seed.position.row, row, row + roomRows - 1),
      column: clamp(seed.position.column, column, column + roomColumns - 1),
    },
    tags: roomTagsForKind(seed.kind),
  };
}

export function roomTagsForKind(kind: MazeRoomKind): MazeRoomTag[] {
  switch (kind) {
    case 'start':
    case 'hub':
      return ['safe', 'questRelevant'];
    case 'safe':
      return ['safe', 'rare', 'questRelevant'];
    case 'treasure':
      return ['rare', 'questRelevant'];
    case 'boss':
      return ['hostile', 'rare', 'questRelevant'];
    case 'exit':
      return ['questRelevant'];
  }
}

function farthestCandidate(maze: MazeState, seeds: RoomSeed[], rng: Rng): GridPosition {
  let best: GridPosition = { row: Math.floor(maze.rows / 2), column: Math.floor(maze.columns / 2) };
  let bestScore = -Infinity;
  const margin = maze.rows >= 9 && maze.columns >= 9 ? 2 : 1;

  for (let row = margin; row < maze.rows - margin; row++) {
    for (let column = margin; column < maze.columns - margin; column++) {
      const candidate = { row, column };
      const distance = Math.min(...seeds.map((seed) => manhattan(candidate, seed.position)));
      const centerPull = Math.abs(row - maze.rows / 2) + Math.abs(column - maze.columns / 2);
      const score = distance * 8 + centerPull + rng() * 2;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  return best;
}

function carveRoom(byKey: Map<string, MazeCellState>, room: MazeRoomState) {
  for (let row = room.row; row < room.row + room.rows; row++) {
    for (let column = room.column; column < room.column + room.columns; column++) {
      const position = { row, column };
      for (const direction of DIRECTIONS) {
        const next = movePosition(position, direction);
        if (next.row < room.row || next.column < room.column || next.row >= room.row + room.rows || next.column >= room.column + room.columns) {
          continue;
        }

        linkCells(byKey, position, next, direction);
      }
    }
  }
}

function carveRoomConnections(byKey: Map<string, MazeCellState>, rows: number, columns: number, rooms: MazeRoomState[], rng: Rng) {
  const hub = rooms.find((room) => room.kind === 'hub') ?? rooms[0];
  const start = rooms.find((room) => room.kind === 'start') ?? rooms[0];
  const exit = rooms.find((room) => room.kind === 'exit') ?? rooms[rooms.length - 1];
  const paths: GridPosition[] = [];

  appendPath(paths, carvePath(byKey, rows, columns, start.center, hub.center, rng));
  appendPath(paths, carvePath(byKey, rows, columns, hub.center, exit.center, rng));

  for (const room of rooms) {
    if (room === start || room === hub || room === exit) {
      continue;
    }

    appendPath(paths, carvePath(byKey, rows, columns, hub.center, room.center, rng));
  }

  const corridorRadius = rows * columns >= 400 ? 1 : 0;
  if (corridorRadius > 0) {
    for (const position of paths) {
      carveOpenArea(byKey, rows, columns, position, corridorRadius);
    }
  }

  return paths;
}

function carvePath(byKey: Map<string, MazeCellState>, rows: number, columns: number, from: GridPosition, to: GridPosition, rng: Rng) {
  const path: GridPosition[] = [{ ...from }];
  let current = { ...from };

  while (current.row !== to.row || current.column !== to.column) {
    const rowDistance = to.row - current.row;
    const columnDistance = to.column - current.column;
    const preferRows = Math.abs(rowDistance) > Math.abs(columnDistance) || (rowDistance !== 0 && rng() < 0.5);
    let direction: Direction;

    if (preferRows && rowDistance !== 0) {
      direction = rowDistance > 0 ? 'south' : 'north';
    } else if (columnDistance !== 0) {
      direction = columnDistance > 0 ? 'east' : 'west';
    } else {
      direction = rowDistance > 0 ? 'south' : 'north';
    }

    const next = movePosition(current, direction);
    if (next.row < 0 || next.column < 0 || next.row >= rows || next.column >= columns) {
      break;
    }

    linkCells(byKey, current, next, direction);
    current = next;
    path.push({ ...current });
  }

  return path;
}

function carveOpenArea(byKey: Map<string, MazeCellState>, rows: number, columns: number, center: GridPosition, radius: number) {
  for (let row = center.row - radius; row <= center.row + radius; row++) {
    for (let column = center.column - radius; column <= center.column + radius; column++) {
      const position = { row, column };
      if (row < 0 || column < 0 || row >= rows || column >= columns) {
        continue;
      }

      for (const direction of DIRECTIONS) {
        const next = movePosition(position, direction);
        if (next.row < 0 || next.column < 0 || next.row >= rows || next.column >= columns) {
          continue;
        }

        linkCells(byKey, position, next, direction);
      }
    }
  }
}

function linkCells(byKey: Map<string, MazeCellState>, from: GridPosition, to: GridPosition, direction: Direction) {
  const fromCell = byKey.get(cellKey(from));
  const toCell = byKey.get(cellKey(to));
  if (!fromCell || !toCell) {
    return;
  }

  if (!fromCell.links.includes(direction)) {
    fromCell.links.push(direction);
  }

  const reverse = opposite(direction);
  if (!toCell.links.includes(reverse)) {
    toCell.links.push(reverse);
  }
}

function createZones(rows: number, columns: number): MazeZoneState[] {
  const northEnd = Math.max(1, Math.floor(rows / 3));
  const southStart = Math.min(rows - 1, Math.ceil((rows * 2) / 3));

  return [
    {
      id: 'north-wing',
      name: 'North Wing',
      tint: 'rgba(66, 105, 82, 0.14)',
      rowStart: 0,
      rowEnd: northEnd,
      columnStart: 0,
      columnEnd: columns,
    },
    {
      id: 'central-vaults',
      name: 'Central Vaults',
      tint: 'rgba(77, 95, 143, 0.12)',
      rowStart: northEnd,
      rowEnd: southStart,
      columnStart: 0,
      columnEnd: columns,
    },
    {
      id: 'south-catacombs',
      name: 'South Catacombs',
      tint: 'rgba(137, 86, 58, 0.13)',
      rowStart: southStart,
      rowEnd: rows,
      columnStart: 0,
      columnEnd: columns,
    },
  ];
}

function appendPath(paths: GridPosition[], path: GridPosition[]) {
  const seen = new Set(paths.map(cellKey));
  for (const position of path) {
    if (seen.has(cellKey(position))) {
      continue;
    }

    seen.add(cellKey(position));
    paths.push(position);
  }
}

function manhattan(a: GridPosition, b: GridPosition) {
  return Math.abs(a.row - b.row) + Math.abs(a.column - b.column);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
