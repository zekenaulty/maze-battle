import { commitContentCommand } from '../game/contentCommand';
import { gameCheckpoint } from '../game/checkpoint';
import { prepareOperationHost, type OperationHostHooks } from '../operationHost';
import { operationInput } from '../operationValidation';
import { readCanonical } from '../read';
import { fields } from '../roster/codec';
import { executeCanonical, operateCanonical } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check, request as validateRequest, validId } from '../validation';
import { json, same } from '../world/records';
import { interactionKey, loadInteraction, saveInteraction } from './records';
import { interactionBinding } from './validation';
import { interactionDisposition, type InteractionProgress } from './types';
export { createInteractionBinding } from './validation';
export { readInteractionTerminal, loadInteractionTerminal } from './terminal';

type Options = { signal?: AbortSignal; host?: OperationHostHooks<InteractionProgress> };
/** Trusted host facade. Adapter hooks must supply disclosure, grant and service-custody checks. */
export function executeInteractionCommand(input: CanonicalRequest, options: Options = {}) {
  const request = validateRequest(input), { host, signal } = options;
  if (request.operation === 'operation.admit') {
    const input = operationInput(request, 'admit'), binding = interactionBinding(input.binding);
    return operateCanonical(request, 'admit', async tx => {
      check(tx.operation.ackPolicy !== 'verified-host' || host, 'verified interaction requires host hooks');
      check(!await tx.pages.get('execution', interactionKey(tx.operation.id)), 'interaction already exists');
      const commit = await prepareOperationHost(tx, tx.operation, request, host, 'interaction');
      const checkpoint = gameCheckpoint(tx.head.checkpoint);
      check(same(binding.position, checkpoint.position), 'interaction position changed before admission');
      const progress: InteractionProgress = { schema: 1, operationId: tx.operation.id, binding, sourceAttemptId: request.attemptId,
        owner: tx.head.owner, epoch: tx.head.epoch, sequence: 0, status: 'pending', reason: null, result: null };
      return commit({ ...await saveInteraction(tx.pages, progress, request), checkpoint });
    }, { signal });
  }
  if (request.operation === 'operation.settle') {
    const input = operationInput(request, 'settle');
    return operateCanonical(request, 'settle', async tx => {
      const progress = await loadInteraction(tx.pages, tx.operation);
      check(input.disposition === interactionDisposition(progress), 'interaction not ready for settlement');
      check(tx.operation.ackPolicy !== 'verified-host' || host, 'verified interaction requires host hooks');
      const commit = await prepareOperationHost(tx, tx.operation, request, host, 'interaction');
      return commit({ progress, checkpoint: gameCheckpoint(tx.head.checkpoint), result: json({ operationId: progress.operationId,
        status: progress.status, reason: progress.reason, sequence: progress.sequence, outcome: progress.result }) });
    }, { signal });
  }
  check(request.operation === 'interaction.apply', 'invalid interaction command');
  const apply = fields(request.input, 'operationId sequence');
  check(validId(apply.operationId) && apply.sequence === 0, 'invalid interaction apply');
  return executeCanonical(request, async tx => {
    const operation = await tx.liveOperation(apply.operationId as string);
    check(operation?.state === 'admitted', 'interaction is not admitted');
    check(operation.owner === tx.head.owner && operation.epoch === tx.head.epoch, 'interaction needs explicit custody');
    check(operation.ackPolicy !== 'verified-host' || host, 'verified interaction requires host hooks');
    const before = await loadInteraction(tx.pages, operation);
    check(before.status === 'pending' && before.sequence === 0, 'interaction already consumed');
    check(before.owner === operation.owner && before.epoch === operation.epoch, 'interaction transfer is not supported');
    const commit = await prepareOperationHost(tx, operation, request, host, 'interaction');
    let checkpoint = gameCheckpoint(tx.head.checkpoint);
    let progress: InteractionProgress = { ...before, sequence: 1, status: 'blocked', reason: 'position-changed' };
    if (same(checkpoint.position, before.binding.position)) {
      if (checkpoint.mode === 'town' && before.binding.command.kind === 'open-chest') progress.reason = 'unavailable';
      else {
        const result = await commitContentCommand({ ...tx, setCheckpoint: value => {
          checkpoint = gameCheckpoint(value); tx.setCheckpoint(value);
        } }, before.binding.command);
        check(result.outcome === 'applied' || result.outcome === 'unchanged', 'invalid shared interaction outcome');
        progress = { ...progress, status: result.outcome, reason: null, result };
      }
    }
    return commit({ ...await saveInteraction(tx.pages, progress, request), checkpoint });
  }, { signal });
}
export function readInteraction(id: string) {
  interactionKey(id);
  return readCanonical(async pages => {
    const operation = await pages.liveOperation(id); check(operation, 'missing interaction operation');
    const progress = await loadInteraction(pages, operation);
    check(!operation.terminal || operation.terminal.disposition === 'cancelled'
      || operation.terminal.disposition === interactionDisposition(progress), 'interaction terminal disagrees with progress');
    return { operation, progress, status: operation.terminal?.disposition === 'cancelled' ? 'cancelled' as const : progress.status };
  });
}
