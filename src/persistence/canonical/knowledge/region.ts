import type { GridPosition } from '../../../domain/types';
import { gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { readCanonical } from '../read';
import type { CanonicalSnapshot, CanonicalWorkLimits } from '../types';
import { check } from '../validation';
import { same } from '../world/records';
import { loadObservation, sourceReader, validateKnowledge } from './evidence';
import { blockKey, cellKey, localKey } from './keys';
import { loadMemoryBlock, validateCellEvidence } from './memory';
import { DIRECTIONS, type KnowledgeRead, type MemoryBlock, type ObservedCell, type RememberedCell } from './types';
import { loadWorldIndexBlock, worldBlockKey, worldCellKey, type WorldIndexBlock } from './worldIndex';

export interface KnowledgeRegionScope { floor: number; row: number; column: number; rows: number; columns: number }
export type PerceivedCell = { state: 'visible'; cell: RememberedCell; observation: ObservedCell }
  | { state: 'remembered'; cell: RememberedCell };
export interface KnowledgeRegion { scope: KnowledgeRegionScope; actor: GridPosition | null; cells: PerceivedCell[] }
// Physical I/O ceilings, including tree traversal and source receipts. Exhaustion fails closed.
// The budget schema requires a positive write cap; readCanonical still opens a read-only transaction.
export const REGION_WORK_LIMITS: Readonly<CanonicalWorkLimits> = { reads: 16384, writes: 1, bytes: 16 * 1024 * 1024 };
export function validateRegionScope(s: KnowledgeRegionScope) {
  if (![s.floor, s.row, s.column, s.rows, s.columns, s.row + s.rows, s.column + s.columns].every(Number.isSafeInteger)
    || s.floor < 1 || s.rows < 1 || s.columns < 1 || s.rows > 64 || s.columns > 64 || s.rows * s.columns > 1024)
    throw new RangeError('Perception scope must have safe signed coordinates, axes 1..64 and area <= 1024');
}
const contains = (s: KnowledgeRegionScope, p: GridPosition) => p.row >= s.row && p.row < s.row + s.rows
  && p.column >= s.column && p.column < s.column + s.columns;

/** At most 1024 coordinate probes, 1024 local blocks and five original sources per cell; no scans. */
export async function readKnowledgeRegion(pages: KnowledgeRead, checkpoint: GameCheckpoint, scope: KnowledgeRegionScope): Promise<KnowledgeRegion> {
  validateRegionScope(scope);
  await validateKnowledge(pages, checkpoint.knowledge);
  const current = checkpoint.knowledge ? await loadObservation(pages, { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id }) : null;
  const visible = new Map(checkpoint.mode !== 'town' && current && same(current.header.actor, checkpoint.position)
    ? current.cells.map(c => [cellKey(c.at), c]) : []);
  const actor = visible.get(cellKey(checkpoint.position));
  const result: KnowledgeRegion = { scope: { ...scope }, actor: actor?.at.level === scope.floor ? { ...actor.world } : null, cells: [] };
  const spatial = new Map<string, WorldIndexBlock | null>(), memories = new Map<string, MemoryBlock | null>(), source = sourceReader(pages);
  const found = new Set<string>();
  for (let r = 0; r < scope.rows; r++) for (let c = 0; c < scope.columns; c++) {
    const world = { row: scope.row + r, column: scope.column + c }, key = worldBlockKey(scope.floor, world);
    if (!spatial.has(key)) spatial.set(key, await loadWorldIndexBlock(pages, scope.floor, world));
    const entry = spatial.get(key)?.cells[worldCellKey(world)];
    if (!entry) continue;
    const mk = blockKey(entry.at);
    if (!memories.has(mk)) memories.set(mk, await loadMemoryBlock(pages, entry.at));
    const cell = memories.get(mk)?.cells[localKey(entry.at)];
    check(cell && same(cell.at, entry.at) && same(cell.world, world) && same(cell.source, entry.source), 'spatial index differs from earned memory');
    check(checkpoint.knowledge && cell.source.sequence <= checkpoint.knowledge.sequence, 'spatial memory is ahead of checkpoint');
    await validateCellEvidence(cell, source);
    const seen = visible.get(cellKey(cell.at));
    if (seen) {
      check(same({ ...seen, edges: {} }, { at: cell.at, world: cell.world, chests: cell.chests, stairs: cell.stairs, edges: {} })
        && DIRECTIONS.every(d => !Object.hasOwn(seen.edges, d) || cell.edges[d] && same(cell.edges[d]!.target, seen.edges[d])),
      'visible fact differs from current observation');
      result.cells.push({ state: 'visible', cell, observation: seen });
    } else result.cells.push({ state: 'remembered', cell });
    found.add(cellKey(cell.at));
  }
  for (const seen of visible.values()) if (seen.at.level === scope.floor && contains(scope, seen.world))
    check(found.has(cellKey(seen.at)), 'current observation is missing from spatial index');
  return result;
}

/** The checkpoint and every knowledge/evidence read use the caller's exact immutable roots. */
export function readCanonicalRegion(snapshot: CanonicalSnapshot, scope: KnowledgeRegionScope, signal?: AbortSignal) {
  validateRegionScope(scope);
  const captured = { ...scope };
  return readCanonical((pages, pinned) => readKnowledgeRegion(pages, gameCheckpoint(pinned.checkpoint), captured),
    { snapshot, signal, limits: { ...REGION_WORK_LIMITS } });
}
