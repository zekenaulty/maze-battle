import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { AcknowledgementVerifier } from '../acknowledgement';
import { MAX_ACK_PROOF_BYTES } from '../operationValidation';
import { readCanonical } from '../read';
import { fields } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import type { JsonObject } from '../types';
import { captureOperationBinding } from './operation.binding';
import { equivalentOperationWire, operationEntryShape, validateOperationEntry } from './operation.wire';
import type { OperationBinding, OperationRead } from './operation.types';
import { loadAgenticaTerminal } from './terminal';
import { decisionHandoffEvidence } from './terminal.decision';
import { decisionRootStopEvidence } from './terminal.root-stop';
import type { PreparedAction } from './types';
import { equal, snapshotJson, snapshotPrepared } from './validation';

export type TerminalDelivery = 'signal' | 'stop-decision' | 'decision-handoff' | 'decision-root-stop';
type Terminal = NonNullable<Awaited<ReturnType<typeof loadAgenticaTerminal>>>;
/** Validate full service identity; compact evidence points back to originals rather than copying them again. */
async function acknowledgement(pages: OperationRead, terminal: Terminal, entry: AgenticaOperationEntry, delivery: TerminalDelivery): Promise<JsonObject> {
  const { bound, identity, event } = terminal, remote = operationEntryShape(entry);
  check(bound.operation.ackPolicy === 'verified-host', 'operation lacks verified acknowledgement policy');
  const handoff = delivery === 'decision-handoff' ? await decisionHandoffEvidence(pages, terminal, remote)
    : delivery === 'decision-root-stop' ? await decisionRootStopEvidence(pages, terminal, remote) : null;
  if (!handoff) {
    validateOperationEntry(remote, bound.start, identity.action, bound.result, event.sessionEpoch);
    check(remote.wakeRunId == null && remote.wakeAdoption == null && (!('settledUsage' in remote) || remote.settledUsage == null),
      'terminal acknowledgement has successor custody');
    if (terminal.confirmed) check(equal(remote.usage, terminal.confirmed.data.entry.usage), 'terminal admission usage changed');
    check(remote.latestEvent && equivalentOperationWire(remote.latestEvent, event, 'event'), 'service did not acknowledge exact terminal');
    if (delivery === 'stop-decision') check(bound.launch.guard.terminal?.disposition === 'cancelled' && event.kind === 'decision' && remote.state === 'cancelled'
      && remote.stopDecision && equivalentOperationWire(remote.stopDecision, event, 'event'), 'original decision is not stopped');
    else check(delivery === 'signal' && (event.kind === 'blocked' || event.kind === 'cancelled')
      && remote.state === event.kind && remote.stopDecision == null, 'service terminal disposition changed');
  }
  const proof = snapshotJson({ schema: 1, delivery, action: identity.storageKey,
    original: bound.original.reference, result: bound.original.resultReference!, event,
    ...(terminal.transfer ? { transfer: terminal.transfer.reference } : {}),
    ...(handoff ?? { remote: { activeEpoch: remote.activeEpoch, state: remote.state, usage: remote.usage } }) });
  jsonBytes(proof, MAX_ACK_PROOF_BYTES); return proof as unknown as JsonObject;
}

/** Capture raw HTTP response synchronously. Fresh verification repeats inside the funded transaction. */
export function terminalAcknowledgement(input: PreparedAction, inputBinding: OperationBinding,
  inputEntry: AgenticaOperationEntry, delivery: TerminalDelivery) {
  const identity = snapshotPrepared(input), binding = captureOperationBinding(inputBinding), entry = operationEntryShape(inputEntry);
  const verify: AcknowledgementVerifier = async (pages, request) => {
    const args = fields(request.input, 'operationId terminalAttemptId proof'), terminal = await loadAgenticaTerminal(pages, identity, binding);
    check(terminal && args.operationId === terminal.bound.operation.id
      && args.terminalAttemptId === terminal.terminal.terminal.source.attemptId, 'terminal acknowledgement target changed');
    check(equal(args.proof, await acknowledgement(pages, terminal, entry, delivery)), 'terminal acknowledgement proof changed');
  };
  return {
    verify,
    async prepare() {
      const result = await readCanonical(async pages => {
        const terminal = await loadAgenticaTerminal(pages, identity, binding); check(terminal, 'operation is not locally terminal');
        return { target: { generation: terminal.bound.operation.generation, gameId: terminal.bound.operation.gameId, operationId: terminal.bound.operation.id },
          terminalAttemptId: terminal.terminal.terminal.source.attemptId, proof: await acknowledgement(pages, terminal, entry, delivery) };
      });
      return result.value;
    },
  };
}
