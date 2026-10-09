import { emptyDirectedKnowledge, rememberDirected } from '../../domain/directed/knowledge';
import { slotRange, transaction } from './database';
import { context, event } from './journalValidation';
import { receipts, requireSave } from './records';
import { observation, projection } from './stateValidation';
import { check, id, same } from './values';

/** Host-only: never return this truth-bearing envelope to an actor/provider. */
export async function auditDirectedSave(slot: string) {
  id(slot);
  return transaction(async tx => {
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
    const observationIds = new Set<string>();
    const eventIds = new Set<string>();
    let knowledge = emptyDirectedKnowledge(current.world.id, current.actor.id);
    check(same(projections[0], knowledge), 'invalid initial projection');
    for (let index = 0; index < observations.length; index++) {
      const value = observations[index]; observation(value, current);
      check(value.sequence === index + 1 && !observationIds.has(value.id), 'observation sequence or identity mismatch');
      observationIds.add(value.id);
      knowledge = rememberDirected(knowledge, value);
      projection(projections[index + 1]);
      check(same(projections[index + 1], knowledge), 'historical projection differs from sources');
    }
    for (let index = 0; index < events.length; index++) {
      const value = events[index]; event(value, current);
      check(value.revision === index + 1 && !eventIds.has(value.id), 'event sequence or identity mismatch');
      eventIds.add(value.id);
    }
    for (const value of contexts) {
      context(value, current);
      check(value.observationIds.every(key => observationIds.has(key)
        && observations.find(item => item.id === key)!.sequence <= value.knowledgeRevision), 'context missing historical evidence');
    }
    for (const value of requestReceipts) {
      check(value.observationIds.every(key => observationIds.has(key)) && value.eventIds.every(key => eventIds.has(key)), 'receipt missing evidence');
    }
    // get() yields an independent structured clone, not an alias into session.world.
    const world = await tx.objectStore('worlds').get(slot);
    return { session: current, world, observations, projections, events, contexts, receipts: requestReceipts };
  });
}
