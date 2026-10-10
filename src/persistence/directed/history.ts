import { emptyDirectedKnowledge, rememberDirected } from '../../domain/directed/knowledge';
import type { DirectedSession } from '../../domain/directed/operationTypes';
import type { ObservationReceipt, WorldEvent } from '../../domain/directed/types';
import { slotRange, type Counts, type DirectedTransaction } from './database';
import { event } from './journalValidation';
import { capacity } from './records';
import { observation, projection } from './stateValidation';
import { check, same } from './values';
import { reserveIdentity, witness } from './witnesses';

/** Domain reducers derive each snapshot; sources and snapshots have separate keys. */
export async function appendHistory(tx: DirectedTransaction, slot: string, counts: Counts,
  previous: DirectedSession | undefined, next: DirectedSession, observations: ObservationReceipt[], events: WorldEvent[], checkpointMode = false) {
  capacity(counts, { observations: observations.length, projections: observations.length + (previous ? 0 : 1), events: events.length });
  check(next.knowledge.revision === (previous?.knowledge.revision ?? 0) + observations.length, 'observation sequence gap');
  check(next.world.revision === (previous?.world.revision ?? 0) + events.length, 'event sequence gap');
  const oldObservations = checkpointMode ? [] : await tx.objectStore('observations').getAll(slotRange(slot));
  const observationIds = new Set(oldObservations.map(value => value.id));
  const oldEvents = checkpointMode ? [] : await tx.objectStore('events').getAll(slotRange(slot));
  const eventIds = new Set(oldEvents.map(value => value.id));
  let knowledge = previous?.knowledge ?? emptyDirectedKnowledge(next.world.id, next.actor.id);
  if (!previous) {
    projection(knowledge);
    await tx.objectStore('projections').add(knowledge, [slot, knowledge.revision]);
    if (checkpointMode) await witness(tx, slot, 'projections', knowledge.revision, knowledge);
  }
  for (const value of observations) {
    observation(value, next);
    check(value.sequence === knowledge.revision + 1 && !observationIds.has(value.id), 'observation identity conflict');
    observationIds.add(value.id);
    knowledge = rememberDirected(knowledge, value); projection(knowledge);
    await tx.objectStore('observations').add(value, [slot, value.sequence]);
    await tx.objectStore('projections').add(knowledge, [slot, knowledge.revision]);
    if (checkpointMode) {
      await reserveIdentity(tx, slot, 'observations', value.id, value.sequence);
      await witness(tx, slot, 'observations', value.sequence, value);
      await witness(tx, slot, 'projections', knowledge.revision, knowledge);
    }
  }
  check(same(knowledge, next.knowledge), 'transition projection differs from source evidence');
  let revision = previous?.world.revision ?? 0;
  for (const value of events) {
    event(value, next);
    check(value.revision === ++revision && !eventIds.has(value.id), 'event identity conflict');
    eventIds.add(value.id);
    await tx.objectStore('events').add(value, [slot, value.revision]);
    if (checkpointMode) {
      await reserveIdentity(tx, slot, 'events', value.id, value.revision);
      await witness(tx, slot, 'events', value.revision, value);
    }
  }
  counts.observations += observations.length; counts.projections += observations.length + (previous ? 0 : 1);
  counts.events += events.length;
}
