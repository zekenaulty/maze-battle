import type { GameSession } from '../../game/GameSession';
import type { OwnerFence } from '../../../persistence/canonical/types';
import type { RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery.types';
import type { DestinationProgress } from '../../../persistence/canonical/navigation/types';
import { inspectAgenticaRecovery } from '../../../persistence/canonical/agentica/recovery.inspect';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { loadOperationConfirmation } from '../../../persistence/canonical/agentica/operation.confirmation';
import { loadAgenticaOperation } from '../../../persistence/canonical/agentica/operation';
import { readPublicationSelection } from '../../../persistence/canonical/agentica/publication-selection';
import { loadTransfer, loadTransferAck } from '../../../persistence/canonical/agentica/transfer.records';
import { readCanonical } from '../../../persistence/canonical/read';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { check, sameFence } from '../../../persistence/canonical/validation';
import { AgenticaHost, type AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { PlayAdoptionOffer } from './playAdoption';
import { createGameOperationTransfer } from './operationTransfer';
import { createGameOperationDriver } from './operationDriver';
import { publishGamePublication } from './publication';
import { startPlayNavigation, type PlayNavigationStatus } from './playNavigation';
import { transportGate } from './transportGate';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';

export interface ActiveNavigationOffer extends Omit<PlayAdoptionOffer, 'remainingContinuations'> { progress: DestinationProgress }

export async function readActiveTransfer(original: ActiveNavigationOffer['original']) {
  const identity = await prepareAction(original.action);
  return readCanonical(async pages => {
    const confirmed = await loadOperationConfirmation(pages, identity);
    check(confirmed && equal(confirmed.data.binding, original.binding), 'active original confirmation changed');
    const operation = await loadAgenticaOperation(pages, identity);
    const selected = await readPublicationSelection(pages, confirmed.bound.launch.binding.launchId);
    const transfer = await loadTransfer(pages, identity, confirmed);
    const ack = transfer && await loadTransferAck(pages, identity, confirmed, transfer);
    return { confirmed, operation, selected, transfer, ack };
  });
}

/** Local inspected offer only. No publication, transfer, action, sight or service request. */
export async function inspectActiveNavigation(session: GameSession, fence: OwnerFence, candidate: RecoveryCandidate,
  options: { signal?: AbortSignal } = {}): Promise<ActiveNavigationOffer | null> {
  fence = structuredClone(fence); candidate = structuredClone(candidate);
  const hostSignal = session.hostSignal, signal = AbortSignal.any([hostSignal, ...(options.signal ? [options.signal] : [])]);
  const current = () => {
    signal.throwIfAborted(); const { view } = session, snapshot = view.game?.snapshot;
    check(session.hostSignal === hostSignal && session.owner === fence.owner && view.controlled && !view.busy
      && !view.recoveryRequired && view.game?.mode === 'manual' && snapshot?.generation === fence.generation
      && snapshot.gameId === fence.gameId && snapshot.revision === fence.revision, 'active navigation control or fence changed');
  };
  current();
  return inRecoveryDatabase(signal, async guarded => {
    const inspected = await inspectAgenticaRecovery(fence, candidate, { signal }); current();
    if (inspected.action.capabilityId === 'maze.interact' || inspected.operation.state !== 'admitted'
      || inspected.progress.status !== 'running' || inspected.terminal || inspected.decision || inspected.claim) return null;
    const original = { action: inspected.action, binding: candidate.binding };
    const read = await readActiveTransfer(original); guarded.throwIfAborted(); current();
    check(sameFence(read.head, fence), 'active navigation inspection changed');
    check(gameCheckpoint(read.head.checkpoint).mode === 'manual', 'active navigation requires manual dungeon control');
    const { confirmed: { bound }, operation, selected, transfer } = read.value;
    check(bound.kind === 'navigation' && operation?.kind === 'navigation' && operation.custodyAck,
      'active navigation needs acknowledged custody');
    check(bound.launch.guard.state === 'admitted' && bound.active?.id === inspected.launchId
      && bound.active.sourceAttemptId === bound.launch.guard.admissionAttemptId
      && selected && equal(selected.value.data.grant, original.binding.grant)
      && equal(selected.value.data.publication, original.binding.publication), 'active navigation root or selected grant changed');
    if (!transfer && bound.operation.owner === fence.owner && bound.operation.epoch === fence.epoch) return null;
    check(Number(original.action.sessionEpoch) < fence.epoch, 'active navigation requires newer inspected custody');
    return structuredClone({ fence, candidate, launchId: inspected.launchId, original, progress: operation.progress,
      objective: bound.launch.acceptedStart.objective,
      profile: { endpoint: bound.launch.binding.endpoint, provider: bound.start.provider, limits: bound.start.limits } });
  });
}

/** One explicit transfer/reconciliation, then the ordinary serialized operation driver. Never wakes cognition. */
export async function resumeActiveNavigation(session: GameSession, offer: ActiveNavigationOffer, signal: AbortSignal,
  update: (status: PlayNavigationStatus) => void, fail: (error: unknown) => void,
  factory: (options: AgenticaHostOptions) => AgenticaHost = options => new AgenticaHost(options)) {
  const gate = transportGate(session), lifetime = AbortSignal.any([signal, gate.signal]);
  const forbidden = async () => { throw Error('Active navigation recovery cannot invoke actions or cognition.'); };
  const sdk = factory({ url: offer.profile.endpoint, onAction: forbidden, loadAction: forbidden, saveAction: forbidden });
  let transfer: Awaited<ReturnType<typeof createGameOperationTransfer>> | undefined;
  let prefix: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
  let navigation: Awaited<ReturnType<typeof startPlayNavigation>> | undefined;
  const close = () => { navigation?.close(); prefix?.close(); transfer?.close(); sdk.close(); gate.close(); lifetime.removeEventListener('abort', close); };
  lifetime.addEventListener('abort', close, { once: true });
  try {
    lifetime.throwIfAborted();
    check(equal(await inspectActiveNavigation(session, offer.fence, offer.candidate, { signal: lifetime }), offer), 'active navigation offer changed');
    let prior = await readActiveTransfer(offer.original); lifetime.throwIfAborted();
    if (prior.value.operation?.event && !prior.value.operation.acknowledgement) {
      // Reconcile the committed predecessor before transfer. This port cannot advance or settle anything.
      prefix = await createGameOperationDriver({ hostSignal: gate.signal, cleanupHostOperation: forbidden,
        submitHostCommand(command) {
          check(command.kind === 'fresh' && command.operation === 'agentica.operation.ack', 'active recovery only permits the retained progress ACK');
          return gate.port.submitHostCommand(command);
        },
      }, sdk, offer.original.action, offer.original.binding);
      lifetime.throwIfAborted();
      try { check((await prefix.pulse()).status === 'acknowledged', 'original progress ACK unresolved'); lifetime.throwIfAborted(); }
      finally { prefix.close(); }
      prior = await readActiveTransfer(offer.original); lifetime.throwIfAborted();
    }
    transfer = await createGameOperationTransfer(gate.port, sdk, offer.original.action, offer.original.binding);
    const intent = prior.value.transfer;
    if (!intent || intent.source.expected.owner !== prior.head.owner || intent.source.expected.epoch !== prior.head.epoch) {
      if (intent && !prior.value.ack) {
        check((await transfer.pulse()).status === 'transfer-acknowledged', 'original transfer ACK unresolved');
        lifetime.throwIfAborted();
      }
      await transfer.prepare(await publishGamePublication(gate.port)); lifetime.throwIfAborted();
    }
    let authorized = false;
    for (let pulse = 0; pulse < 4; pulse++) {
      const result = await transfer.pulse(); lifetime.throwIfAborted();
      check(result.status !== 'takeover-required', 'active navigation owner changed during transfer');
      if (result.status === 'navigation-authorized') { authorized = true; break; }
    }
    check(authorized, 'active navigation transfer did not authorize'); transfer.close();
    navigation = await startPlayNavigation(session, sdk, offer.original.action, offer.original.binding, lifetime,
      status => { update(status); if (status.phase === 'decision') close(); }, error => { close(); fail(error); });
    lifetime.throwIfAborted(); return { close };
  } catch (error) { close(); throw error; }
}
