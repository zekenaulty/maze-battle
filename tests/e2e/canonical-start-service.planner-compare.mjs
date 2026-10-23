import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const identities = new RegExp(`^(?:${uuid}|${uuid}:${uuid}|(?:run|labrun|action|receipt|observation|surface|frame)_[0-9a-f]{32}|(?:result|observation|travel|host_frame)[-_][0-9a-f]{64}|decision-${uuid}|agentica/publications/${uuid}|[0-9a-f]{64})$`);
const lowerFirst = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key[0].toLowerCase() + key.slice(1), item]));
// Matches ContextJson canonical ASCII JSON for this pinned offline corpus, including the default .NET encoder.
const quote = value => JSON.stringify(value).replace(/\\"/g, '\\u0022').replace(/[+<>&'`\u007f-\uffff]/g,
  char => '\\u' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
export const canonical = value => value === null || typeof value !== 'object' ? quote(value) : Array.isArray(value)
  ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => quote(key) + ':' + canonical(value[key])).join(',') + '}';
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');

// Only these concrete public metadata locations are eligible. Unknown fields are never discarded.
function annotate(raw) {
  const value = JSON.parse(raw), allowed = new Map();
  const get = path => path.split('/').filter(Boolean).reduce((v, key) => v?.[key], value);
  const mark = (path, kind = 'identity') => {
    const item = get(path);
    if (item === undefined || item === null) return;
    if (kind === 'identity' ? typeof item !== 'string' || !identities.test(item)
      : kind === 'clock' ? typeof item !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|\+00:00)$/.test(item) || !Number.isFinite(Date.parse(item))
        : !Number.isInteger(item) || item < 0 || item > 300000) throw Error('Invalid allowed metadata: ' + path);
    allowed.set(path, kind);
  };
  const fields = (base, keys, kind) => { for (const key of keys) mark(base + '/' + key, kind); };
  const refs = base => get(base)?.forEach((_, i) => mark(base + '/' + i + '/RefId'));
  const source = base => fields(base, ['id', 'witness']);
  const data = base => {
    const item = get(base); if (!item) return;
    if (item.scope === 'actor') source(base + '/source');
    if (item.scope === 'objective') mark(base + '/objectiveId');
    for (const collection of ['objects', 'frontiers']) item[collection]?.forEach((entry, i) => {
      const at = `${base}/${collection}/${i}`; source(at + '/source');
      if (collection === 'frontiers') token(at + '/frontier', entry, 'frontier');
    });
    if (item.scope === 'frontiers' && item.next !== undefined) token(base + '/next', item, 'next');
  };
  const token = (base, parent, key) => {
    const decoded = JSON.parse(parent[key]);
    if (decoded.schema !== 1 || !decoded.publication) throw Error('Unexpected token shape');
    parent[key] = decoded; // Comparison copy only; the immutable raw string remains in the capture.
    fields(base + '/publication', ['key', 'id']); source(base + '/selection/source');
  };
  const host = base => { fields(base, ['observationId']); mark(base + '/observedAt', 'clock'); data(base + '/data'); };
  const result = base => { fields(base, ['actionId', 'hostEvidenceId', 'observationId', 'evidenceId', 'sessionId']); host(base + '/observation'); };
  const observation = base => { mark(base + '/ObservationId'); refs(base + '/Evidence'); result(base + '/Data'); };
  const execution = base => get(base + '/CompletedSteps')?.forEach((_, i) => fields(`${base}/CompletedSteps/${i}`, ['ReceiptId', 'ObservationId']));
  fields('/request/Request/Context', ['sessionId', 'scopeId', 'objectiveId']); mark('/request/SessionContext/RunId');
  const continuation = '/request/Request/Context/continuation';
  fields(continuation, ['parentRunId']); result(continuation + '/admission');
  mark(continuation + '/admission/operation/operationId');
  fields(continuation + '/wake', ['actionId', 'eventId', 'operationId', 'sessionId']); host(continuation + '/wake/observation');
  observation('/refinementObservation');
  get('/request/Observations').forEach((_, i) => observation('/request/Observations/' + i));
  get('/request/Receipts').forEach((_, i) => {
    const base = '/request/Receipts/' + i; mark(base + '/ReceiptId'); mark(base + '/At', 'clock'); result(base + '/Data');
  });
  execution('/request/ExecutionContext'); execution('/request/ToolSurface/ExecutionContext');
  fields('/request/ToolSurface', ['SurfaceId']); mark('/request/ToolSurface/CreatedAt', 'clock');
  refs('/request/ToolSurface/ObservationRefs'); refs('/request/ToolSurface/ReceiptRefs');
  const policy = get('/request/ToolSurface/PolicySummary');
  if (policy.timeoutMs !== 300000 || Math.abs(policy.elapsedMs + policy.remainingTimeoutMs - policy.timeoutMs) > 1)
    throw Error('Changed timeout budget or invalid elapsed accounting');
  fields('/request/ToolSurface/PolicySummary', ['elapsedMs', 'remainingTimeoutMs'], 'elapsed');
  get('/request/ContextFrames').forEach((frame, i) => {
    const base = '/request/ContextFrames/' + i;
    if (frame.Kind === 'agentica.host_context') {
      // Digests may differ only after checking their complete source, never as unchecked arbitrary hex.
      const current = frame.Payload.currentObservation, ref = current.Reference;
      const original = { observationId: ref.ObservationId, revision: ref.Revision, observedAt: ref.ObservedAt, data: current.Data, facts: null };
      if (hash(original) !== ref.ContentHash) throw Error('Host observation digest mismatch');
      const payload = { ...frame.Payload, identity: lowerFirst(frame.Payload.identity), retention: lowerFirst(frame.Payload.retention),
        currentObservation: { reference: lowerFirst(ref), data: current.Data } };
      if (frame.FrameId !== 'host_frame_' + hash(payload)) throw Error('Host frame digest mismatch');
      if (!isDeepStrictEqual(frame.CompactPayload?.currentObservation?.Reference, ref))
        throw Error('Compact host observation reference mismatch');
      for (const section of ['Payload', 'CompactPayload']) {
        const path = base + '/' + section;
        fields(path + '/identity', ['ScopeId', 'SessionId']);
        fields(path + '/currentObservation/Reference', ['ObservationId', 'ContentHash']);
        mark(path + '/currentObservation/Reference/ObservedAt', 'clock'); data(path + '/currentObservation/Data');
      }
    } else if (frame.Kind === 'agentica.goal_spine') {
      mark(base + '/Payload/goalSpine/UpdatedAt', 'clock'); refs(base + '/Payload/goalSpine/EvidenceRefs');
      const spine = frame.Payload.goalSpine, receipt = /^Receipt (receipt_[0-9a-f]{32}) (.*)$/.exec(spine.LatestRealityUpdate ?? '');
      if (receipt) {
        if (!get('/request/Receipts').some(item => item.ReceiptId === receipt[1])) throw Error('Unbound receipt prose');
        spine.LatestRealityUpdate = { prefix: 'Receipt ', receiptId: receipt[1], rest: receipt[2] };
        mark(base + '/Payload/goalSpine/LatestRealityUpdate/receiptId');
      }
    }
    fields(base, ['FrameId', 'ToolSurfaceId']); mark(base + '/CreatedAt', 'clock'); refs(base + '/EvidenceRefs');
  });
  return { value, allowed };
}

/** Stateful across both windows so cross-call identity aliasing/reuse cannot disappear in normalization. */
export function plannerPair() {
  const forward = new Map(), reverse = new Map(), allowances = [];
  return { allowances, compare(leftRaw, rightRaw) {
    const left = annotate(leftRaw), right = annotate(rightRaw), differences = [];
    const visit = (a, b, path) => {
      const kind = left.allowed.get(path);
      if (kind && kind === right.allowed.get(path)) {
        if (kind === 'identity') {
          if ((forward.has(a) && forward.get(a) !== b) || (reverse.has(b) && reverse.get(b) !== a))
            throw Error('Identity alias mismatch: ' + path);
          forward.set(a, b); reverse.set(b, a);
        }
        if (a !== b) allowances.push({ path, kind, left: a, right: b });
        return;
      }
      if (a === b) return;
      if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) differences.push({ path: path + '/' + key, left: a[key], right: b[key] });
          else visit(a[key], b[key], path + '/' + key);
        }
      } else differences.push({ path, left: a, right: b });
    };
    visit(left.value, right.value, ''); return differences;
  } };
}
