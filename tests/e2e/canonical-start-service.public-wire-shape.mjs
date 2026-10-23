import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from './canonical-start-service.planner-compare.mjs';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const identity = new RegExp(`^(?:${uuid}|${uuid}:${uuid}|(?:run|labrun|action|receipt|observation|surface|frame|event|report)_[0-9a-f]{32}|(?:result|observation|travel|host_frame)[-_][0-9a-f]{64}|(?:decision|custody|event)-${uuid}|agentica/publications/${uuid}|request-[0-9]+-[0-9]+|sha256:[0-9a-f]{64}|[0-9a-f]{64})$`);

/** Concrete metadata paths only. Unrecognized fields remain in the comparison. */
export function publicWireShape(input) {
  const value = structuredClone(input), allowed = new Map();
  const get = path => path.split('/').filter(Boolean).reduce((v, k) => v?.[k], value);
  const mark = (path, kind = 'identity') => {
    const item = get(path); if (item === null || item === undefined) return;
    assert.ok(kind === 'identity' ? typeof item === 'string' && identity.test(item)
      : kind === 'clock' ? typeof item === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|\+00:00)$/.test(item) && Number.isFinite(Date.parse(item))
        : Number.isFinite(item) && item >= 0 && item <= 300000, 'Invalid metadata at ' + path);
    allowed.set(path, kind);
  };
  const fields = (p, keys, kind) => keys.forEach(k => mark(p + '/' + k, kind));
  const source = p => fields(p, ['id', 'witness']);
  const token = (p, parent, key) => {
    const decoded = JSON.parse(parent[key]); assert.equal(decoded.schema, 1); assert.ok(decoded.publication);
    parent[key] = decoded; fields(p + '/publication', ['key', 'id']); source(p + '/selection/source');
  };
  const data = p => {
    const d = get(p); if (!d) return;
    if (d.scope === 'actor') source(p + '/source');
    if (d.scope === 'objective') mark(p + '/objectiveId');
    for (const key of ['objects', 'frontiers']) d[key]?.forEach((row, i) => {
      source(`${p}/${key}/${i}/source`);
      if (key === 'frontiers') token(`${p}/${key}/${i}/frontier`, row, 'frontier');
    });
    if (d.scope === 'frontiers' && d.next !== undefined) token(p + '/next', d, 'next');
  };
  const observation = p => { mark(p + '/observationId'); mark(p + '/observedAt', 'clock'); data(p + '/data'); };
  const result = p => { fields(p, ['actionId', 'sessionId', 'evidenceId']); observation(p + '/observation'); mark(p + '/operation/operationId'); };
  const event = p => { fields(p, ['sessionId', 'actionId', 'operationId', 'eventId']); observation(p + '/observation'); };
  const continuation = p => fields(p, ['parentRunId', 'admissionActionId', 'operationId', 'wakeEventId']);
  const request = p => { fields(p, ['sessionId', 'scopeId', 'objectiveId']); observation(p + '/observation'); };
  const action = p => {
    fields(p, ['actionId', 'runId', 'runnerRunId', 'sessionId']); mark(p + '/deadlineAt', 'clock');
    if (get(p + '/arguments/frontier')) token(p + '/arguments/frontier', get(p + '/arguments'), 'frontier');
  };
  const entry = p => {
    request(p + '/request'); action(p + '/action'); result(p + '/admission'); event(p + '/latestEvent');
    mark(p + '/wakeRunId'); fields(p, ['createdAt', 'updatedAt'], 'clock');
  };
  const execution = p => {
    fields(p, ['eventId']); mark(p + '/at', 'clock');
    fields(p + '/context', ['runId', 'receiptId', 'observationId', 'toolSurfaceId']);
    fields(p + '/data', ['run', 'toolSurface', 'observation', 'receipt', 'report']);
    fields(p + '/payload', ['toolSurfaceId', 'observationId', 'reportId']);
    get(p + '/payload/contextFrameIds')?.forEach((_, i) => mark(`${p}/payload/contextFrameIds/${i}`));
    get(p + '/evidenceRefs')?.forEach((_, i) => mark(`${p}/evidenceRefs/${i}/refId`));
    if (get(p + '/type') === 'receipt.emitted') mark(p + '/payload/durationMs', 'elapsed');
  };
  const frame = p => {
    fields(p, ['runId', 'requestId']); const f = get(p), body = p + '/payload';
    if (f.type === 'start.durable') { mark(body + '/attemptId'); request(body + '/request'); }
    if (f.type === 'action.result') result(body);
    if (f.type === 'operation.wake') event(body);
    if (f.type === 'started' || f.type === 'resumed') {
      fields(body, ['runId', 'sessionId', 'objectiveId', 'scopeId']); continuation(body + '/continuation');
      fields(body, ['createdAt', 'updatedAt'], 'clock');
      const admission = get(body + '/startAdmission');
      if (admission) {
        for (const key of ['originalRequest', 'acceptedRequest']) {
          assert.equal(admission[key + 'Hash'], 'sha256:' + createHash('sha256').update(canonical(admission[key])).digest('hex'), 'Start digest');
          mark(body + '/startAdmission/' + key + 'Hash'); request(body + '/startAdmission/' + key);
        }
        fields(body + '/startAdmission', ['attemptId', 'runId']); mark(body + '/startAdmission/admittedAt', 'clock');
      }
    }
    if (f.type === 'action.request' || f.type === 'action.pending') action(body);
    if (f.type === 'action.accepted') fields(body, ['actionId', 'evidenceId']);
    if (f.type === 'execution.event') execution(body);
    if (f.type === 'operation.parked') entry(body);
    if (f.type === 'outcome') {
      mark(body + '/outcome/runId');
      assert.equal(f.payload.snapshotUrl, '/api/runs/' + f.runId, 'Bound outcome URL');
      f.payload.snapshotUrl = f.runId; mark(body + '/snapshotUrl');
    }
  };
  value.sent.forEach((_, i) => frame('/sent/' + i));
  value.received.forEach((_, i) => frame('/received/' + i));
  value.progress.forEach((_, i) => { event(`/progress/${i}/request`); entry(`/progress/${i}/response`); });
  return { value, allowed };
}
