import assert from 'node:assert/strict';
import { comparePublicWire, comparePublicPayloads, assertPublicWireDisclosure } from './canonical-start-service.public-wire.mjs';

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
  const found = new Map();
  for (let start = 1; start < frames.length; start++) {
    if (frames[start - 1].type !== 'action.pending') continue;
    let end = start;
    while (end < frames.length && role(frames[end])) end++;
    const pending = frames[start - 1], next = frames[end], rows = frames.slice(start, end), roles = rows.map(role);
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

/** Explicit occurrence bijection inside complete acceptance blocks; raw arrays never change. */
export function receivedCorrespondence(left, right) {
  assert.equal(left.length, right.length, 'Incoming frame multiplicity changed');
  const mapping = left.map((_, i) => i), changes = [], a = blocks(left), b = blocks(right);
  for (const [start, block] of a) {
    const other = b.get(start);
    if (!other || block.end !== other.end || block.roles.some(key => !other.roles.includes(key))) continue;
    for (let i = start; i < block.end; i++) mapping[i] = start + other.roles.indexOf(block.roles[i - start]);
    if (mapping.slice(start, block.end).some((j, offset) => j !== start + offset)) changes.push({
      start, end: block.end, leftActionId: block.actionId, rightActionId: other.actionId,
      leftRoles: block.roles, rightRoles: other.roles,
      reason: 'Uncorrelated acceptance notices after one pending action and before its first observation event',
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

export function compareCausalPublicWire(roots, wire) {
  const strict = comparePublicWire(roots, wire);
  return { ...compareCausalPublicPayloads(strict.raw, strict.allowances), strictDifferences: strict.differences };
}
export const assertCausalPublicWireDisclosure = assertPublicWireDisclosure;
