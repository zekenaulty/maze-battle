import type { AgenticaAction, AgenticaResult } from '../../../services/agentica/contracts';
import { fields } from '../roster/codec';
import { check, integer, jsonBytes } from '../validation';
import { MAX_RESULT_BYTES } from './types';
import { wireId } from './validation';

/** Wire structure only; callers still own capability grants and domain completion proof. */
export function validateResult(value: unknown, action: AgenticaAction, effect: 'readOnly' | 'writesLocalState'): AgenticaResult {
  jsonBytes(value, MAX_RESULT_BYTES);
  wireDepth(value);
  const r = fields(value, 'actionId sessionId sessionEpoch disposition beforeRevision afterRevision evidenceId summary', 'observation operation completion');
  check(r.actionId === action.actionId && r.sessionId === action.sessionId && r.sessionEpoch === action.sessionEpoch, 'result action identity changed');
  check(['applied', 'refused', 'conflict', 'unavailable'].includes(r.disposition as string), 'unresolved action is not a completed result');
  check(integer(r.beforeRevision) && integer(r.afterRevision) && (r.afterRevision as number) >= (r.beforeRevision as number), 'invalid result revision');
  if (r.disposition === 'applied' || r.disposition === 'refused') check(r.beforeRevision === action.expectedRevision, 'result original revision changed');
  if (effect === 'readOnly' || r.disposition !== 'applied') check(r.beforeRevision === r.afterRevision, 'non-effect result changed revision');
  wireId(r.evidenceId); summary(r.summary);
  if (r.disposition !== 'unavailable') check(r.observation !== undefined, 'resolved action requires observation');
  if (r.observation !== undefined) {
    const o = fields(r.observation, 'observationId revision observedAt data', 'facts'); wireId(o.observationId);
    check(o.revision === r.afterRevision && typeof o.observedAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/.test(o.observedAt)
      && Number.isFinite(Date.parse(o.observedAt)) && Date.parse(o.observedAt) !== -62135596800000, 'invalid result observation');
    check(o.data !== null && typeof o.data === 'object' && !Array.isArray(o.data), 'invalid observation data');
    if (o.facts !== undefined) {
      check(Array.isArray(o.facts) && o.facts.length <= 64, 'unbounded observation facts');
      const keys = new Set();
      for (const fact of o.facts) {
        const f = fields(fact, 'key summary value', 'state evidenceObservationIds supersedes');
        text(f.key, 256); text(f.summary, 1024); check(!keys.has(f.key), 'duplicate observation fact'); keys.add(f.key);
        check(f.state === undefined || ['observed', 'inferred', 'supported', 'refuted', 'stale'].includes(f.state as string), 'invalid fact state');
        if (f.evidenceObservationIds !== undefined) check(Array.isArray(f.evidenceObservationIds) && f.evidenceObservationIds.length <= 8
          && f.evidenceObservationIds.every(id => typeof id === 'string'), 'invalid fact evidence');
        check(f.supersedes === undefined || typeof f.supersedes === 'string', 'invalid fact supersession');
      }
    }
  }
  if (r.operation !== undefined) {
    const o = fields(r.operation, 'operationId summary', 'usage'); wireId(o.operationId); summary(o.summary);
    check(effect === 'writesLocalState' && r.disposition === 'applied' && r.observation !== undefined && r.completion === undefined, 'invalid durable admission result');
    if (o.usage !== undefined) check(o.usage !== null && typeof o.usage === 'object' && !Array.isArray(o.usage), 'invalid operation usage');
  }
  if (r.completion !== undefined) {
    const c = fields(r.completion, 'objectiveId evidenceId summary'); wireId(c.objectiveId); wireId(c.evidenceId); summary(c.summary);
    check(r.disposition === 'applied' && r.observation !== undefined, 'invalid completion result');
  }
  return structuredClone(value) as AgenticaResult;
}
function text(value: unknown, max: number): asserts value is string {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value), 'invalid result text');
}
const summary = (value: unknown) => text(value, 4000);
function wireDepth(value: unknown, depth = 1) {
  if (!value || typeof value !== 'object') return;
  check(depth <= 31, 'result exceeds SDK nesting bound');
  for (const child of Object.values(value)) wireDepth(child, depth + 1);
}
