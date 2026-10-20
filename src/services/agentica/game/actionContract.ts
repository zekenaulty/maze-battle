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
  const durable = ['maze.navigate', 'maze.explore', 'maze.interact'].includes(action.capabilityId);
  check(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore', 'maze.interact'].includes(action.capabilityId)
    && cap.effect === (durable ? 'writesLocalState' : 'readOnly') && cap.kind === (durable ? 'action' : 'query')
    && (durable ? cap.durableHandoff === true : cap.durableHandoff !== true), 'capability execution contract changed');
  if (action.capabilityId === 'maze.explore' && action.arguments.mode === 'room') check(cap.inputSchema.fields
    .some(f => f.name === 'mode' && f.type === 'string' && f.allowedValues?.includes('room')), 'room exploration was not granted');
  if (action.capabilityId === 'maze.inspect' && ['quests', 'quest', 'objective'].includes(action.arguments.scope as string)) {
    const field = (name: string) => cap.inputSchema.fields.find(f => f.name === name && f.type === 'string');
    const permitted = (name: string) => {
      const f = field(name);
      return f && (f.allowedValues === undefined || f.allowedValues.includes(action.arguments[name] as string));
    };
    check(cap.inputSchema.fields.every(f => !f.required || Object.hasOwn(action.arguments, f.name)),
      'required quest query arguments were not granted');
    check(field('scope')?.allowedValues?.includes(action.arguments.scope as string), 'quest inspection was not granted');
    if (action.arguments.scope === 'quests') check(field('status')?.allowedValues?.includes(action.arguments.status as string)
      && (action.arguments.cursor === undefined || permitted('cursor')), 'quest status or paging was not granted');
    else if (action.arguments.scope === 'quest') check(permitted('target'), 'quest detail selection was not granted');
  }
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
