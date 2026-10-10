import * as db from '../../src/persistence/directed';
import { transaction } from '../../src/persistence/directed/database';

export async function setRecoveryGate(slot: string, state: 'closed' | 'open' | 'removed', hidden = true) {
  return transaction(async tx => {
    const record = (await tx.objectStore('saves').get(slot))!;
    const world = record.session.world;
    if (state === 'removed') delete world.features.recoveryGate;
    else world.features.recoveryGate = { id: 'recoveryGate', name: 'Recovery gate', kind: 'door', state, hidden,
      position: { spaceId: 'W', row: 0, column: 1 } };
    world.revision++; record.session.revision++; record.counts.events++;
    await tx.objectStore('events').add({ id: `gate-change-${world.revision}`, revision: world.revision,
      type: 'fixture-change', subjectId: 'recoveryGate', after: state }, [slot, world.revision]);
    await tx.objectStore('worlds').put(world, slot);
    await tx.objectStore('saves').put(record, slot);
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
