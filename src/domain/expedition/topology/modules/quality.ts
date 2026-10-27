import type { ModuleAssemblyState } from './types';
import { ModuleCapacityError } from './types';

export interface ModuleStructuralQuality {
  /** Legacy counter name: all anchored modules, including selected circulation. */
  rooms: number;
  reachable: number;
  joins: number;
  forks: number;
  longestChain: number;
}

/** Shared acceptance gate for compiled D1 floors and bounded canonical reductions. */
export function passesModuleStructuralQuality(quality: ModuleStructuralQuality, roomBudget: number): boolean {
  const minimumForks = quality.rooms >= 12 ? 2 : quality.rooms >= 7 ? 1 : 0;
  return quality.rooms === roomBudget && quality.reachable === quality.rooms && quality.joins === quality.rooms - 1
    && quality.forks >= minimumForks && quality.longestChain <= Math.ceil(quality.rooms * 0.6);
}

export function moduleQuality(state: ModuleAssemblyState) {
  const rooms = state.spaces.filter(space => space.id === 'entry' || /^socket-\d+:room$/.test(space.id));
  const graph = new Map(rooms.map(room => [room.id, [] as string[]]));
  for (const join of state.joins) {
    graph.get(join.fromRoomId)!.push(join.toRoomId);
    graph.get(join.toRoomId)!.push(join.fromRoomId);
  }
  const distances = (start: string) => {
    const found = new Map([[start, 0]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) for (const next of graph.get(queue[i])!) {
      if (found.has(next)) continue;
      found.set(next, found.get(queue[i])! + 1);
      queue.push(next);
    }
    return { count: found.size, farthest: queue[queue.length - 1], depth: Math.max(...found.values()) };
  };
  const entry = distances('entry');
  let longestChain = 0;
  for (const [id, neighbors] of graph) {
    if (neighbors.length === 2) continue;
    for (const neighbor of neighbors) {
      let previous = id, current = neighbor, length = 1;
      while (graph.get(current)!.length === 2 && length < rooms.length) {
        const next = graph.get(current)!.find(value => value !== previous)!;
        previous = current; current = next; length++;
      }
      longestChain = Math.max(longestChain, length);
    }
  }
  const row = Math.min(...state.spaces.map(space => space.origin.row));
  const column = Math.min(...state.spaces.map(space => space.origin.column));
  const rows = Math.max(...state.spaces.map(space => space.origin.row + space.rows)) - row;
  const columns = Math.max(...state.spaces.map(space => space.origin.column + space.columns)) - column;
  const roomArea = rooms.filter(room => room.kind === 'room').reduce((sum, room) => sum + room.rows * room.columns, 0);
  return { rooms: rooms.length, forks: [...graph.values()].filter(neighbors => neighbors.length >= 3).length,
    leaves: [...graph.values()].filter(neighbors => neighbors.length === 1).length,
    longestChain, depth: entry.depth, diameter: distances(entry.farthest).depth, reachable: entry.count,
    directJoins: state.joins.filter(join => !join.passageId).length, passages: state.spaces.filter(space => space.kind === 'passage').length,
    origin: { row, column }, rows, columns, projectionCells: rows * columns, roomArea, coverage: roomArea / (rows * columns),
    ...(state.recipe.architecture === 'circulation-v1' ? {
      chambers: rooms.filter(room => room.kind === 'room').length,
      runs: rooms.filter(room => room.circulation === 'run').length,
      junctions: rooms.filter(room => room.circulation === 'junction').length,
      circulationArea: rooms.filter(room => room.kind === 'passage').reduce((sum, room) => sum + room.rows * room.columns, 0),
    } : {}) };
}

export function assertModuleQuality(state: ModuleAssemblyState) {
  const quality = moduleQuality(state);
  if (!passesModuleStructuralQuality({ ...quality, joins: state.joins.length }, state.recipe.roomBudget)) {
    throw new ModuleCapacityError('quality', `Module floor failed structural qualification: ${JSON.stringify(quality)}`);
  }
  return quality;
}
