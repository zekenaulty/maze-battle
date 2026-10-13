import { readCanonical } from '../read';
import { check } from '../validation';
import { equal } from './validation';
import { loadLaunch } from './launch.read';
import type { LaunchRead } from './launch.types';

/** Deterministic local Stop proof, not a service acknowledgement or remote cancellation claim. */
export async function loadLaunchTerminal(pages: LaunchRead, id: string) {
  const launch = await loadLaunch(pages, id), guard = launch.guard;
  check(guard.terminal?.disposition === 'cancelled', 'launch has no cancellation receipt');
  const terminal = await pages.sourceReceipt(guard.terminal.attemptId);
  check(terminal.source.operation === 'operation.cancel'
    && equal(terminal.receipt.result, { operationId: guard.id, phase: 'cancel' }), 'launch cancellation source changed');
  const latest = launch.grant ?? launch.run ?? launch.dispatch ?? launch.state;
  check(latest.row.revision <= terminal.receipt.beforeRevision || latest === launch.run, 'launch work is newer than cancellation');
  // Announcement may reconcile an already-dispatched start after cancellation; the original stop proof stays unchanged.
  return { schema: 1 as const, launchId: id, guardId: guard.id, start: launch.binding.start, endpoint: launch.binding.endpoint,
    admissionAttemptId: guard.admissionAttemptId, terminal };
}
export const readLaunchTerminal = (id: string) => readCanonical(pages => loadLaunchTerminal(pages, id));
