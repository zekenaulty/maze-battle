import { readCanonical } from '../read';
import { fields } from '../roster/codec';
import { check, integer } from '../validation';
import { captureOperationBinding } from './operation.binding';
import type { OperationBinding, OperationRead } from './operation.types';
import { loadAgenticaTerminalBase } from './terminal.base';
import { validateDecisionHandoffProof } from './terminal.decision';
import type { PreparedAction } from './types';
import { equal, snapshotPrepared } from './validation';

/** Public terminal reads revalidate ACK sources; decision evidence uses the ACK-free base. */
export async function loadAgenticaTerminal(pages: OperationRead, input: PreparedAction, inputBinding: OperationBinding) {
  const terminal = await loadAgenticaTerminalBase(pages, input, inputBinding);
  if (!terminal || terminal.bound.operation.state !== 'acknowledged') return terminal;
  const { bound, identity, event, transfer, confirmed } = terminal;
  const ack = await pages.sourceReceipt(bound.operation.acknowledgementAttemptId!);
  const args = fields(ack.source.input, 'operationId terminalAttemptId proof');
  const proof = fields(args.proof, 'schema delivery action original result event remote', 'transfer decision');
  check(args.operationId === bound.operation.id && args.terminalAttemptId === terminal.terminal.terminal.source.attemptId
    && proof.schema === 1 && proof.action === identity.storageKey && equal(proof.original, bound.original.reference)
    && equal(proof.result, bound.original.resultReference) && equal(proof.event, event)
    && equal(proof.transfer ?? null, transfer?.reference ?? null), 'terminal acknowledgement source changed');
  if (proof.delivery === 'decision-handoff') {
    await validateDecisionHandoffProof(pages, terminal, proof.decision, proof.remote, ack.receipt.beforeRevision);
  } else {
    check(!Object.hasOwn(proof, 'decision'), 'unexpected decision acknowledgement evidence');
    const remote = fields(proof.remote, 'activeEpoch state usage'), usage = fields(remote.usage, 'steps refinements continuations providerCalls');
    check(remote.activeEpoch === event.sessionEpoch && Object.values(usage).every(n => integer(n)), 'terminal acknowledgement source changed');
    check(proof.delivery === 'stop-decision' ? event.kind === 'decision' && remote.state === 'cancelled'
      && bound.launch.guard.terminal?.disposition === 'cancelled'
      : proof.delivery === 'signal' && event.kind !== 'decision' && remote.state === event.kind, 'terminal acknowledgement disposition changed');
    if (confirmed) check(equal(remote.usage, confirmed.data.entry.usage), 'terminal acknowledgement usage changed');
  }
  return terminal;
}
export function readAgenticaTerminal(input: PreparedAction, inputBinding: OperationBinding) {
  const identity = snapshotPrepared(input), binding = captureOperationBinding(inputBinding);
  return readCanonical(pages => loadAgenticaTerminal(pages, identity, binding));
}
