import { destinationDeadline, destinationExpired, limitReached } from '../../../domain/directed/destinationLimits';
import { gameCheckpoint } from '../game/checkpoint';
import { commitExplorationCommand } from '../game/explorationCommand';
import { readCanonical } from '../read';
import { executeCanonical, operateCanonical, type CanonicalWork } from '../transaction';
import { operationInput } from '../operationValidation';
import { readKnownCells } from '../knowledge/queries';
import { isCurrentFrontier } from '../knowledge/frontiers';
import { fields } from '../roster/codec';
import type { CanonicalRequest, Json } from '../types';
import { check, integer, isObject, request as validateRequest, validId } from '../validation';
import { json, same } from '../world/records';
import { resolveWorldStep } from '../world/residency';
import { NAVIGATION_WORK_LIMITS, type DestinationProgress, type DestinationReason } from './types';
import { destinationBinding } from './validation';
import { destinationKey, loadDestination, saveDestination } from './records';
import { knownStep, planDestination } from './planner';
import { prepareNavigationHost, type NavigationHostHooks } from './host';
export { createDestinationBinding, createFrontierBinding } from './validation';
export { readDestinationTerminal, loadDestinationTerminal } from './terminal';
export type { NavigationHostHooks, NavigationPreparation, NavigationCommit, NavigationHostRefs, NavigationRecordRef, NavigationReceiptRef } from './host';

const stop = (p: DestinationProgress, reason: DestinationReason): DestinationProgress => ({ ...p, route: [], reason,
  status: reason === 'arrived' ? 'arrived' : 'blocked' });
type Options = { signal?: AbortSignal; host?: NavigationHostHooks };
/** One local command per fenced commit. Cancel/adopt/ack use operateCanonical directly. */
export function executeNavigationCommand(input: CanonicalRequest, options: Options = {}) {
  const request = validateRequest(input), settings = { limits: { ...NAVIGATION_WORK_LIMITS }, signal: options.signal }, host = options.host;
  if (request.operation === 'operation.admit') {
    const input = operationInput(request, 'admit'), binding = destinationBinding(input.binding);
    return operateCanonical(request, 'admit', async tx => {
      check(!await tx.pages.get('execution', destinationKey(tx.operation.id)), 'destination already exists');
      const commitHost = await prepareNavigationHost(tx, tx.operation, request, host);
      const checkpoint = gameCheckpoint(tx.head.checkpoint), startedAt = Date.now();
      let approach: Awaited<ReturnType<typeof planDestination>> | undefined;
      if (binding.kind === 'frontier-approach') {
        check(await isCurrentFrontier(tx.pages, checkpoint, binding.frontier), 'frontier selection is stale or not an earned boundary');
        approach = await planDestination(tx.pages, checkpoint, binding.target);
        check(!approach.reason && approach.route.length > 0, 'frontier requires a nonzero earned approach');
      }
      let progress: DestinationProgress = { schema: 1, operationId: tx.operation.id, binding, sourceAttemptId: request.attemptId,
        owner: tx.head.owner, epoch: tx.head.epoch, sequence: 0, steps: 0, replans: 0, startedAt,
        deadline: destinationDeadline(startedAt, binding.limits), position: checkpoint.position, route: [], status: 'running', reason: null };
      if (destinationExpired(progress, startedAt)) progress = stop(progress, 'time-limit');
      else {
        const plan = approach ?? await planDestination(tx.pages, checkpoint, binding.target);
        if (plan.reason) progress = stop(progress, plan.reason);
        else if (limitReached(0, binding.limits.steps)) progress = stop(progress, 'step-limit');
        else progress.route = plan.route.slice(0, binding.limits.steps ?? plan.route.length);
      }
      return commitHost({ ...await saveDestination(tx.pages, progress, request), checkpoint });
    }, settings);
  }
  if (request.operation === 'operation.settle') {
    const input = operationInput(request, 'settle');
    return operateCanonical(request, 'settle', async tx => {
      const progress = await loadDestination(tx.pages, tx.operation);
      check(progress.status !== 'running' && input.disposition === (progress.status === 'arrived' ? 'completed' : 'blocked'), 'destination not ready for settlement');
      const commitHost = await prepareNavigationHost(tx, tx.operation, request, host);
      return commitHost({ progress, checkpoint: gameCheckpoint(tx.head.checkpoint), result: json({ operationId: progress.operationId,
        status: progress.status, reason: progress.reason, sequence: progress.sequence, steps: progress.steps, replans: progress.replans }) });
    }, settings);
  }
  check(request.operation === 'navigation.advance', 'invalid navigation command');
  const step = fields(request.input, 'operationId sequence');
  check(validId(step.operationId) && integer(step.sequence), 'invalid destination step');
  return executeCanonical(request, tx => advance(tx, request, step.operationId as string, step.sequence as number, host), settings);
}

