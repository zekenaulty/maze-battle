import type { AgenticaAction, AgenticaCapability, AgenticaResult } from '../contracts';
import { fields } from '../../../persistence/canonical/roster/codec';
import { check, integer } from '../../../persistence/canonical/validation';
import { equal, snapshotJson, wireId } from '../../../persistence/canonical/agentica/validation';
import { equivalentOperationWire } from '../../../persistence/canonical/agentica/operation.wire';

const digest = (value: unknown) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);

function unresolved(input: unknown, action: AgenticaAction) {
  const row = fields(input, 'actionId sessionId sessionEpoch disposition beforeRevision afterRevision evidenceId summary',
    'observation completion operation');
  if (row.disposition !== 'unresolved') return false;
  wireId(row.evidenceId);
  check(row.actionId === action.actionId && row.sessionId === action.sessionId && row.sessionEpoch === action.sessionEpoch
    && integer(row.beforeRevision) && integer(row.afterRevision) && row.afterRevision >= row.beforeRevision
    && typeof row.summary === 'string' && row.summary.length <= 4000 && row.summary.trim().length > 0
    && row.operation == null && row.completion == null, 'invalid interim recovery result');
  // Interim sight is not imported or used as authority. The new result contains only the local Stop proof.
  if (row.observation != null) {
    const observed = fields(row.observation, 'observationId revision observedAt data', 'facts');
    wireId(observed.observationId);
    check(observed.revision === row.afterRevision && typeof observed.observedAt === 'string'
      && Number.isFinite(Date.parse(observed.observedAt)) && observed.data !== null && typeof observed.data === 'object'
      && !Array.isArray(observed.data), 'invalid interim recovery observation');
  }
  return true;
}

export function pendingRecoveryUrl(endpoint: string, sessionId?: string, actionId?: string) {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = actionId ? '/api/recovery/action' : '/api/recovery'; url.search = ''; url.hash = '';
  if (actionId) {
    url.searchParams.set('hostId', 'maze-battle'); url.searchParams.set('sessionId', sessionId!);
    url.searchParams.set('actionId', actionId);
  }
  return url.href;
}

function capability(input: unknown) {
  const value = fields(snapshotJson(input, 16 * 1024), 'id name description kind effect inputSchema', 'durableHandoff');
  if (value.durableHandoff === false) delete value.durableHandoff;
  const schema = fields(value.inputSchema, 'fields allowAdditionalProperties');
  check(Array.isArray(schema.fields) && schema.fields.length <= 6, 'invalid recovery capability fields');
  for (const field of schema.fields) {
    const f = fields(field, 'name type required', 'description allowedValues example minimum maximum');
    for (const key of ['description', 'allowedValues', 'example', 'minimum', 'maximum']) if (f[key] === null) delete f[key];
  }
  return value;
}

/** Remote custody authenticates the unsaved original; it never supplies game-state observations. */
export function pendingRecoveryEntry(input: unknown, action: AgenticaAction, objectiveId: string,
  expectedCapability: AgenticaCapability, result: AgenticaResult, requirePinned = false) {
  const row = fields(snapshotJson(input, 64 * 1024),
    'hostId sessionId sessionEpoch runId objectiveId request capability requestHash capabilityHash reservedAt updatedAt',
    'result resultHash recoveryRetention');
  check(row.hostId === 'maze-battle' && row.sessionId === action.sessionId && row.sessionEpoch === action.sessionEpoch
    && row.runId === action.runId && row.objectiveId === objectiveId && equal(row.request, action)
    && equal(capability(row.capability), capability(expectedCapability))
    && digest(row.requestHash) && digest(row.capabilityHash), 'recovery original request or binding changed');
  check([undefined, 'reserved', 'http'].includes(row.recoveryRetention as string | undefined), 'invalid recovery retention');
  const retained = row.result;
  if (retained != null) {
    const interim = !requirePinned && unresolved(retained, action);
    check(digest(row.resultHash) && (interim || equivalentOperationWire(retained, result, 'result')),
      'recovery result differs from proven no-effect result');
    check(!interim || row.recoveryRetention !== 'http', 'interim recovery result cannot have a terminal pin');
  } else check(row.resultHash == null, 'recovery result hash has no result');
  check(!requirePinned || retained != null && row.recoveryRetention === 'http', 'service did not retain the exact HTTP recovery result');
  return { requestHash: row.requestHash, capabilityHash: row.capabilityHash };
}

export async function recoveryResponse(response: Response): Promise<unknown> {
  const raw: unknown = await response.json();
  if (!response.ok) {
    const error = fields(raw, 'code message');
    check(typeof error.code === 'string' && typeof error.message === 'string', 'invalid recovery refusal');
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  return raw;
}
