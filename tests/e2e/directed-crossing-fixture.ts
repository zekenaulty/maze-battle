import * as db from '../../src/persistence/directed';
import { transaction } from '../../src/persistence/directed/database';
import { appendHistory } from '../../src/persistence/directed/history';
import { saveHeadWitness } from '../../src/persistence/directed/witnesses';

export async function setRecoveryGate(slot: string, state: 'closed' | 'open' | 'removed', hidden = true) {
  return transaction(async tx => {
    const record = (await tx.objectStore('saves').get(slot))!;
    const previous = structuredClone(record.session);
    const world = record.session.world;
    if (state === 'removed') delete world.features.recoveryGate;
    else world.features.recoveryGate = { id: 'recoveryGate', name: 'Recovery gate', kind: 'door', state, hidden,
      position: { spaceId: 'W', row: 0, column: 1 } };
    world.revision++; record.session.revision++;
    await appendHistory(tx, slot, record.counts, previous, record.session, [], [{ id: `gate-change-${world.revision}`, revision: world.revision,
      type: 'fixture-change', subjectId: 'recoveryGate', after: state }], Boolean(record.historyMode));
    await tx.objectStore('worlds').put(world, slot);
    await tx.objectStore('saves').put(record, slot);
    await saveHeadWitness(tx, slot, record);
  });
}

export async function setupRecovery(slot = 'fixture', owner = 'owner-a') {
  await db.createDirectedSave(slot); await db.claimDirectedSave(slot, owner);
  await setRecoveryGate(slot, 'closed');
  let session = (await db.readDirectedSave(slot))!;
  await db.executeDirectedRequest(slot, { attemptId: 'blocked-trip', owner, epoch: session.epoch, expectedRevision: session.revision,
    command: { type: 'navigate', operationId: 'blocked-trip', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } } }, 100);
  for (let index = 0; index < 64; index++) {
    session = (await db.readDirectedSave(slot))!;
    if (session.operation?.status !== 'running') break;
    await db.executeDirectedRequest(slot, { attemptId: `blocked-step-${index}`, owner, epoch: session.epoch,
      expectedRevision: session.revision,
      command: { type: 'step', operationId: 'blocked-trip', sequence: session.operation.nextStep } }, 101 + index);
  }
  if (session.operation?.status !== 'interrupted' || Object.keys(session.knowledge.blockedEdges ?? {}).length !== 1) {
    throw new Error('Recovery fixture did not reach its collision boundary');
  }
  return session;
}
