import { opposite } from '../../../domain/maze/movement';
import type { GameCheckpoint } from '../game/checkpoint';
import { check } from '../validation';
import { same } from '../world/records';
import { loadObservation, sourceReader, validateKnowledge } from './evidence';
import { cellKey, localKey } from './keys';
import { loadMemoryBlock, validateCellEvidence } from './memory';
import { DIRECTIONS, MEMORY_BLOCK_SIDE, type KnowledgeRead, type RememberedCell } from './types';
import type { KnownStep } from './navigation';
import type { KnowledgeRegion } from './region';

// A query window, NOT a claim about room geometry. Edges outside it remain unresolved.
export const ROOM_QUERY_SIDE = 16;
export interface EarnedRoom {
  region: KnowledgeRegion; cells: RememberedCell[]; exits: KnownStep[]; frontiers: RememberedCell[];
}

/** Current-room point reads only. No room recipe, engine ports, indexes or hidden geometry. */
export async function readKnowledgeRoom(pages: KnowledgeRead, checkpoint: GameCheckpoint): Promise<EarnedRoom> {
  await validateKnowledge(pages, checkpoint.knowledge);
  check(checkpoint.knowledge && checkpoint.mode !== 'town', 'room requires dungeon sight');
  const current = await loadObservation(pages, checkpoint.knowledge && { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id });
  const actor = checkpoint.position, readSource = sourceReader(pages), cells: RememberedCell[] = [];
  check(same(current.header.actor, actor) && actor.cell.row < ROOM_QUERY_SIDE && actor.cell.column < ROOM_QUERY_SIDE,
    'room query cannot cover current position');
  for (let row = 0; row < ROOM_QUERY_SIDE; row += MEMORY_BLOCK_SIDE) for (let column = 0; column < ROOM_QUERY_SIDE; column += MEMORY_BLOCK_SIDE) {
    const block = await loadMemoryBlock(pages, { level: actor.level, cell: { spaceId: actor.cell.spaceId, row, column } });
    for (const cell of Object.values(block?.cells ?? {})) {
      check(cell.source.sequence <= checkpoint.knowledge!.sequence, 'room memory is ahead of sight');
      await validateCellEvidence(cell, readSource); cells.push(cell);
    }
  }
  const byCell = new Map(cells.map(c => [cellKey(c.at), c])), exits: KnownStep[] = [], neighbors = new Map<string, RememberedCell>();
  for (const cell of cells) for (const direction of DIRECTIONS) {
    const target = cell.edges[direction]?.target;
    if (!target || target.cell.spaceId === actor.cell.spaceId) continue;
    check(target.level === actor.level && exits.length < 4, 'room has unbounded or foreign exits');
    const next = (await loadMemoryBlock(pages, target))?.cells[localKey(target)];
    check(next && next.source.sequence <= checkpoint.knowledge!.sequence, 'exit endpoint is not earned');
    await validateCellEvidence(next, readSource);
    check(same(next.edges[opposite(direction)]?.target ?? null, cell.at), 'exit lacks an earned reciprocal edge');
    exits.push({ from: cell.at, to: next.at, direction }); neighbors.set(cellKey(next.at), next);
  }
  const all = [...cells, ...neighbors.values()], visible = new Map(current.cells.map(c => [cellKey(c.at), c]));
  const here = byCell.get(cellKey(actor)); check(here, 'actor is absent from room memory');
  for (const seen of current.cells.filter(c => c.at.cell.spaceId === actor.cell.spaceId)) {
    const known = byCell.get(cellKey(seen.at));
    check(known && same({ ...seen, edges: {} }, { at: known.at, world: known.world, chests: known.chests, stairs: known.stairs, edges: {} })
      && DIRECTIONS.every(d => !Object.hasOwn(seen.edges, d) || known.edges[d] && same(known.edges[d]!.target, seen.edges[d])), 'room differs from current sight');
  }
  const row = Math.min(...all.map(c => c.world.row)), column = Math.min(...all.map(c => c.world.column));
  const rows = Math.max(...all.map(c => c.world.row)) - row + 1, columns = Math.max(...all.map(c => c.world.column)) - column + 1;
  check(all.length <= 512 && rows <= 64 && columns <= 64, 'earned room exceeds route bounds');
  return { cells, exits, frontiers: cells.filter(c => DIRECTIONS.some(d => !c.edges[d]
    || c.edges[d]!.target?.cell.spaceId === actor.cell.spaceId && !byCell.has(cellKey(c.edges[d]!.target!)))),
  region: { scope: { floor: actor.level, row, column, rows, columns }, actor: here.world,
    cells: all.map(cell => { const observation = visible.get(cellKey(cell.at));
      return observation ? { state: 'visible', cell, observation } : { state: 'remembered', cell }; }) } };
}
