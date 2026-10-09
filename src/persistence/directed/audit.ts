import { slotRange, transaction } from './database';
import { event } from './journalValidation';
import { receipts, requireSave } from './records';
import { check, id } from './values';

/** Host-only: never return this truth-bearing envelope to an actor/provider. */
export async function auditDirectedSave(slot: string) {
  id(slot);
  return transaction(async tx => {
    // Normal load already proves every projection and archived context from sources.
    const record = await requireSave(tx, slot);
    const current = record.session;
    const observations = await tx.objectStore('observations').getAll(slotRange(slot));
    const projections = await tx.objectStore('projections').getAll(slotRange(slot));
    const events = await tx.objectStore('events').getAll(slotRange(slot));
    const contexts = await tx.objectStore('contexts').getAll(slotRange(slot));
    for (const [name, values, field] of [
      ['observations', observations, 'sequence'], ['projections', projections, 'revision'],
      ['events', events, 'revision'], ['contexts', contexts, 'id'],
    ] as const) {
      const storedKeys = await tx.objectStore(name).getAllKeys(slotRange(slot));
      values.forEach((value, index) => check(storedKeys[index][1] === (value as unknown as Record<string, unknown>)[field], 'journal key mismatch'));
    }
    const requestReceipts = await receipts(tx, slot, record);
    const observationIds = new Set(observations.map(value => value.id));
    const eventIds = new Set<string>();
    for (let index = 0; index < events.length; index++) {
      const value = events[index]; event(value, current);
      check(value.revision === index + 1 && !eventIds.has(value.id), 'event sequence or identity mismatch');
      eventIds.add(value.id);
    }
    for (const value of requestReceipts) {
      check(value.observationIds.every(key => observationIds.has(key)) && value.eventIds.every(key => eventIds.has(key)), 'receipt missing evidence');
    }
    // get() yields an independent structured clone, not an alias into session.world.
    const world = await tx.objectStore('worlds').get(slot);
    return { session: current, world, observations, projections, events, contexts, receipts: requestReceipts };
  });
}
