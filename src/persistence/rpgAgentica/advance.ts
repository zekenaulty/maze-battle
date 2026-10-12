import { destinationExpired } from '../../domain/directed/destinationLimits';
import { requireRpg, rpgShape } from '../../services/agentica/rpg/validation';
import { boundedJson } from '../agenticaValidation';
import { commitRpgTravelInTransaction, currentGame } from '../rpgTravel/execute';
import type { RpgTravelRequest } from '../rpgTravel/types';
import { travelFingerprint, validateTravelReceipt } from '../rpgTravel/validation';
import { rpgOperationAt } from './records';
import { rpgEventAt, rpgEventKey, stageRpgEventAt } from './events';
import { checkHost, rpgAgenticaWrite, sealHost } from './transaction';

/** A local step and its outbound evidence are one ordinary game transaction. */
export function advanceRpgHostOperation(request: RpgTravelRequest, signal?: AbortSignal) {
  const fingerprint = travelFingerprint(request), input: RpgTravelRequest = JSON.parse(fingerprint);
  requireRpg(input.action.type !== 'start' && input.action.type !== 'explore', 'SDK admission owns journey creation');
  return rpgAgenticaWrite(async tx => {
    const retained = await tx.objectStore('rpgAgenticaAdvances').get(input.attemptId);
    if (retained) {
      checkHost(retained);
      requireRpg(rpgShape(retained, 'attemptId,fingerprint,waitingForAck,witness', 'eventKey')
        && retained.attemptId === input.attemptId && retained.fingerprint === fingerprint, 'local attempt identity reused');
      const saved = await tx.objectStore('rpgTravelActions').get(input.attemptId); requireRpg(saved, 'missing local receipt');
      const receipt = validateTravelReceipt(saved, input, fingerprint);
      const parts = retained.eventKey ? JSON.parse(retained.eventKey) : undefined;
      requireRpg(!parts || parts[0] === input.operationId && rpgEventKey(parts[0], parts[1]) === retained.eventKey, 'event identity changed');
      const event = parts ? await rpgEventAt(tx, parts[0], parts[1]) : undefined;
      return { receipt, event, current: await currentGame(tx), replayed: true, waitingForAck: retained.waitingForAck };
    }
    requireRpg(!await tx.objectStore('rpgTravelActions').get(input.attemptId), 'attempt was not admitted by this adapter');
    const link = await rpgOperationAt(tx, input.operationId);
    requireRpg(link.kind !== 'interaction', 'Interaction decisions have no travel steps.');
    requireRpg(input.gameId === link.binding.gameId, 'operation belongs to another game');
    const previous = link.sequence ? await rpgEventAt(tx, input.operationId, link.sequence) : undefined;
    const pending = link.sequence !== link.acknowledged;
    // Cancellation still fences local work when an earlier network acknowledgement is missing.
    if (pending && input.action.type !== 'cancel') {
      requireRpg(input.action.type !== 'adopt', 'acknowledge original before adopting');
      return { event: previous, current: await currentGame(tx), waitingForAck: true };
    }
    requireRpg(!previous || !['completed', 'decision', 'blocked', 'cancelled'].includes(previous.kind), 'operation is terminal or handed off');
    if (input.action.type === 'step') requireRpg(String(input.control.epoch) === link.activeEpoch, 'explicit adoption and transfer required');
    const outcome = await commitRpgTravelInTransaction(tx, input);
    const { receipt } = outcome;
    const event = receipt.disposition !== 'applied' ? undefined : pending ? previous
      : await stageRpgEventAt(tx, input.operationId, receipt.travel!.control,
        input.action.type === 'adopt' && String(input.control.epoch) !== link.activeEpoch);
    await tx.objectStore('rpgAgenticaAdvances').add(sealHost({ attemptId: input.attemptId, fingerprint, waitingForAck: pending,
      ...(event ? { eventKey: rpgEventKey(event.operationId, event.sequence) } : {}) }));
    const current = await currentGame(tx);
    if (!outcome.replayed && receipt.disposition === 'applied') {
      requireRpg(Date.now() < input.deadlineAt, 'operation action expired before commit');
      if (receipt.command || input.action.type === 'adopt')
        requireRpg(!destinationExpired(receipt.travel!.operation, Date.now()), 'original journey deadline exhausted');
    }
    if (event) boundedJson(event);
    return { ...outcome, event, current, waitingForAck: pending };
  }, signal);
}
