import assert from 'node:assert/strict';
import { comparePublicWire, comparePublicPayloads, assertPublicWireDisclosure } from './canonical-start-service.public-wire.mjs';
import { assertOriginalDeadlines } from './canonical-start-service.public-wire-deadlines.mjs';

const fields = (value, keys) => value && Object.keys(value).sort().join(',') === keys;
function role(frame) {
  if (frame.requestId !== null) return null;
  if (frame.type === 'status' && fields(frame.payload, 'status') && frame.payload.status === 'running') return 'running';
  if (frame.type !== 'action.accepted') return null;
  if (fields(frame.payload, 'actionId,duplicate') && typeof frame.payload.duplicate === 'boolean') return 'direct';
  if (fields(frame.payload, 'actionId,afterRevision,disposition,evidenceId')
    && Number.isSafeInteger(frame.payload.afterRevision) && frame.payload.afterRevision >= 0
    && typeof frame.payload.disposition === 'string' && typeof frame.payload.evidenceId === 'string') return 'evidence';
  return null;
}

function blocks(frames) {
  const found = new Map(), dispatches = dispatchBlocks(frames);
  for (let start = 1; start < frames.length; start++) {
    const dispatch = [...dispatches.values()].find(block => block.end === start);
    const pending = frames[start - 1].type === 'action.pending' ? frames[start - 1]
      : dispatch && frames.slice(dispatch.start, dispatch.end).find(frame => frame.type === 'action.pending');
    if (!pending) continue;
    let end = start;
    while (end < frames.length && role(frames[end])) end++;
    const next = frames[end], rows = frames.slice(start, end), roles = rows.map(role);
    if (pending.requestId !== null || typeof pending.payload?.actionId !== 'string'
      || typeof pending.payload?.stepId !== 'string' || pending.payload.runId !== pending.runId
      || ![2, 3].includes(rows.length) || new Set(roles).size !== rows.length
      || !roles.includes('direct') || !roles.includes('evidence')
      || next?.type !== 'execution.event' || next.payload?.type !== 'observation.made'
      || next.runId !== pending.runId || next.payload.context?.stepId !== pending.payload.stepId
      || rows.some(row => row.runId !== pending.runId || row.protocolVersion !== pending.protocolVersion
        || row.type === 'action.accepted' && row.payload.actionId !== pending.payload.actionId)) continue;
    found.set(start, { start, end, roles, actionId: pending.payload.actionId, stepId: pending.payload.stepId });
  }
  return found;
}

function acknowledgements(raw) {
  raw.received.forEach((frame, index) => {
    if (frame.type !== 'action.accepted') return;
    const kind = role(frame);
    assert.ok(kind === 'direct' || kind === 'evidence', 'Unsupported or correlated acceptance notice');
    const originals = raw.sent.filter(row => row.type === 'action.result' && row.payload.actionId === frame.payload.actionId);
    assert.equal(originals.length, 1, 'Acceptance must bind one original result occurrence');
    const original = originals[0];
    assert.equal(frame.runId, original.runId, 'Acceptance run changed');
    const pending = raw.received.slice(0, index).filter(row => row.type === 'action.pending'
      && row.runId === frame.runId && row.payload.actionId === frame.payload.actionId);
    assert.equal(pending.length, 1, 'Acceptance must follow its original pending notice');
    if (kind === 'direct') assert.equal(frame.payload.duplicate, false, 'Fresh prefix acceptance cannot invent a duplicate');
    else for (const key of ['actionId', 'disposition', 'evidenceId', 'afterRevision'])
      assert.equal(frame.payload[key], original.payload[key], `Acceptance original ${key} changed`);
  });
}

function dispatchBlocks(frames) {
  const found = new Map();
  const role = frame => frame?.requestId !== null ? null : frame.type === 'action.request' ? 'request'
    : frame.type === 'action.pending' ? 'pending'
      : frame.type === 'status' && fields(frame.payload, 'status') && frame.payload.status === 'awaiting_host' ? 'waiting' : null;
  for (let start = 1; start + 3 < frames.length; start++) {
    const step = frames[start - 1], rows = frames.slice(start, start + 3), roles = rows.map(role);
    if (step.type !== 'execution.event' || step.payload?.type !== 'step.started'
      || new Set(roles).size !== 3 || roles.includes(null) || roles.indexOf('waiting') > roles.indexOf('pending')) continue;
    const request = rows[roles.indexOf('request')], pending = rows[roles.indexOf('pending')], next = frames[start + 3];
    if (rows.some(row => row.runId !== step.runId || row.protocolVersion !== step.protocolVersion)
      || request.payload.stepId !== step.payload.context?.stepId || !roleAfter(next, request)) continue;
    assert.deepEqual(request.payload, pending.payload, 'Dispatch and pending original changed');
    found.set(start, { start, end: start + 3, roles, actionId: request.payload.actionId });
  }
  return found;
}
function roleAfter(frame, request) {
  return frame?.runId === request.runId && (role(frame) === 'running'
    || ['direct', 'evidence'].includes(role(frame)) && frame.payload.actionId === request.payload.actionId);
}

/** Explicit occurrence bijection inside complete acceptance blocks; raw arrays never change. */
export function receivedCorrespondence(left, right) {
  assert.equal(left.length, right.length, 'Incoming frame multiplicity changed');
  const mapping = left.map((_, i) => i), changes = [];
  for (const [kind, find] of [['acceptance', blocks], ['dispatch', dispatchBlocks]]) for (const [start, block] of find(left)) {
    const other = find(right).get(start);
    if (!other || block.end !== other.end || block.roles.some(key => !other.roles.includes(key))) continue;
    for (let i = start; i < block.end; i++) mapping[i] = start + other.roles.indexOf(block.roles[i - start]);
    if (mapping.slice(start, block.end).some((j, offset) => j !== start + offset)) changes.push({
      start, end: block.end, leftActionId: block.actionId, rightActionId: other.actionId,
      leftRoles: block.roles, rightRoles: other.roles,
      kind, reason: kind === 'acceptance' ? 'Uncorrelated acceptance notices between original pending and observation'
        : 'Direct request interleaves with FIFO waiting/pending notices between its step event and acceptance',
    });
  }
  assert.equal(new Set(mapping).size, left.length, 'Incoming correspondence must preserve every occurrence');
  return { mapping, blocks: changes };
}

export function compareCausalPublicPayloads(raw, seededAllowances = []) {
  assert.equal(raw.length, 2);
  raw.forEach(acknowledgements);
  const before = structuredClone(raw), correspondence = receivedCorrespondence(raw[0].received, raw[1].received);
  const alignedRight = { ...raw[1], received: correspondence.mapping.map(index => raw[1].received[index]) };
  const comparison = comparePublicPayloads([raw[0], alignedRight], seededAllowances);
  const rightPath = path => path.replace(/^\/received\/(\d+)(?=\/|$)/, (_, index) => `/received/${correspondence.mapping[Number(index)]}`);
  assert.deepEqual(raw, before, 'Original evidence changed');
  return { ...comparison, raw, correspondence,
    differences: comparison.differences.map(row => ({ ...row, rightPath: rightPath(row.path) })),
    allowances: comparison.allowances.map(row => ({ ...row, rightPath: rightPath(row.path) })) };
}

export function compareCausalPublicWire(roots, wire, custody) {
  const strict = comparePublicWire(roots, wire);
  const deadlineProof = assertOriginalDeadlines(strict.raw, custody);
  return { ...compareCausalPublicPayloads(strict.raw, strict.allowances), strictDifferences: strict.differences, deadlineProof };
}
export const assertCausalPublicWireDisclosure = assertPublicWireDisclosure;
