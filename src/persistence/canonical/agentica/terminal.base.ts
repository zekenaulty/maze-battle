import type { HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { loadDestinationTerminal } from '../navigation/terminal';
import { check, jsonBytes } from '../validation';
import { assertBoundAction, loadOperationBinding, captureOperationBinding, type BoundOperation } from './operation.binding';
import { loadOperationConfirmation } from './operation.confirmation';
import { loadOperationEvent } from './event.records';
import { MAX_EVENT_BYTES, type OperationBinding, type OperationRead } from './operation.types';
import type { PreparedAction } from './types';
import { snapshotJson, snapshotPrepared } from './validation';
import { loadTransfer } from './transfer.records';

/** Derive from retained evidence only. Stop needs no outbox write, fresh sight or current owner. */
export async function loadAgenticaTerminalBase(pages: OperationRead, input: PreparedAction, inputBinding: OperationBinding, context?: BoundOperation) {
  const identity = snapshotPrepared(input), binding = captureOperationBinding(inputBinding);
  const bound = context ?? await loadOperationBinding(pages, identity, binding);
  assertBoundAction(bound, identity, binding);
  if (!bound.operation.terminal) return null;
  const terminal = await loadDestinationTerminal(pages, bound.operation.id);
  const confirmed = await loadOperationConfirmation(pages, identity, undefined, bound);
  check(!bound.progress.sequence || confirmed, 'progress lacks original service confirmation');
  const latest = bound.progress.sequence ? await loadOperationEvent(pages, identity, confirmed!, bound.progress.sequence) : null;
  check(!latest || latest.source.attemptId === bound.progress.sourceAttemptId, 'terminal progress event source changed');
  const transfer = confirmed ? await loadTransfer(pages, identity, confirmed) : null;
  const afterTransfer = transfer && bound.progress.sequence > transfer.data.navigationSequence;
  const previous = transfer && !afterTransfer ? transfer.data.event : latest?.data.event ?? confirmed?.data.probe;
  const predecessor = transfer && (!afterTransfer || latest?.data.previous.kind === 'transfer')
    ? (!afterTransfer ? transfer.data.previous : transfer.data.event) : bound.progress.sequence > 1
    ? (await loadOperationEvent(pages, identity, confirmed!, bound.progress.sequence - 1, latest!.data.previous.reference)).data.event
    : confirmed?.data.probe;
  const kind = terminal.disposition === 'completed' ? 'decision' : terminal.disposition;
  check(kind === 'decision' || kind === 'blocked' || kind === 'cancelled', 'unsupported navigation terminal');
  const event: HostOperationEvent = snapshotJson({ hostId: bound.start.hostId,
    sessionId: identity.action.sessionId, sessionEpoch: previous?.nextSessionEpoch ?? previous?.sessionEpoch ?? identity.action.sessionEpoch, actionId: identity.action.actionId,
    operationId: bound.operation.id, sequence: (previous?.sequence ?? 0) + 1, eventId: terminal.terminal.source.attemptId,
    kind, observation: previous?.observation ?? bound.result.observation!,
    summary: kind === 'decision' ? identity.action.capabilityId === 'maze.explore'
      ? 'Selected frontier anchor reached. Further exploration requires an explicit decision; objective completion is not established.'
      : 'Destination reached. Objective completion requires a separate host proof.'
      : kind === 'blocked' ? `Navigation blocked: ${bound.progress.reason}.` : 'Navigation cancelled by the host.',
    usage: { steps: bound.progress.steps, replans: bound.progress.replans },
  });
  jsonBytes(event, MAX_EVENT_BYTES);
  return { identity, binding, bound, confirmed, terminal, event, transfer,
    // Bounded retained prefix only: a transfer or one unacknowledged progress event (plus initial probe).
    probe: confirmed?.data.probe ?? null, previous: transfer && !afterTransfer ? transfer.data.event : latest?.data.event ?? null, predecessor: predecessor ?? null };
}
export type AgenticaTerminal = NonNullable<Awaited<ReturnType<typeof loadAgenticaTerminalBase>>>;
