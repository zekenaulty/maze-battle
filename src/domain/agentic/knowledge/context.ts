import { cellKey } from '../../maze/key';
import { movePosition, opposite } from '../../maze/movement';
import { shortestRoutes } from '../../expedition/shortestRoutes';
import { cellAt, directions, freeze, integer, knownNeighbours, refused, roomKey, validAddress, validId, validTime } from './shared';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgAddress, type RpgContextCell, type RpgKnowledge,
  type RpgRefusal, type RpgRememberedCell, type RpgSource, type RpgUnknown } from './types';

export interface RpgContext {
  readonly status: 'ready';
  readonly floor: number;
  readonly roomId: string | null;
  readonly asOf: string;
  readonly edgeScope: 'returned_cells';
  readonly cells: readonly RpgContextCell[];
}
export interface RpgRoomContext extends RpgContext {
  readonly roomId: string;
  readonly rememberedCellCount: number;
  readonly nextOffset?: number;
  /** Page-local observed connections, never a claim about the full room graph. */
  readonly connections: readonly { readonly roomId: string; readonly sources: readonly RpgSource[] }[];
}

function validAsOf(knowledge: RpgKnowledge, asOf: string) {
  return validTime(asOf) && Date.parse(asOf) >= Date.parse(knowledge.source.observedAt);
}

function contextCells(cells: readonly RpgRememberedCell[], asOf: string): RpgContextCell[] {
  const included = new Set(cells.map(cell => cellKey(cell.address)));
  const age = (source: RpgSource) => Date.parse(asOf) - Date.parse(source.observedAt);
  return cells.map(cell => ({ address: cell.address, roomIds: cell.roomIds, chests: cell.chests,
    stairs: cell.stairs, source: cell.source, ageMs: age(cell.source), edges: directions.flatMap(direction => {
      const fact = cell.edges[direction];
      if (!fact || (fact.state === 'open' && !included.has(cellKey(movePosition(cell.address, direction))))) return [];
      return [{ direction, state: fact.state, source: fact.source, ageMs: age(fact.source) }];
    }) }));
}

export function rpgLocalContext(knowledge: RpgKnowledge, origin: RpgAddress,
  budget: { readonly roomId?: string | null; readonly radius: number; readonly maxCells: number; readonly asOf: string }): RpgContext | RpgRefusal | RpgUnknown {
  if (!validAddress(origin)) return refused('invalid_checkpoint');
  if (!budget || !integer(budget.radius, 0, LIMITS.contextRadius)
    || !integer(budget.maxCells, 1, LIMITS.contextCells)
    || (budget.roomId != null && !validId(budget.roomId))) return refused('invalid_budget');
  if (!validAsOf(knowledge, budget.asOf)) return refused('invalid_as_of');
  const originCell = cellAt(knowledge, origin);
  if (!originCell) return { status: 'unknown', reason: 'origin_unknown' };
  const roomId = budget.roomId === undefined ? originCell.roomIds[0] ?? null : budget.roomId;
  const selected = (cell: RpgRememberedCell) => roomId === null ? cell.roomIds.length === 0 : cell.roomIds.includes(roomId);
  if (!selected(originCell)) return { status: 'unknown', reason: 'room_unknown' };
  const cells = knowledge.floors[origin.floor].cells;
  const depths = new Map([[cellKey(origin), 0]]);
  try {
    const tree = shortestRoutes(cellKey(origin), key => {
      const depth = depths.get(key)!;
      if (depth >= budget.radius) return [];
      return knownNeighbours(knowledge, cells[key].address).filter(next => selected(cellAt(knowledge, next.address)!)).map(next => {
        const key = cellKey(next.address);
        if (!depths.has(key)) depths.set(key, depth + 1);
        return { key, edge: next.direction };
      });
    }, budget.maxCells);
    return freeze(structuredClone({ status: 'ready', floor: origin.floor, roomId, asOf: budget.asOf, edgeScope: 'returned_cells',
      cells: contextCells([...tree.keys()].map(key => cells[key]), budget.asOf) } satisfies RpgContext));
  } catch (error) {
    if (error instanceof Error && error.message === 'Route visit budget exhausted.') return refused('visit_limit');
    throw error;
  }
}

/** Point-read one indexed room page. Foreign rooms expose IDs and edge sources, not internals. */
export function rpgRoomContext(knowledge: RpgKnowledge, room: { readonly floor: number; readonly roomId: string },
  budget: { readonly offset: number; readonly limit: number; readonly asOf: string }): RpgRoomContext | RpgRefusal | RpgUnknown {
  if (!room || !integer(room.floor, 1) || !validId(room.roomId)) return refused('invalid_checkpoint');
  if (!budget || !integer(budget.offset, 0, LIMITS.retainedCells)
    || !integer(budget.limit, 1, LIMITS.contextCells)) return refused('invalid_budget');
  if (!validAsOf(knowledge, budget.asOf)) return refused('invalid_as_of');
  const floor = knowledge.floors[room.floor];
  const keys = floor?.rooms[roomKey(room.roomId)];
  if (!keys) return { status: 'unknown', reason: 'room_unknown' };
  const cells = keys.slice(budget.offset, budget.offset + budget.limit).map(key => floor.cells[key]);
  const connections = new Map<string, Map<string, RpgSource>>();
  for (const cell of cells) {
    for (const next of knownNeighbours(knowledge, cell.address)) {
      for (const id of cellAt(knowledge, next.address)!.roomIds) {
        if (id === room.roomId) continue;
        const sources = connections.get(id) ?? new Map<string, RpgSource>();
        const neighbor = cellAt(knowledge, next.address)!;
        for (const source of [cell.source, cell.edges[next.direction]!.source, neighbor.source,
          neighbor.edges[opposite(next.direction)]!.source]) sources.set(source.id, source);
        connections.set(id, sources);
        if (connections.size > LIMITS.contextRooms || sources.size > LIMITS.connectionSources) return refused('context_limit');
      }
    }
  }
  const nextOffset = budget.offset + cells.length;
  return freeze(structuredClone({ status: 'ready', floor: room.floor, roomId: room.roomId,
    asOf: budget.asOf, edgeScope: 'returned_cells', rememberedCellCount: keys.length,
    ...(nextOffset < keys.length ? { nextOffset } : {}), cells: contextCells(cells, budget.asOf),
    connections: [...connections].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([roomId, sources]) => ({ roomId, sources: [...sources.values()] })) } satisfies RpgRoomContext));
}
