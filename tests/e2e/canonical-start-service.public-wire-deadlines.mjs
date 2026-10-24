import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from './canonical-start-service.planner-compare.mjs';

/** Audit witnesses only. These original service custody rows never enter actor context. */
export function assertOriginalDeadlines(raw, custody) {
  assert.ok(Array.isArray(custody) && custody.length > 0, 'Original service custody is required');
  const checked = [];
  for (const world of raw) {
    const start = world.sent.find(frame => frame.type === 'start.durable')?.payload.request;
    assert.ok(start && Number.isFinite(start.limits?.actionTimeoutSeconds), 'Missing original action allowance');
    const frames = world.received.filter(frame => ['action.request', 'action.pending'].includes(frame.type));
    assert.ok(frames.length > 0, 'No original actions to validate');
    for (const frame of frames) {
      const rows = custody.filter(row => row.hostId === start.hostId && row.sessionId === start.sessionId
        && row.request?.actionId === frame.payload.actionId);
      assert.equal(rows.length, 1, 'One exact original custody action');
      const row = rows[0], request = row.request;
      assert.equal(row.requestHash, 'sha256:' + createHash('sha256').update(canonical(request)).digest('hex'), 'Original request digest');
      assert.deepEqual(frame.payload, request, 'Dispatched action differs from original service custody');
      assert.equal(frame.runId, row.runId); assert.equal(request.runId, row.runId);
      assert.equal(row.sessionEpoch, request.sessionEpoch); assert.equal(row.objectiveId, start.objectiveId);
      const remaining = Date.parse(request.deadlineAt) - Date.parse(row.reservedAt);
      assert.ok(remaining > 0 && remaining <= start.limits.actionTimeoutSeconds * 1000,
        'Original deadline exceeds the granted action allowance or expired before reservation');
      checked.push({ actionId: request.actionId, runId: row.runId, deadlineAt: request.deadlineAt,
        reservedAt: row.reservedAt, actionTimeoutSeconds: start.limits.actionTimeoutSeconds, requestHash: row.requestHash });
    }
  }
  return checked;
}
