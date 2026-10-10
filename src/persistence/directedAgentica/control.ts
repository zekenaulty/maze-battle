import { topologyTransaction } from '../topology/database';
import { directedHostOperationAt } from './records';
import { hostEventAt, stageDirectedHostEventAt } from './events';
import { streamControl, streamRecord } from '../streamRecords';
import { directedRecordAt, sameStreamControl } from '../directedStreamRecords';
import { agenticaCheck as check } from '../agenticaValidation';
import { adoptDurableDirectedStreamTravelInTransaction, stopDurableDirectedStreamTravelInTransaction } from '../directedStreamRepository';
import type { StreamControl } from '../../domain/expedition/streaming/types';

/** Explicit adoption and transfer receipt share the same commit; neither can exist alone. */
export function adoptDirectedAgenticaOperation(slot: string, operationId: string, owner: StreamControl) {
  const token = structuredClone(owner);
  return topologyTransaction(async tx => {
    const link = await directedHostOperationAt(tx, slot, operationId);
    check(link.sequence === link.acknowledged, 'reconcile original pending event before adoption');
    check(sameStreamControl(await streamControl(tx, slot), token), 'adoption owner changed');
    const { checkpoint } = await streamRecord(tx, slot);
    const { record } = await directedRecordAt(tx, slot, checkpoint, operationId);
    check(record, 'missing retained journey');
    await adoptDurableDirectedStreamTravelInTransaction(tx, slot, token, { operationId, revision: record.revision }, Date.now);
    return stageDirectedHostEventAt(tx, slot, operationId, 'transfer', token);
  });
}

/** Fence movement before cancellation is acknowledged, even if the service is offline. */
export function cancelDirectedAgenticaOperation(slot: string, operationId: string, owner: StreamControl) {
  const token = structuredClone(owner);
  return topologyTransaction(async tx => {
    const link = await directedHostOperationAt(tx, slot, operationId);
    // Keep any original undelivered event. Cancellation can be signalled after it,
    // but a network outage must never delay the local stop barrier.
    await stopDurableDirectedStreamTravelInTransaction(tx, slot, token, operationId, 'cancel');
    if (link.sequence !== link.acknowledged) return undefined;
    if (link.sequence && ['blocked', 'cancelled', 'completed', 'decision'].includes((await hostEventAt(tx, slot, operationId, link.sequence)).kind)) return undefined;
    return stageDirectedHostEventAt(tx, slot, operationId, 'cancelled');
  });
}
