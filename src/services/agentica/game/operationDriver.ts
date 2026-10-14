import type { AgenticaAction } from '../contracts';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { HostCleanupError, type CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { readCanonical } from '../../../persistence/canonical/read';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { readAgenticaOperation, retainOperationConfirmation, retainOperationCustodyAck, operationProgressHooks, retainEventAcknowledgement } from '../../../persistence/canonical/agentica/operation';
import { executeNavigationCommand } from '../../../persistence/canonical/navigation/commands';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { loadOperationBinding } from '../../../persistence/canonical/agentica/operation.binding';
import { operationSettlementHooks } from '../../../persistence/canonical/agentica/terminal.settle';
import { json } from '../../../persistence/canonical/world/records';
import { check } from '../../../persistence/canonical/validation';
import { captureBinding, type ActionBinding } from './actionContract';
import { claimTransportAttachment, transportGate } from './transportGate';
import { boundedGameFetch } from './network';
import { deliverGameTerminal, operationTerminal, type OperationSdk } from './operationTerminal';

/** One bounded local operation per pulse, never a model call, new objective, or implicit adoption. */
export async function createGameOperationDriver(port: CanonicalHostPort & CanonicalRecoveryPort, sdk: OperationSdk,
  input: AgenticaAction, inputBinding: ActionBinding, fetchImpl: typeof fetch = fetch) {
  const gate = transportGate(port), delivery = transportGate(port), hostSignal = port.hostSignal;
  const binding = captureBinding(inputBinding), identity = await prepareAction(input);
  const release = claimTransportAttachment(`operation:${identity.storageKey}`);
  delivery.signal.addEventListener('abort', release, { once: true });
  if (delivery.signal.aborted) { release(); delivery.signal.throwIfAborted(); }
  const targets = await readCanonical(async pages => {
    const bound = await loadOperationBinding(pages, identity, binding), { generation, gameId, id } = bound.operation;
    return { operation: { generation, gameId, operationId: id }, guard: { generation, gameId, operationId: bound.launch.guard.id } };
  }).then(r => r.value).catch(error => { gate.close(); delivery.close(); throw error; });
  const network = boundedGameFetch(gate.signal, fetchImpl);
  const terminalNetwork = boundedGameFetch(delivery.signal, fetchImpl);
  const local = async (target = targets.operation) => {
    const result = await readCanonical(p => p.liveOperation(target.operationId));
    check(result.head.generation === target.generation && result.head.gameId === target.gameId && result.value, 'operation game changed');
    return result.value!;
  };
  let busy = false;
  let terminalRetry: CanonicalRequest | undefined;
  async function pulse() {
    check(!busy, 'operation pulse already in flight'); delivery.signal.throwIfAborted(); busy = true;
    try {
      if ((await local()).terminal) {
        const terminal = (await operationTerminal(identity, binding)).value; check(terminal, 'missing terminal evidence');
        try { return await deliverGameTerminal(port, sdk, terminal, terminalNetwork, delivery.signal, hostSignal, terminalRetry); }
        catch (error) {
          if (error instanceof HostCleanupError) terminalRetry = structuredClone(error.request);
          throw error;
        }
      }
      gate.signal.throwIfAborted();
      const state = (await readAgenticaOperation(identity)).value;
      if (!state) {
        const entries = await sdk.listOperations({ hostId: 'maze-battle', sessionId: identity.action.sessionId, fetchImpl: network });
        gate.signal.throwIfAborted();
        const matches = entries.filter(e => e.action.runId === identity.action.runId && e.action.actionId === identity.action.actionId);
        check(matches.length <= 1, 'ambiguous service operation custody');
        if (!matches.length) return { status: 'awaiting-service' as const };
        const entry = structuredClone(matches[0]);
        await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.confirm',
          input: json({ action: identity.storageKey, binding, entry }), execute: (request, options) => executeCanonical(request,
            async tx => (await retainOperationConfirmation(tx, request, identity, binding, entry)).receipt, options) });
        return { status: 'confirmed' as const };
      }
      if (state.progress.status !== 'running') {
        await gate.port.submitHostCommand({ kind: 'fresh', operation: 'operation.settle',
          input: { operationId: state.operation.id, disposition: state.progress.status === 'arrived' ? 'completed' : 'blocked' },
          execute: (request, options) => executeNavigationCommand(request, { ...options, host: operationSettlementHooks(identity, binding) }) });
        return { status: 'locally-settled' as const, progress: state.progress.status };
      }
      if (!state.custodyAck) {
        const confirmation = state.confirmation.reference, probe = structuredClone(state.confirmation.data.probe);
        const entry = await sdk.signalOperation(probe, { fetchImpl: network }); gate.signal.throwIfAborted();
        await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.custody',
          input: json({ action: identity.storageKey, confirmation, entry }), execute: (request, options) => executeCanonical(request,
            async tx => (await retainOperationCustodyAck(tx, request, identity, confirmation, entry)).receipt, options) });
        return { status: 'custody-confirmed' as const };
      }
      if (state.event && !state.acknowledgement) {
        const ref = state.event.reference, event = structuredClone(state.event.data.event);
        const entry = await sdk.signalOperation(event, { fetchImpl: network }); gate.signal.throwIfAborted();
        await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.ack',
          input: json({ action: identity.storageKey, event: ref, entry }), execute: (request, options) => executeCanonical(request,
            async tx => (await retainEventAcknowledgement(tx, request, identity, ref, entry)).receipt, options) });
        return { status: 'acknowledged' as const, sequence: event.sequence };
      }
      const { operationId, sequence } = state.progress;
      await gate.port.submitHostCommand({ kind: 'fresh', operation: 'navigation.advance', input: { operationId, sequence },
        execute: (request, options) => executeNavigationCommand(request,
          { ...options, host: operationProgressHooks(identity, state.confirmation.reference) }) });
      return { status: 'advanced' as const, sequence: sequence + 1 };
    } finally { busy = false; }
  }
  let cancellation: Promise<void> | undefined;
  function cancel() {
    gate.close();
    return cancellation ??= (async () => {
      for (const target of [targets.guard, targets.operation]) {
        delivery.signal.throwIfAborted();
        if (!(await local(target)).terminal) await port.cleanupHostOperation({ kind: 'cancel', target }, hostSignal);
      }
    })().catch(error => { cancellation = undefined; throw error; });
  }
  return { pulse, cancel, close() { gate.close(); delivery.close(); } };
}
