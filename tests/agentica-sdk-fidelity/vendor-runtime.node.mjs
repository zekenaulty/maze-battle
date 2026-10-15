// Run explicitly with node --test; kept outside Vitest's *.test.* discovery.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { AgenticaHost } from '../../src/services/agentica/sdk/agentica-host.mjs';

test('vendored runtime matches the exact Agentica 602f15a committed blob', async () => {
  // core.autocrlf may change checkout newlines, but no other byte difference is allowed.
  const checkout = await readFile(new URL('../../src/services/agentica/sdk/agentica-host.mjs', import.meta.url));
  const bytes = Buffer.from(checkout.toString('utf8').replaceAll('\r\n', '\n'));
  assert.equal(bytes.length, 51894);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '46d88c25bda57ee1371fc05209445f321dd3183e52f71a12abce221094a5a9dd');
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    '1e413916aa079a71e84b82b53cb88fb701f15079');
});

class Socket {
  static instances = [];
  constructor() { this.readyState = 0; this.handlers = new Map(); this.sent = []; Socket.instances.push(this); }
  addEventListener(type, handler) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]); }
  emit(type, payload = {}) { for (const handler of this.handlers.get(type) ?? []) handler(payload); }
  open() { this.readyState = 1; this.emit('open'); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  receive(message) { this.emit('message', { data: JSON.stringify({ protocolVersion: 1, ...message }) }); }
  close() { this.readyState = 3; this.emit('close'); }
}

// Digests here test format/binding only; the SDK does not recompute service hashes.
const hash = digit => `sha256:${digit.repeat(64)}`;
const observation = revision => ({ observationId: `observation-${revision}`, revision,
  observedAt: '2026-10-15T12:00:00.000Z', data: { revision, legal: true } });
const submission = () => ({ attemptId: 'initial-attempt', request: {
  protocolVersion: 1, hostId: 'maze-battle', sessionId: 'session', sessionEpoch: 'epoch',
  scopeId: 'scope', perspectiveId: 'party', objectiveId: 'objective', objective: 'Complete host work.',
  observation: observation(0), capabilities: [{ id: 'maze.move', name: 'Move', description: 'Move the party.',
    kind: 'action', effect: 'writesLocalState', inputSchema: {
      fields: [{ name: 'direction', type: 'string', required: true }], allowAdditionalProperties: false,
    } }],
  provider: { provider: 'fixture', contextWindowTokens: 131072, maxOutputTokens: 4096 },
  limits: { maxSteps: 4, maxRefinements: 8, maxPlanContinuations: 2, timeoutSeconds: 60, actionTimeoutSeconds: 30 },
} });
function typedEcho(request) {
  const echo = structuredClone(request);
  echo.observation = { ...echo.observation, observedAt: '2026-10-15T12:00:00+00:00', facts: null };
  for (const capability of echo.capabilities) {
    capability.inputSchema.fields = capability.inputSchema.fields.map(field => ({ ...field,
      description: null, allowedValues: null, example: null, minimum: null, maximum: null }));
  }
  echo.provider = { model: null, thinkingEffort: null, includeThoughtSummaries: false, geminiApi: null, ...echo.provider };
  echo.limits = { maxRecentObservations: 6, maxRecentReceipts: 6, ...echo.limits };
  return echo;
}
function entry(source = submission()) {
  const originalRequest = typedEcho(source.request), acceptedRequest = structuredClone(originalRequest);
  acceptedRequest.provider = { ...acceptedRequest.provider, model: 'offline', thinkingEffortResolved: true };
  return { schema: 1, attemptId: source.attemptId, runId: 'initial-run', originalRequest, acceptedRequest,
    originalRequestHash: hash('a'), acceptedRequestHash: hash('b'), manifestHash: hash('c'),
    stopRequested: false, terminal: null, admittedAt: '2026-10-15T12:00:00+00:00' };
}
const key = () => ({ hostId: 'maze-battle', sessionId: 'session', attemptId: 'initial-attempt' });
const reference = () => ({ ...key(), runId: 'initial-run', acceptedRequestHash: hash('b') });
const action = () => ({ actionId: 'action', runId: 'initial-run', runnerRunId: 'runner', stepId: 'step',
  sessionId: 'session', sessionEpoch: 'epoch', capabilityId: 'maze.move', manifestHash: hash('c'),
  arguments: { direction: 'north' }, expectedRevision: 0, deadlineAt: '2099-10-15T12:00:00Z' });
