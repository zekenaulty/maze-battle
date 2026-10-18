import type { AgenticaAction, AgenticaActionRecord, AgenticaObservation, AgenticaResult } from '../contracts';
import { actionFingerprint, actionKey } from '../sdk/agentica-host.mjs';
import { assertLaunchGrant } from '../../../persistence/canonical/agentica/launch';
import type { LaunchGrantContext } from '../../../persistence/canonical/agentica/launch.types';
import type { PreparedAction, ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { snapshotJson, snapshotReference, validateAction } from '../../../persistence/canonical/agentica/validation';
import { fields } from '../../../persistence/canonical/roster/codec';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { check } from '../../../persistence/canonical/validation';

export interface ActionBinding { grant: ProtocolRef; publication: ProtocolRef }
export const captureBinding = (b: ActionBinding): ActionBinding => ({ grant: snapshotReference(b.grant), publication: snapshotReference(b.publication) });
export function sdkRecord(key: string, value: AgenticaActionRecord) {
  const copy = snapshotJson(value, 12 * 1024), row = fields(copy, 'fingerprint status', 'result');
  check(typeof row.fingerprint === 'string' && row.fingerprint.length <= 4096, 'invalid SDK fingerprint');
  const action = validateAction(JSON.parse(row.fingerprint));
  check(actionKey(action) === key && actionFingerprint(action) === row.fingerprint, 'SDK original identity changed');
  check(row.status === 'pending' && !Object.hasOwn(row, 'result') || row.status === 'completed' && Object.hasOwn(row, 'result'), 'invalid SDK record');
  return { record: copy, action };
}
export function pinDeadline(request: CanonicalRequest, action: AgenticaAction): CanonicalRequest {
  return { ...request, deadlineAt: Math.min(request.deadlineAt ?? Infinity, Date.parse(action.deadlineAt)) };
}
export async function actionGrant(tx: LaunchGrantContext, binding: ActionBinding, action: AgenticaAction) {
  const grant = await assertLaunchGrant(tx, binding.grant, action, binding.publication), cap = grant.capability;
  const navigation = action.capabilityId === 'maze.navigate' || action.capabilityId === 'maze.explore';
  check(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore'].includes(action.capabilityId)
    && cap.effect === (navigation ? 'writesLocalState' : 'readOnly') && cap.kind === (navigation ? 'action' : 'query')
    && (navigation ? cap.durableHandoff === true : cap.durableHandoff !== true), 'capability execution contract changed');
  return grant;
}
export function actionResult(identity: PreparedAction, observation: AgenticaObservation, summary: string,
  disposition: 'applied' | 'refused' = 'applied'): AgenticaResult {
  const a = identity.action;
  return { actionId: a.actionId, sessionId: a.sessionId, sessionEpoch: a.sessionEpoch, disposition,
    beforeRevision: a.expectedRevision, afterRevision: observation.revision,
    evidenceId: `result-${identity.storageKey.slice(-64)}`, summary,
    // A publication can yield different scoped views. Each retained action owns its exact observation.
    observation: { ...structuredClone(observation), observationId: `observation-${identity.storageKey.slice(-64)}` } };
}
export function unresolved(action: AgenticaAction): AgenticaResult {
  return { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, disposition: 'unresolved',
    beforeRevision: action.expectedRevision, afterRevision: action.expectedRevision, evidenceId: action.actionId,
    summary: 'No retained completion. Reconcile the original action; do not repeat its effect.' };
}
