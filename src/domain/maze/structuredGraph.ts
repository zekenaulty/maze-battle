import type { GridPosition, MazeRoomConnection, MazeRoomState } from '../types';
import type { Rng } from '../combat/rng';

interface RoomEdge {
  from: number;
  to: number;
  kind: MazeRoomConnection['kind'];
  horizontal: boolean;
}

export function planRoomGraph(rows: number, columns: number, rng: Rng) {
  const candidates: Array<RoomEdge & { weight: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const from = row * columns + column;
      if (column + 1 < columns) candidates.push({ from, to: from + 1, kind: 'tree', horizontal: true, weight: rng() });
      if (row + 1 < rows) candidates.push({ from, to: from + columns, kind: 'tree', horizontal: false, weight: rng() });
    }
  }
  candidates.sort((a, b) => a.weight - b.weight || a.from - b.from || a.to - b.to);
  const groups = Array.from({ length: rows * columns }, (_, index) => index);
  const edges: RoomEdge[] = [];
  const loops: RoomEdge[] = [];
  for (const { from, to, horizontal } of candidates) {
    if (groups[from] === groups[to]) {
      loops.push({ from, to, kind: 'loop', horizontal });
      continue;
    }
    const previous = groups[to];
    const next = groups[from];
    for (let index = 0; index < groups.length; index++) {
      if (groups[index] === previous) groups[index] = next;
    }
    edges.push({ from, to, kind: 'tree', horizontal });
  }
  const mainRoute = roomRoute(edges, rows * columns - 1);
  // A loop is an explicit edge, never an accidental corridor intersection.
  if (rows * columns >= 6 && loops.length > 0 && rng() < 0.35) edges.push(loops[Math.floor(rng() * loops.length)]);
  return { edges, mainRoute, hubIndex: mainRoute[Math.floor(mainRoute.length / 2)] };
}

export function routeRoomConnections(rooms: MazeRoomState[], edges: RoomEdge[]): MazeRoomConnection[] {
  return edges.map(({ from, to, kind, horizontal }, index) => {
    const a = rooms[from];
    const b = rooms[to];
    const fromDoor = horizontal ? { row: a.center.row, column: a.column + a.columns - 1 } :
      { row: a.row + a.rows - 1, column: a.center.column };
    const toDoor = horizontal ? { row: b.center.row, column: b.column } :
      { row: b.row, column: b.center.column };
    // Neighboring slots reserve a strip between footprints. The bend stays in
    // that strip; approach legs stay in each endpoint's slot, outside its room.
    const lane = horizontal ? Math.floor((fromDoor.column + toDoor.column) / 2) : Math.floor((fromDoor.row + toDoor.row) / 2);
    const waypoints = horizontal ? [fromDoor, { row: fromDoor.row, column: lane }, { row: toDoor.row, column: lane }, toDoor] :
      [fromDoor, { row: lane, column: fromDoor.column }, { row: lane, column: toDoor.column }, toDoor];
    return { id: `passage-${index}`, fromRoomId: a.id, toRoomId: b.id, kind, fromDoor, toDoor, path: orthogonalPath(waypoints), width: 1 };
  });
}

export function orthogonalPath(waypoints: GridPosition[]) {
  const path: GridPosition[] = [{ ...waypoints[0] }];
  for (const target of waypoints.slice(1)) {
    let current = path[path.length - 1];
    while (current.row !== target.row || current.column !== target.column) {
      current = {
        row: current.row + Math.sign(target.row - current.row),
        column: current.column + (current.row === target.row ? Math.sign(target.column - current.column) : 0),
      };
      path.push(current);
    }
  }
  return path;
}

function roomRoute(edges: RoomEdge[], end: number) {
  const paths = [[0]];
  const seen = new Set([0]);
  for (const path of paths) {
    const current = path[path.length - 1];
    if (current === end) return path;
    for (const edge of edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      paths.push([...path, next]);
    }
  }
  throw new Error('Room graph must connect entry to exit.');
}
