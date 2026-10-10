import { topologyTransaction, type TopologyTransaction } from '../topology/database';
import { directedHostOperationAt } from './records';
import { directedRecordAt, sameStreamControl } from '../directedStreamRecords';
import { streamControl, streamRecord } from '../streamRecords';
import { snapshotAt } from '../streamRepository';
import { directedObservation, directedUsage } from '../../services/agentica/directed/observation';
import { agenticaCheck as check, boundedJson } from '../agenticaValidation';
import { sameAddress } from '../../domain/expedition/address';
import type { DirectedHostEvent } from './types';
import type { StreamControl } from '../../domain/expedition/streaming/types';
import { validateDirectedObservation } from './evidence';

export async function hostEventAt(tx: TopologyTransaction, slot: string, operationId: string, sequence: number) {
  const event = await tx.get('directedAgenticaEvents', [slot, operationId, sequence]);
  check(event && event.operationId === operationId && event.sequence === sequence, 'missing retained operation event');
  boundedJson(event);
  const link = await tx.get('directedAgenticaOperations', [slot, operationId]);
  check(link && event.hostId === link.binding.hostId && event.sessionId === link.binding.sessionId
    && event.actionId === link.action.actionId, 'retained event binding mismatch');
  const { root, checkpoint } = await streamRecord(tx, slot);
  validateDirectedObservation(event.observation, link.binding, root, checkpoint.revision);
  return event;
}

/** One in-flight event. Its exact immutable body is written BEFORE any network delivery. */
export async function stageDirectedHostEventAt(tx: TopologyTransaction, slot: string, operationId: string,
  kind?: DirectedHostEvent['kind'], nextOwner?: StreamControl): Promise<DirectedHostEvent> {
  const link = await directedHostOperationAt(tx, slot, operationId);
  if (link.sequence !== link.acknowledged) {
    check(!kind && !nextOwner, 'deliver original pending event before another transition');
    return hostEventAt(tx, slot, operationId, link.sequence);
  }
  const { root, checkpoint } = await streamRecord(tx, slot);
  const { record } = await directedRecordAt(tx, slot, checkpoint, operationId);
  check(record, 'missing journey for operation event');
  const previous = link.sequence ? await hostEventAt(tx, slot, operationId, link.sequence) : undefined;
  check(!previous || !['completed', 'blocked', 'cancelled', 'decision'].includes(previous.kind), 'operation is already terminal or handed off');
  const owner = await streamControl(tx, slot);
  const operation = record.state.operation;
  const selected = kind ?? (operation.status === 'arrived' ? link.binding.arrivalPolicy === 'inspect' ? 'decision' : 'completed' : operation.status === 'cancelled' ? 'cancelled'
    : operation.status === 'interrupted' || record.state.paused ? 'blocked' : 'progress');
  check(owner && (selected === 'cancelled' && operation.status === 'cancelled'
    || sameStreamControl(owner, record.state.frame.control)), 'operation evidence has lost ownership');
  if (selected === 'completed') check(!link.binding.arrivalPolicy && operation.status === 'arrived'
    && sameAddress(checkpoint.position, link.binding.destination), 'arrival does not prove this objective');
  if (selected === 'transfer') check(nextOwner && sameStreamControl(owner, nextOwner)
    && String(nextOwner.epoch) !== link.activeEpoch, 'transfer requires explicit new custody');
  else if (selected !== 'cancelled') check(String(owner.epoch) === link.activeEpoch, 'event epoch changed without explicit transfer');
  const observation = directedObservation(await snapshotAt(tx, slot, root, checkpoint),
    { ...link.binding, control: owner, sessionEpoch: String(owner.epoch) }, record);
  const summary = selected === 'completed' ? 'Reached the explicitly granted destination. No interaction performed.'
    : selected === 'transfer' ? 'Explicitly adopted the retained journey under new host ownership.'
    : selected === 'progress' ? 'Routine browser-owned travel progress; no cognition requested.'
    : selected === 'decision' ? 'Destination reached. The governing objective still requires inspection; decide from the retained actor evidence.' : operation.reason;
  const event: DirectedHostEvent = { hostId: 'maze-battle', sessionId: link.binding.sessionId, sessionEpoch: link.activeEpoch,
    actionId: link.action.actionId, operationId, sequence: link.sequence + 1, eventId: crypto.randomUUID(),
    kind: selected, observation, summary, usage: directedUsage(record),
    ...(selected === 'completed' ? { completion: { objectiveId: link.binding.objectiveId, evidenceId: crypto.randomUUID(), summary } } : {}),
    ...(selected === 'transfer' ? { nextSessionEpoch: String(nextOwner!.epoch) } : {}) };
  check(Number.isSafeInteger(event.sequence), 'operation event sequence exhausted'); boundedJson(event);
  await tx.put('directedAgenticaEvents', [slot, operationId, event.sequence], event);
  await tx.put('directedAgenticaOperations', [slot, operationId], { ...link, sequence: event.sequence,
    activeEpoch: event.nextSessionEpoch ?? link.activeEpoch });
  await tx.stageRoot(slot, root);
  return event;
}
export function stageDirectedHostEvent(slot: string, operationId: string) {
  return topologyTransaction(tx => stageDirectedHostEventAt(tx, slot, operationId));
}
export function readDirectedHostOperation(slot: string, operationId: string) {
  return topologyTransaction(async tx => {
    const link = await directedHostOperationAt(tx, slot, operationId);
    const event = link.sequence ? await hostEventAt(tx, slot, operationId, link.sequence) : undefined;
    return { link, event };
  });
}
export function acknowledgeDirectedHostEvent(slot: string, event: DirectedHostEvent) {
  const input = structuredClone(event); boundedJson(input);
  return topologyTransaction(async tx => {
    const link = await directedHostOperationAt(tx, slot, input.operationId);
    const original = await hostEventAt(tx, slot, input.operationId, input.sequence);
    check(boundedJson(original) === boundedJson(input) && link.sequence === input.sequence, 'event acknowledgement identity mismatch');
    const { root } = await streamRecord(tx, slot);
    await tx.put('directedAgenticaOperations', [slot, input.operationId], { ...link, acknowledged: input.sequence });
    await tx.stageRoot(slot, root);
  });
}