const result = next => ({ actionId: next.actionId, sessionId: next.sessionId, sessionEpoch: next.sessionEpoch,
  disposition: 'applied', beforeRevision: 0, afterRevision: 1, evidenceId: 'receipt', summary: 'Moved.',
  observation: observation(1) });
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const turn = () => new Promise(resolve => setImmediate(resolve));
const host = (options = {}) => new AgenticaHost({ url: 'wss://example.invalid/api/host?discard=yes#discard',
  WebSocketImpl: Socket, requestTimeoutMs: 1000,
  onAction: () => assert.fail('Unexpected host effect.'), ...options });
async function connect(client) {
  const pending = client.connect(), socket = Socket.instances.at(-1);
  socket.open(); await pending; return socket;
}
function started(sent, admission = entry()) {
  const accepted = admission.acceptedRequest;
  return { type: 'started', requestId: sent.requestId, runId: admission.runId, payload: {
    runId: admission.runId, hostId: accepted.hostId, sessionId: accepted.sessionId, sessionEpoch: accepted.sessionEpoch,
    objectiveId: accepted.objectiveId, scopeId: accepted.scopeId, perspectiveId: accepted.perspectiveId,
    manifestHash: admission.manifestHash, startAdmission: admission } };
}
function deliver(socket) { socket.receive({ type: 'action.request', runId: 'initial-run', payload: action() }); }

test('durable start freezes input and binds typed .NET null/default echoes before immediate effects', async t => {
  const events = [], client = host({ onMessage: message => {
    if (message.type === 'started') {
      assert.equal(client.runs.get('initial-run').startAdmission.attemptId, 'initial-attempt');
      events.push('accepted');
    }
  }, onAction: next => { events.push('effect'); return result(next); } });
  t.after(() => client.close());
  const source = submission(), before = structuredClone(source), pending = client.startDurable(source);
  source.request.objective = 'Changed after submission'; source.request.capabilities.length = 0;
  const socket = Socket.instances.at(-1); socket.open(); await turn();
  assert.equal(socket.sent.length, 1); assert.equal(socket.sent[0].type, 'start.durable');
  assert.deepEqual(socket.sent[0].payload, before);
  socket.receive(started(socket.sent[0], entry(before))); deliver(socket);
  const snapshot = await pending; await client.actionQueue;
  assert.deepEqual(events, ['accepted', 'effect']);
  assert.equal(socket.sent.at(-1).payload.disposition, 'applied');
  assert.equal(snapshot.startAdmission.originalRequest.provider.model, null);
  snapshot.startAdmission.acceptedRequest.capabilities.length = 0;
  assert.equal(client.runs.get('initial-run').capabilities.length, 1);
});

test('lost reply permits exact lookup after reload without a second start or effect binding', async t => {
  const first = host(); t.after(() => first.close()); const socket = await connect(first);
  const pending = first.startDurable(submission()), rejected = assert.rejects(pending, /unresolved/);
  await turn(); socket.close(); await rejected;
  const next = host(); t.after(() => next.close());
  const connections = Socket.instances.length, requests = [];
  const found = await next.getStart(key(), { fetchImpl: async (url, options) => {
    requests.push({ url, options }); return response(entry());
  } });
  assert.deepEqual(found, entry()); assert.equal(first.runs.size, 0); assert.equal(next.runs.size, 0);
  assert.equal(Socket.instances.length, connections);
  assert.deepEqual(socket.sent.map(message => message.type), ['start.durable']);
  assert.equal(requests.length, 1); assert.equal(requests[0].options, undefined);
  const url = new URL(requests[0].url);
  assert.equal(url.origin, 'https://example.invalid'); assert.equal(url.pathname, '/api/starts');
  assert.equal(url.hash, ''); assert.deepEqual(Object.fromEntries(url.searchParams), key());
});

