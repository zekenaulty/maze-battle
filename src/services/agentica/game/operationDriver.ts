import type { AgenticaAction } from '../contracts';
import type { AgenticaHost } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { readAgenticaOperation, retainOperationConfirmation, retainOperationCustodyAck, operationProgressHooks, retainEventAcknowledgement } from '../../../persistence/canonical/agentica/operation';
import { executeNavigationCommand } from '../../../persistence/canonical/navigation/commands';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { json } from '../../../persistence/canonical/world/records';
import { check } from '../../../persistence/canonical/validation';
import { captureBinding, type ActionBinding } from './actionContract';
import { claimTransportAttachment, transportGate } from './transportGate';
import { boundedGameFetch } from './network';

type OperationSdk = Pick<AgenticaHost, 'listOperations' | 'signalOperation'>;
/** One bounded local operation per pulse, never a model call, new objective, or implicit adoption. */
export async function createGameOperationDriver(port: CanonicalHostPort, sdk: OperationSdk,
  input: AgenticaAction, inputBinding: ActionBinding, fetchImpl: typeof fetch = fetch) {
  const gate = transportGate(port), binding = captureBinding(inputBinding), identity = await prepareAction(input);
  const release = claimTransportAttachment(`operation:${identity.storageKey}`);
  gate.signal.addEventListener('abort', release, { once: true });
  if (gate.signal.aborted) { release(); gate.signal.throwIfAborted(); }
  const network = boundedGameFetch(gate.signal, fetchImpl);
  let busy = false;
  async function pulse() {
    check(!busy, 'operation pulse already in flight'); gate.signal.throwIfAborted(); busy = true;
    try {
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
      if (state.operation.state !== 'admitted' || state.progress.status !== 'running')
        return { status: 'needs-terminal-reconciliation' as const, progress: state.progress.status };
      const { operationId, sequence } = state.progress;
      await gate.port.submitHostCommand({ kind: 'fresh', operation: 'navigation.advance', input: { operationId, sequence },
        execute: (request, options) => executeNavigationCommand(request,
          { ...options, host: operationProgressHooks(identity, state.confirmation.reference) }) });
      return { status: 'advanced' as const, sequence: sequence + 1 };
    } finally { busy = false; }
  }
  return { pulse, close: gate.close };
}
