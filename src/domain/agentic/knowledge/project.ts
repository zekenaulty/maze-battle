import { cellKey } from '../../maze/key';
import { freeze, refused, roomKey, sourceOf } from './shared';
import { mergeRpgCell } from './mergeCell';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgKnowledge,
  type RpgObservation, type RpgRefusal, type RpgRememberedCell } from './types';

/** Trusted domain receipts only. Durable archive validation/deduplication belongs to the host. */
export function projectRpgKnowledge(previous: RpgKnowledge | undefined, observation: RpgObservation): RpgKnowledge | RpgRefusal {
  if (previous) {
    if (previous.gameId !== observation.gameId) return refused('scope_mismatch');
    const before = previous.source.revision;
    const after = observation.revision;
    if (after.epoch < before.epoch || after.revision < before.revision
      || (after.epoch === before.epoch && after.owner !== before.owner)) return refused('out_of_order');
    if (previous.source.id === observation.id) return refused('duplicate_source');
  }
  const floor = observation.actor.floor;
  const existing = previous?.floors[floor];
  if (!existing && Object.keys(previous?.floors ?? {}).length >= LIMITS.retainedFloors) return refused('knowledge_limit');
  const added = observation.cells.filter(cell => !existing?.cells[cellKey(cell.address)]).length;
  const cellCount = (previous?.cellCount ?? 0) + added;
  if (cellCount > LIMITS.retainedCells) return refused('knowledge_limit');
  const source = sourceOf(observation);
  const cells: Record<string, RpgRememberedCell> = { ...existing?.cells };
  const rooms: Record<string, readonly string[]> = { ...existing?.rooms };
  for (const cell of observation.cells) {
    const key = cellKey(cell.address);
    const old = cells[key];
    cells[key] = mergeRpgCell(old, cell, source);
    for (const room of old?.roomIds ?? []) {
      if (cell.roomIds.includes(room)) continue;
      const indexed = rooms[roomKey(room)].filter(candidate => candidate !== key);
      if (indexed.length) rooms[roomKey(room)] = indexed;
      else delete rooms[roomKey(room)];
    }
    for (const room of cell.roomIds) {
      const indexed = rooms[roomKey(room)] ?? [];
      if (!indexed.includes(key)) rooms[roomKey(room)] = [...indexed, key];
    }
  }
  // Copy before freezing so neither loaded state nor archived receipt objects are mutated.
  return freeze(structuredClone({ status: 'known', version: 1, gameId: observation.gameId, source,
    actor: observation.actor, cellCount, floors: { ...previous?.floors, [floor]: { cells, rooms } } } satisfies RpgKnowledge));
}