for (const [name, change] of [
  ['original provider', item => { item.originalRequest.provider.model = 'rewritten'; }],
  ['original limits', item => { item.originalRequest.limits.maxSteps++; }],
  ['accepted observation', item => { item.acceptedRequest.observation.data.legal = false; }],
  ['accepted capability', item => { item.acceptedRequest.capabilities[0].inputSchema.fields[0].required = false; }],
]) test(`changed ${name} rejects before any binding or effects`, async t => {
  const client = host(); t.after(() => client.close()); const socket = await connect(client);
  const pending = client.startDurable(submission()), rejected = assert.rejects(pending);
  await turn(); const admission = entry(); change(admission);
  socket.receive(started(socket.sent[0], admission)); deliver(socket); await rejected; await client.actionQueue;
  assert.equal(client.runs.size, 0); assert.equal(client.actions.size, 0); assert.equal(socket.sent.length, 1);
});

for (const state of ['pending', 'stopped', 'interrupted']) test(`Stop fences queued effects before HTTP and preserves ${state} settlement`, async t => {
  const client = host(); t.after(() => client.close()); const socket = await connect(client);
  const starting = client.startDurable(submission()); await turn(); socket.receive(started(socket.sent[0])); await starting;
  let complete; const requests = [], target = reference(), before = structuredClone(target);
  deliver(socket);
  const stopping = client.stopStart(target, { fetchImpl: (url, options) => {
    requests.push({ url, options }); return new Promise(resolve => { complete = resolve; });
  } });
  target.runId = 'changed';
  assert.ok(client.stoppedRuns.has('initial-run'));
  await client.actionQueue; assert.equal(socket.sent.at(-1).payload.disposition, 'unresolved');
  assert.equal(client.actions.size, 0);
  const stopped = { ...entry(), stopRequested: true };
  if (state !== 'pending') stopped.terminal = { reason: state, usageUnknown: state === 'interrupted',
    usage: state === 'interrupted' ? null : { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 },
    settledAt: '2026-10-15T12:00:01+00:00' };
  complete(response(stopped)); assert.deepEqual(await stopping, stopped);
  assert.equal(requests.length, 1); assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].url, 'https://example.invalid/api/starts/stop');
  assert.deepEqual(JSON.parse(requests[0].options.body), before);
  assert.equal(socket.sent.filter(message => message.type === 'start.durable').length, 1);
});

test('not-found lookup remains UNKNOWN with no fallback connection or start', async () => {
  const client = host(), connections = Socket.instances.length;
  await assert.rejects(client.getStart(key(), { fetchImpl: async () => response({
    code: 'start.not_found', message: 'No retained admission.',
  }, 404) }), error => error.code === 'start.not_found');
  assert.equal(client.runs.size, 0); assert.equal(Socket.instances.length, connections);
});

test('failed Stop keeps the local fence without claiming terminal settlement', async t => {
  const client = host(); t.after(() => client.close()); const socket = await connect(client);
  const starting = client.startDurable(submission()); await turn(); socket.receive(started(socket.sent[0])); await starting;
  await assert.rejects(client.stopStart(reference(), { fetchImpl: async () => { throw new Error('reply lost'); } }), /reply lost/);
  deliver(socket); await client.actionQueue;
  assert.equal(socket.sent.at(-1).payload.disposition, 'unresolved');
  assert.ok(client.stoppedRuns.has('initial-run'));
  assert.equal(client.runs.get('initial-run').startAdmission.terminal, null);
});
