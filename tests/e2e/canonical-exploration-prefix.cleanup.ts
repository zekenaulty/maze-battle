import { readDestination, executeNavigationCommand } from '../../src/persistence/canonical/navigation/commands';
import { operateCanonical } from '../../src/persistence/canonical/transaction';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import { worldRequest as command } from './canonical-world-fixture';
import { dump, refusal } from './canonical-frontier.support';

export async function cleanupBudgetFailure(id: string, admissionRequest: CanonicalRequest) {
  const before = await readDestination(id), original = await dump();
  const request = command(before.head, 'navigation.advance', { operationId: id, sequence: before.value.progress.sequence });
  const refused = await refusal(() => executeNavigationCommand(request));
  const repeatedRefusal = await refusal(() => executeNavigationCommand(request));
  const admissionReplay = await executeNavigationCommand(admissionRequest), unchanged = original === await dump();
  const cancelRequest = command(before.head, 'operation.cancel', { operationId: id });
  const cancelled = await operateCanonical(cancelRequest, 'cancel'), terminal = await readDestination(id);
  const ackRequest = command(terminal.head, 'operation.acknowledge', { operationId: id, terminalAttemptId: cancelRequest.attemptId });
  const acknowledged = await operateCanonical(ackRequest, 'acknowledge'), afterAck = await dump();
  const cancelReplay = await operateCanonical(cancelRequest, 'cancel'), ackReplay = await operateCanonical(ackRequest, 'acknowledge');
  return { before, refused, repeatedRefusal, admissionReplay, unchanged, cancelled, acknowledged,
    cancelReplay, ackReplay, unchangedAfterReplay: afterAck === await dump(), final: await readDestination(id) };
}
