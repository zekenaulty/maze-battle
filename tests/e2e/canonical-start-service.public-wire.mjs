import assert from 'node:assert/strict';
import { plannerPair } from './canonical-start-service.planner-compare.mjs';
import { assertPlannerWindows } from './canonical-start-service.planner-wire.mjs';
import { publicWireShape } from './canonical-start-service.public-wire-shape.mjs';

const one = (rows, label) => { assert.equal(rows.length, 1, label); return rows[0]; };
const workFields = new Set(['reads', 'writes', 'readbytes', 'writebytes', 'usedbytes', 'reservedbytes', 'workstats']);
function noWork(value, path = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!workFields.has(key.toLowerCase()), 'Unexpected storage work disclosure at ' + path + '/' + key);
    noWork(item, path + '/' + key);
  }
}

function prefix(root, wire) {
  const id = root.entries[0].root, final = root.actions[6], firstOperation = root.actions[3];
  assert.equal(final.capabilityId, 'maze.inspect'); assert.deepEqual(final.arguments, { scope: 'frontiers' });
  assertPlannerWindows(id, root.entries, wire.sent, wire.received.map(r => r.frame));
  const start = wire.sent.findIndex(f => f.type === 'start.durable' && f.payload.request.sessionId === id);
  const end = wire.sent.findIndex(f => f.type === 'action.result' && f.payload.actionId === final.actionId);
  assert.ok(start >= 0 && end > start);
  const sent = wire.sent.slice(start, end + 1);
  assert.equal(sent.length, 9, 'One start, seven results and one explicit wake');
  const wake = one(sent.filter(f => f.type === 'operation.wake'), 'Single wake').payload;
  const frames = wire.received.map(r => r.frame), first = frames.findIndex(f => f.type === 'started' && f.payload.sessionId === id);
  const last = frames.findIndex(f => f.type === 'action.accepted' && f.payload.actionId === final.actionId);
  assert.ok(first >= 0 && last > first);
  const received = frames.slice(first, last + 1);
  for (const entry of root.entries.slice(0, 7)) {
    const current = JSON.parse(entry.raw).request.ContextFrames.find(f => f.Kind === 'agentica.host_context').Payload.currentObservation;
    const delivered = one(sent.flatMap(f => f.type === 'start.durable' ? [f.payload.request.observation]
      : [f.payload.observation]).filter(o => o?.observationId === current.Reference.ObservationId), 'Captured observation on wire');
    assert.deepEqual(current.Data, delivered.data); assert.equal(current.Reference.Revision, delivered.revision);
    assert.equal(Date.parse(current.Reference.ObservedAt), Date.parse(delivered.observedAt));
  }
  // Bind service planning-event frame IDs to the complete, independently validated captures.
  const planning = received.filter(f => f.type === 'execution.event' && /^plan\.(creation|refinement)\.started$/.test(f.payload.type));
  assert.equal(planning.length, 7);
  planning.forEach((f, i) => {
    const request = JSON.parse(root.entries[i].raw).request;
    assert.deepEqual(f.payload.payload.contextFrameIds, request.ContextFrames.map(f => f.FrameId));
    assert.equal(f.payload.payload.toolSurfaceId, request.ToolSurface.SurfaceId);
  });
  const posts = wire.http.filter(r => r.method === 'POST' && new URL(r.url).pathname === '/api/operations/events'
    && r.body?.actionId === firstOperation.actionId && r.body.sequence < wake.sequence);
  assert.ok(posts.length > 0);
  const progress = posts.map(row => {
    assert.deepEqual(JSON.parse(row.serializedBody), row.body, 'Raw progress request');
    const response = one(wire.responses.filter(r => r.method === 'POST' && new URL(r.url).pathname === '/api/operations/events'
      && r.body?.latestEvent?.eventId === row.body.eventId), 'One accepted progress reply');
    assert.equal(response.status, 200);
    return { method: row.method, path: new URL(row.url).pathname, status: response.status, request: row.body, response: response.body };
  });
  const selected = { sent, received, progress };
  noWork(selected);
  return selected;
}

/** Complete selected traffic, not just observations extracted from the wire. Raw evidence is never modified. */
export function comparePublicWire(roots, wire) {
  assert.equal(roots.length, 2);
  const planner = plannerPair();
  const differences = roots[0].entries.map((entry, i) => planner.compare(entry.raw, roots[1].entries[i].raw));
  assert.deepEqual(differences.slice(0, 7), Array.from({ length: 7 }, () => []), 'Equal planner prefix');
  return comparePublicPayloads(roots.map(root => prefix(root, wire)), planner.allowances);
}

export function comparePublicPayloads(raw, seededAllowances = []) {
  assert.equal(raw.length, 2);
  const forward = new Map(), reverse = new Map(), allowances = [];
  const bind = (a, b, path) => {
    assert.ok(!forward.has(a) || forward.get(a) === b, 'Identity alias at ' + path);
    assert.ok(!reverse.has(b) || reverse.get(b) === a, 'Identity alias at ' + path);
    forward.set(a, b); reverse.set(b, a);
  };
  for (const row of seededAllowances) if (row.kind === 'identity') bind(row.left, row.right, row.path);
  raw.forEach(value => noWork(value));
  const [left, right] = raw.map(publicWireShape), differences = [];
  noWork(left.value); noWork(right.value);
  function visit(a, b, path) {
    const kind = left.allowed.get(path);
    if (kind && right.allowed.get(path) === kind) {
      if (kind === 'identity') bind(a, b, path);
      if (a !== b) allowances.push({ path, kind, left: a, right: b });
      return;
    }
    if (a === b) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) differences.push({ path: path + '/' + key, left: a[key], right: b[key] });
        else visit(a[key], b[key], path + '/' + key);
      }
    } else differences.push({ path, left: a, right: b });
  }
  visit(left.value, right.value, '');
  return { raw, differences, allowances };
}

export function assertPublicWireDisclosure(result) {
  assert.ok(result.differences.length > 0, 'Expected first lawful frontier disclosure');
  const disclosed = /^\/sent\/8\/payload\/observation\/data\/frontiers\/[0-3]\/(direction|at\/(column|row)|source\/index|frontier\/selection\/(direction|at\/cell\/(column|row)|source\/index))$/;
  assert.ok(result.differences.every(row => disclosed.test(row.path)), JSON.stringify(result.differences));
  assert.ok(result.differences.some(row => row.path.endsWith('/frontiers/0/direction') && row.left === 'east' && row.right === 'north'));
}
