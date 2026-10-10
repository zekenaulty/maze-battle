import { assertObservationSourceIds, presentObservationSources } from '../../domain/directed/sourceContext';
import { DIRECTED_LIMITS, type ObservationReceipt } from '../../domain/directed/types';
import { slotRange, transaction, type DirectedTransaction, type SaveRecord } from './database';
import { requireSave } from './records';
import { observation } from './stateValidation';
import { check, id, integer, same } from './values';
import { readIdentity, verifyWitness } from './witnesses';

/** The caller supplies a validated record in the same transaction; no recursive load/audit. */
export async function readObservationSourcesAt(tx: DirectedTransaction, slot: string, record: SaveRecord,
  ids: string[]): Promise<ObservationReceipt[]> {
  id(slot); assertObservationSourceIds(ids);
  const requested = [...ids];
  const current = record.session;
  check(current.knowledge.worldId === current.world.id && current.knowledge.observerId === current.actor.id, 'source save scope mismatch');
  check(record.historyMode === undefined || record.historyMode === 'checkpoint-v1', 'unsupported history mode');
  integer(current.knowledge.revision); integer(record.counts.observations, DIRECTED_LIMITS.history);
  check(record.counts.observations === current.knowledge.revision, 'source count mismatch');
  if (!requested.length) return [];
  const store = tx.objectStore('observations');
  if (record.historyMode === 'checkpoint-v1') {
    const sources: ObservationReceipt[] = [];
    for (const sourceId of requested) {
      const key = await readIdentity(tx, slot, 'observations', sourceId);
      if (key === undefined) continue;
      integer(key, current.knowledge.revision);
      check(key > 0, 'invalid source identity sequence');
      const source = await store.get([slot, key]);
      observation(source, current);
      check(source.id === sourceId && source.sequence === key, 'source observation identity mismatch');
      await verifyWitness(tx, slot, 'observations', key, source);
      sources.push(source);
    }
    return sources;
  }
  const values = await store.getAll(slotRange(slot), DIRECTED_LIMITS.history + 1);
  const keys = await store.getAllKeys(slotRange(slot), DIRECTED_LIMITS.history + 1);
  check(values.length === record.counts.observations && keys.length === values.length, 'source journal count mismatch');
  const byId = new Map<string, ObservationReceipt>();
  values.forEach((source, index) => {
    observation(source, current);
    check(source.sequence > 0 && same(keys[index], [slot, source.sequence]) && !byId.has(source.id), 'source observation identity mismatch');
    byId.set(source.id, source);
  });
  return requested.flatMap(sourceId => byId.has(sourceId) ? [byId.get(sourceId)!] : []);
}

/** Actor-facing read only. Archiving, presentation IDs and validator dispatch belong to the parent. */
export async function readDirectedObservationSources(slot: string, ids: string[]) {
  id(slot); assertObservationSourceIds(ids);
  const requested = [...ids];
  return transaction(async tx => {
    const record = await requireSave(tx, slot);
    const sources = await readObservationSourcesAt(tx, slot, record, requested);
    const { world, actor, knowledge } = record.session;
    return presentObservationSources({ worldId: world.id, floorId: world.floorId, observerId: actor.id },
      knowledge.revision, requested, sources);
  });
}
