import type { AgenticaHost, HostOperationEvent } from '../sdk/agentica-host.mjs';
import type { CanonicalRecoveryPort } from '../../game/CanonicalHostRecovery';
import { readAgenticaTerminal } from '../../../persistence/canonical/agentica/terminal';
import { terminalAcknowledgement } from '../../../persistence/canonical/agentica/terminal.ack';
import { equivalentOperationWire, operationEntry, operationEntryShape, validateOperationEntry } from '../../../persistence/canonical/agentica/operation.wire';
import type { PreparedAction } from '../../../persistence/canonical/agentica/types';
import type { OperationBinding } from '../../../persistence/canonical/agentica/operation.types';
import { check } from '../../../persistence/canonical/validation';
import { equal } from '../../../persistence/canonical/agentica/validation';
import type { CanonicalRequest } from '../../../persistence/canonical/types';

type Terminal = NonNullable<Awaited<ReturnType<typeof readAgenticaTerminal>>['value']>;
export type OperationSdk = Pick<AgenticaHost, 'listOperations' | 'signalOperation' | 'stopDecision'>;

/** Bounded historical delivery only. No ordinary ACK writes, new perception, action adoption or model calls. */
export async function deliverGameTerminal(port: CanonicalRecoveryPort, sdk: OperationSdk, terminal: Terminal,
  network: typeof fetch, signal: AbortSignal, hostSignal: AbortSignal, retry?: CanonicalRequest) {
  signal.throwIfAborted();
  const { identity, binding, bound, event } = terminal;
  if (bound.operation.state === 'acknowledged') return { status: 'terminal-acknowledged' as const, disposition: event.kind };
  const stoppedDecision = event.kind === 'decision' && bound.launch.guard.terminal?.disposition === 'cancelled';
  if (event.kind === 'decision' && !stoppedDecision) return { status: 'decision-required' as const, event };
  const entries = await sdk.listOperations({ hostId: event.hostId, sessionId: event.sessionId, fetchImpl: network });
  signal.throwIfAborted();
  const matches = entries.filter(e => e.action.actionId === identity.action.actionId && e.action.runId === identity.action.runId);
  check(matches.length <= 1, 'ambiguous terminal service custody');
  if (!matches.length) return { status: 'awaiting-service' as const };
  let entry = operationEntryShape(matches[0]);
  const priorEpoch = terminal.transfer?.data.event.sessionEpoch;
  check(entry.activeEpoch === event.sessionEpoch || entry.activeEpoch === priorEpoch, 'terminal service epoch changed');
  validateOperationEntry(entry, bound.start, identity.action, bound.result, entry.activeEpoch);
  if (terminal.confirmed) check(equal(entry.usage, terminal.confirmed.data.entry.usage), 'terminal admission usage changed');
  const delivery = stoppedDecision ? 'stop-decision' as const : 'signal' as const;
  if (!(entry.latestEvent && equivalentOperationWire(entry.latestEvent, event, 'event'))) {
    entry = operationEntry(entry);
    const latest = entry.latestEvent, last = terminal.previous ?? terminal.probe;
    let next: HostOperationEvent = event;
    if (terminal.transfer && latest && equivalentOperationWire(latest, terminal.transfer.data.previous, 'event')) {
      check(terminal.bound.progress.sequence === terminal.transfer.data.navigationSequence, 'service lost acknowledged transfer');
      next = terminal.transfer.data.event;
    } else if (!latest && terminal.probe) {
      check(!terminal.transfer, 'service lost transfer predecessor');
      check(!terminal.previous || terminal.previous.sequence === 2, 'service lost acknowledged progress'); next = terminal.probe;
    } else if (last && (!latest || !equivalentOperationWire(latest, last, 'event'))) {
      check(terminal.previous && latest && terminal.predecessor
        && equivalentOperationWire(latest, terminal.predecessor, 'event'), 'service progress diverged from retained predecessor');
      next = terminal.previous;
    } else check(last ? !!latest : !latest, 'unexpected terminal predecessor');
    const remote = next === event && stoppedDecision ? await sdk.stopDecision(next, { fetchImpl: network })
      : await sdk.signalOperation(next, { fetchImpl: network });
    signal.throwIfAborted();
    if (next !== event) {
      const accepted = operationEntry(remote); validateOperationEntry(accepted, bound.start, identity.action, bound.result, next.nextSessionEpoch ?? next.sessionEpoch);
      check(equal(accepted.usage, entry.usage) && accepted.latestEvent
        && equivalentOperationWire(accepted.latestEvent, next, 'event'), 'service did not acknowledge retained predecessor');
      return { status: 'terminal-prefix-delivered' as const, sequence: next.sequence };
    }
    entry = remote;
  }
  const prepared = terminalAcknowledgement(identity, binding, entry, delivery), args = await prepared.prepare();
  signal.throwIfAborted();
  await port.cleanupHostOperation(retry ? { kind: 'verified-retry', request: retry, verify: prepared.verify }
    : { kind: 'verified-ack', ...args, verify: prepared.verify }, hostSignal);
  return { status: 'terminal-acknowledged' as const, disposition: event.kind };
}

export const operationTerminal = (identity: PreparedAction, binding: OperationBinding) => readAgenticaTerminal(identity, binding);