async function advance(tx: CanonicalWork, request: CanonicalRequest, id: string, sequence: number, host?: NavigationHostHooks): Promise<Json> {
  const operation = await tx.liveOperation(id);
  check(operation?.state === 'admitted', 'destination is not admitted');
  check(operation.owner === tx.head.owner && operation.epoch === tx.head.epoch, 'destination needs explicit adoption');
  let p = await loadDestination(tx.pages, operation);
  check(p.status === 'running' && p.sequence === sequence && integer(sequence + 1), 'destination step changed');
  const commitHost = await prepareNavigationHost(tx, operation, request, host);
  const before = gameCheckpoint(tx.head.checkpoint), limits = p.binding.limits;
  let checkpoint = before;
  const invalidated = p.owner !== tx.head.owner || p.epoch !== tx.head.epoch || !same(p.position, before.position);
  p.sequence++; p.position = before.position;
  if (destinationExpired(p, Date.now())) p = stop(p, 'time-limit');
  else if (before.mode === 'town') p = stop(p, 'unavailable');
  else if ((await readKnownCells(tx.pages, before, [p.binding.target]))[0].state === 'unknown') p = stop(p, 'unknown-destination');
  else if (same(before.position, p.binding.target)) {
    const plan = await planDestination(tx.pages, before, p.binding.target); p = stop(p, plan.reason!);
  } else if (limitReached(p.steps, limits.steps)) p = stop(p, 'step-limit');
  else {
    if (invalidated || !p.route.length || !await knownStep(tx.pages, before, p.route[0])) {
      if (limitReached(p.replans, limits.replans)) p = stop(p, 'replan-limit');
      else {
        check(integer(p.replans + 1), 'navigation replan counter exhausted'); p.replans++;
        const plan = await planDestination(tx.pages, before, p.binding.target);
        if (plan.reason) p = stop(p, plan.reason);
        else p.route = plan.route.slice(0, limits.steps === null ? plan.route.length : limits.steps - p.steps);
      }
    }
    if (p.status === 'running') {
      const step = p.route[0]; check(step && await knownStep(tx.pages, before, step), 'navigation next edge is not earned');
      // The engine is only a legality check. It cannot suggest a route or disclose alternative cells.
      const legal = await resolveWorldStep(tx.pages, before.position, step.direction);
      if (!legal.moved || !same(legal.position, step.to)) p = stop(p, 'obstructed');
      else {
        const moved = await commitExplorationCommand({ ...tx, setCheckpoint: value => {
          checkpoint = gameCheckpoint(value); tx.setCheckpoint(value);
        } }, { kind: 'move', direction: step.direction, triggerStairs: false });
        check(isObject(moved), 'invalid movement result');
        if (moved.outcome === 'unavailable') p = stop(p, 'unavailable');
        else {
          check(moved.moved === true && same(moved.position, step.to) && integer(p.steps + 1), 'navigation movement diverged');
          p.steps++; p.position = step.to; p.route.shift();
          if (same(p.position, p.binding.target)) p = stop(p, 'arrived');
        }
      }
    }
  }
  return commitHost({ ...await saveDestination(tx.pages, p, request), checkpoint });
}

/** Cancellation/acknowledgement state comes from the funded kernel ledger, not a second writable status. */
export function readDestination(id: string) {
  destinationKey(id);
  return readCanonical(async pages => {
    const operation = await pages.liveOperation(id); check(operation, 'missing destination operation');
    const progress = await loadDestination(pages, operation);
    check(!operation.terminal || operation.terminal.disposition === 'cancelled'
      || operation.terminal.disposition === (progress.status === 'arrived' ? 'completed' : progress.status === 'blocked' ? 'blocked' : null), 'destination terminal disagrees with progress');
    return { operation, progress, status: operation.terminal?.disposition === 'cancelled' ? 'cancelled' as const : progress.status };
  });
}
