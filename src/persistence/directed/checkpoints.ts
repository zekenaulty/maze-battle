import type { DirectedTransaction, SaveRecord } from './database';
import { observation, projection } from './stateValidation';
import { event, receipt } from './journalValidation';
import { check, same } from './values';
import { verifyWitness } from './witnesses';

/** Fixed-size current checkpoint verification; this deliberately does not audit unread history. */
export async function validateCheckpoint(tx: DirectedTransaction, slot: string, record: SaveRecord) {
  await verifyWitness(tx, slot, 'head', 'current', record);
  const sequence = record.session.knowledge.revision;
  check(sequence > 0, 'missing checkpoint observation');
  const source = await tx.objectStore('observations').get([slot, sequence]);
  observation(source, record.session);
  await verifyWitness(tx, slot, 'observations', sequence, source);
  check(source.sequence === sequence, 'checkpoint observation sequence mismatch');
  const knowledge = await tx.objectStore('projections').get([slot, sequence]);
  projection(knowledge);
  await verifyWitness(tx, slot, 'projections', sequence, knowledge);
  check(same(knowledge, record.session.knowledge) && same(source.scene.position, record.session.actor.position), 'checkpoint projection mismatch');
  if (record.session.world.revision) {
    const revision = record.session.world.revision;
    const latest = await tx.objectStore('events').get([slot, revision]);
    event(latest, record.session);
    await verifyWitness(tx, slot, 'events', revision, latest);
    check(latest.revision === revision, 'checkpoint event sequence mismatch');
  }
  if (record.terminalAttempt) {
    const terminal = (await tx.objectStore('controlReserve').get(slot))?.receipt;
    receipt(terminal, record.session);
    check(terminal.request.attemptId === record.terminalAttempt && terminal.request.command.type === 'cancel', 'terminal receipt mismatch');
    await verifyWitness(tx, slot, 'receipts', record.terminalAttempt, terminal);
  }
}
