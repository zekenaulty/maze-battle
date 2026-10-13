import { readCanonical } from '../read';
import { executeCanonical, operateCanonical } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check, request as validateRequest } from '../validation';
import { retainLaunchAdmission } from './launch.admission';
import { loadActiveLaunch, loadLaunch } from './launch.read';
import { retainLaunchTransition } from './launch.transitions';

export { createLaunchBinding, launchGuardId, launchSessionId } from './launch.validation';
export { assertLaunchGrant } from './launch.grant';
export { loadLaunch, loadActiveLaunch } from './launch.read';
export { retainLaunchAdmission } from './launch.admission';
export { retainLaunchTransition } from './launch.transitions';
export type { LaunchBinding, LaunchStarted, LaunchState, LaunchGrant, LaunchGrantContext } from './launch.types';

/** Queue one exact request. A fresh dispatch commit retains the caller's first start attempt; check stop/custody before sending.
 * A replay is reconciliation, never permission to repeat SDK start. Cancel/ACK use operateCanonical directly after host verification.
 * dispatch: { launchId }; announce: { launchId, dispatch, started }; grant: { launchId, run, publication }.
 */
export function executeLaunchCommand(input: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  const request = validateRequest(input);
  if (request.operation === 'operation.admit') return operateCanonical(request, 'admit', tx => retainLaunchAdmission(tx, request), options);
  check(['agentica.launch.dispatch', 'agentica.launch.announce', 'agentica.launch.grant'].includes(request.operation), 'invalid launch command');
  return executeCanonical(request, tx => retainLaunchTransition(tx, request), options);
}
/** Read/reconcile only. Neither a retained announcement nor a read authorizes execution. */
export async function readLaunch(id?: string) {
  const result = await readCanonical(async pages => {
    const active = id === undefined ? await loadActiveLaunch(pages) : null;
    if (id === undefined && !active) return null;
    const launch = await loadLaunch(pages, id ?? active!.id);
    check(!active || launch.guard.admissionAttemptId === active.sourceAttemptId, 'active launch admission changed'); return launch;
  });
  check(id !== undefined || result.value || !Object.keys(result.head.allocations).some(key => key.startsWith('agentica-launch:')), 'missing active funded launch');
  return result;
}
