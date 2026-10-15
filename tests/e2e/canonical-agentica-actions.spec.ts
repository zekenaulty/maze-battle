import { test, expect } from '@playwright/test';
import type {} from './canonical-agentica-actions.fixture';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';

const origin = 'http://127.0.0.1:5236';
let external: string[], errors: string[];
test.beforeEach(async ({ page, context }) => {
  external = []; errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    // Disable only Vite's development socket; every SDK/socket attempt still fails the test.
    if (route.request().url() === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-agentica-actions.html');
  await page.waitForFunction(() => !!window.canonicalAgenticaActions);
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.canonicalAgenticaActions?.stop());
  expect(external, 'No SDK transport or provider attempts').toEqual([]);
  expect(errors, 'No hidden browser errors').toEqual([]);
});

test('real UUID start, all capabilities and source fit 3 KiB and are retained exactly', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot();
    return { fixture, launch: await f.launch(), trace: f.trace() };
  });
  const { fixture, launch } = result;
  expect(fixture.sizes.start).toBeLessThanOrEqual(3072);
  expect(fixture.sizes.binding).toBeLessThanOrEqual(4096);
  expect(fixture.sizes.observation).toBeLessThanOrEqual(768);
  expect(fixture.rawObservationBytes).toBeGreaterThan(3072);
  expect(fixture.start.sessionId).toHaveLength(73);
  for (const id of [fixture.head.gameId, fixture.launchId, fixture.start.scopeId, fixture.start.objectiveId,
    fixture.publication.id, fixture.source.id, launch!.run!.value.data.started.runId]) expect(id).toHaveLength(36);
  expect(fixture.start.capabilities.map(c => c.id)).toEqual(['maze.observe', 'maze.inspect', 'maze.navigate']);
  expect(fixture.start.observation).toMatchObject({ observationId: fixture.publication.id, data: { scope: 'actor', source: { id: fixture.source.id } } });
  expect(fixture.start.observation.data).not.toHaveProperty('cells');
  expect(launch!.binding.start).toEqual(fixture.start);
  expect(launch!.guard.state).toBe('admitted');
  expect(launch!.dispatch).not.toBeNull(); expect(launch!.run).not.toBeNull(); expect(launch!.grant).not.toBeNull();
  expect(result.trace.invocations).toBe(0);
  console.log(`Actual start UTF-8 bytes: ${JSON.stringify(fixture.sizes)}; raw sight ${fixture.rawObservationBytes}`);
  await test.info().attach('start-byte-proof', { body: JSON.stringify(fixture, null, 2), contentType: 'application/json' });
});

test('SDK observe and scoped inspect preserve earned sources and fit 4 KiB without refreshing sight', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot(), results = [];
    for (const [capability, args] of [
      ['maze.observe', {}], ['maze.inspect', { scope: 'cell', ...fixture.actor }],
      ['maze.inspect', { scope: 'room', ...fixture.actor }], ['maze.inspect', { scope: 'map' }],
    ] as const) {
      const action = await f.action(capability, args), reply = await f.dispatch(action);
      results.push({ action, reply, size: f.bytes(reply), record: await f.retained(action) });
    }
    return { fixture, results, head: await f.head(), trace: f.trace() };
  });
  expect(result.trace.statuses).toEqual([]);
  expect(result.trace.invocations).toBe(4); expect(result.trace.pendingAtInvocation).toEqual([true, true, true, true]);
  for (const { action, reply, size, record } of result.results) {
    expect(reply.disposition).toBe('applied'); expect(size).toBeLessThanOrEqual(4096);
    expect(reply.beforeRevision).toBe(action.expectedRevision); expect(reply.afterRevision).toBe(action.expectedRevision);
    expect(reply.observation!.observationId).not.toBe(result.fixture.publication.id);
    expect(reply.observation).toMatchObject({ observedAt: result.fixture.start.observation.observedAt });
    expect(record.value!.original.publication).toEqual(result.fixture.publication);
    expect(record.value!.result).toEqual(reply); expect(record.proof!.row.value).toHaveProperty('proof', 'standalone');
  }
  expect(new Set(result.results.map(r => r.reply.observation!.observationId)).size).toBe(4);
  const cell = result.results[1].reply.observation!.data;
  expect(cell).toMatchObject({ scope: 'cell', cell: { at: result.fixture.actor, world: result.fixture.cell.world,
    state: 'visible', source: { id: result.fixture.source.id } }, sources: [{ id: result.fixture.source.id }] });
  expect(result.results[2].reply.observation!.data).toHaveProperty('cells');
  const map = result.results[3].reply.observation!.data;
  expect(map).toHaveProperty('rooms'); expect(map).not.toHaveProperty('cells');
  for (const room of map.rooms as object[]) {
    expect(Object.keys(room).sort()).toEqual(['level', 'source', 'spaceId']);
  }
  expect(result.head.checkpoint).toEqual(result.fixture.head.checkpoint);
  expect(result.head.roots.world).toEqual(result.fixture.head.roots.world);
  expect(result.head.roots.knowledge).toEqual(result.fixture.head.roots.knowledge);
  console.log(`Actual SDK result UTF-8 bytes: ${result.results.map(r => r.size).join(', ')}`);
});

test('SDK navigation retains exact target and admission receipt but performs no movement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot();
    const action = await f.action('maze.navigate', { ...fixture.target }), reply = await f.dispatch(action);
    const record = await f.retained(action);
    const destination = reply.operation ? await f.destination(reply.operation.operationId) : null;
    const duplicate = await f.dispatch(action); await f.flush();
    return { fixture, action, reply, record, destination, duplicate, head: await f.head(), trace: f.trace(), size: f.bytes(reply) };
  });
  expect(result.trace.statuses).toEqual([]);
  expect(result.reply.disposition).toBe('applied'); expect(result.reply.operation).toBeDefined();
  expect(result.reply.completion).toBeUndefined(); expect(result.size).toBeLessThanOrEqual(4096);
  expect(result.trace.invocations).toBe(1); expect(result.trace.pendingAtInvocation).toEqual([true]);
  expect(result.duplicate).toEqual(result.reply);
  expect(result.destination!.progress).toMatchObject({ steps: 0, sequence: 0, status: 'running',
    position: result.fixture.head.checkpoint.position, binding: { target: { level: result.fixture.target.level,
      cell: { spaceId: result.fixture.target.spaceId, row: result.fixture.target.row, column: result.fixture.target.column } } } });
  expect(result.destination!.progress.route.length).toBeGreaterThan(0);
  expect(result.destination!.operation.state).toBe('admitted');
  const proof = result.record.proof!;
  expect(proof.source.input).toMatchObject({ operationId: result.reply.operation!.operationId,
    binding: result.destination!.progress.binding });
  expect(proof.source.operation).toBe('operation.admit');
  expect(proof.receipt.afterRevision).toBe(result.reply.afterRevision);
  expect(proof.row.value).toHaveProperty('proof', 'navigation');
  expect(proof.receipt.result).toMatchObject({ host: { actionResult: { key: proof.row.key, recordId: proof.row.id,
    revision: proof.row.revision, sourceAttemptId: proof.source.attemptId, recordWitness: canonicalJson(proof.row) } } });
  expect(result.record.value!.result).toEqual(result.reply);
  expect(result.reply.observation!.observationId).not.toBe(result.fixture.publication.id);
  expect(result.reply.observation).toMatchObject({
    observedAt: result.fixture.start.observation.observedAt, data: { source: result.fixture.start.observation.data.source,
      revisionContext: { kind: 'navigation-admission', publicationRevision: result.action.expectedRevision,
        commitRevision: proof.receipt.afterRevision } } });
  expect(result.head.checkpoint).toEqual(result.fixture.head.checkpoint);
  expect(result.head.roots.world).toEqual(result.fixture.head.roots.world);
  expect(result.head.roots.knowledge).toEqual(result.fixture.head.roots.knowledge);
});

test('completed original replays exactly after browser reload and custody takeover without new writes', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot();
    const action = await f.action('maze.navigate', { ...fixture.target }), reply = await f.dispatch(action);
    const retained = await f.retained(action); f.stop();
    return { fixture, action, reply, retained };
  });
  expect(original.reply.disposition).toBe('applied');
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaActions);
  const result = await page.evaluate(async action => {
    const f = window.canonicalAgenticaActions, head = await f.resume();
    const reply = await f.dispatch(action), reconciled = await f.dispatch(action, 'action.reconcile');
    return { head, after: await f.head(), reply, reconciled, retained: await f.retained(action), trace: f.trace() };
  }, original.action);
  expect(result.head.owner).not.toBe(original.fixture.head.owner);
  expect(result.head.epoch).toBeGreaterThan(original.fixture.head.epoch);
  expect(result.reply).toEqual(original.reply); expect(result.reconciled).toEqual(original.reply);
  expect(result.retained).toEqual(original.retained);
  expect(result.after).toEqual(result.head);
  expect(result.trace.invocations).toBe(0); expect(result.trace.statuses).toEqual([]);
});

test('pending original survives browser reload and request/reconcile never executes or admits navigation', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot();
    const action = await f.action('maze.navigate', { ...fixture.target }), retained = await f.reserve(action);
    const head = await f.head(); f.stop(); return { fixture, action, retained, head };
  });
  expect(original.retained.value!.result).toBeNull(); expect(original.retained.proof).toBeNull();
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaActions);
  const result = await page.evaluate(async action => {
    const f = window.canonicalAgenticaActions, head = await f.resume();
    const reply = await f.dispatch(action), reconciled = await f.dispatch(action, 'action.reconcile');
    const direct = await f.direct(action);
    return { head, after: await f.head(), reply, reconciled, direct, retained: await f.retained(action), trace: f.trace() };
  }, original.action);
  expect(result.reply.disposition).toBe('unresolved'); expect(result.reconciled.disposition).toBe('unresolved');
  expect(result.direct.disposition).toBe('unresolved'); expect(result.reply.operation).toBeUndefined();
  expect(result.retained).toEqual(original.retained); expect(result.after).toEqual(result.head);
  expect(Object.keys(result.head.allocations)).toEqual(Object.keys(original.head.allocations));
  expect(result.head.checkpoint).toEqual(original.head.checkpoint);
  expect(result.trace.invocations).toBe(0); expect(result.trace.statuses).toEqual([]);
});

test('duplicate completed read-only action has identical result and no additional canonical commit', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions; await f.boot();
    const action = await f.action('maze.observe'), reply = await f.dispatch(action), head = await f.head();
    const again = await f.dispatch(action), reconciled = await f.dispatch(action, 'action.reconcile');
    return { reply, again, reconciled, head, after: await f.head(), trace: f.trace() };
  });
  expect(result.reply.disposition).toBe('applied'); expect(result.again).toEqual(result.reply);
  expect(result.reconciled).toEqual(result.reply); expect(result.after).toEqual(result.head);
  expect(result.trace.invocations).toBe(1); expect(result.trace.statuses).toEqual([]);
});

for (const kind of ['unknown-room', 'unknown-cell', 'negative-local', 'oversized-local', 'observe-extra', 'inspect-extra', 'navigate-extra'] as const) {
  test(`SDK refuses ${kind} without movement or operation admission`, async ({ page }) => {
    const result = await page.evaluate(async kind => {
      const f = window.canonicalAgenticaActions, fixture = await f.boot();
      const capability = kind === 'observe-extra' ? 'maze.observe' : kind === 'inspect-extra' ? 'maze.inspect' : 'maze.navigate';
      const args = kind === 'observe-extra' ? { extra: true } : kind === 'inspect-extra' ? { scope: 'map', extra: true }
        : { ...fixture.target, ...(kind === 'unknown-room' ? { spaceId: crypto.randomUUID() }
          : kind === 'unknown-cell' ? { row: 511, column: 511 } : kind === 'negative-local' ? { row: -1 }
          : kind === 'oversized-local' ? { column: 512 } : { extra: true }) };
      const action = await f.action(capability, args), reply = await f.dispatch(action), head = await f.head();
      const duplicate = await f.dispatch(action);
      return { fixture, reply, duplicate, head, after: await f.head(), retained: await f.retained(action), trace: f.trace(), size: f.bytes(reply) };
    }, kind);
    expect(result.trace.statuses).toEqual([]); expect(result.trace.invocations).toBe(1);
    expect(result.reply.disposition).toBe('refused'); expect(result.reply.operation).toBeUndefined();
    expect(result.reply.afterRevision).toBe(result.reply.beforeRevision); expect(result.size).toBeLessThanOrEqual(4096);
    expect(result.reply.observation!.observationId).not.toBe(result.fixture.publication.id);
    expect(result.reply.observation).toEqual({ ...result.fixture.start.observation, observationId: result.reply.observation!.observationId });
    expect(result.retained.value!.result).toEqual(result.reply); expect(result.duplicate).toEqual(result.reply);
    expect(result.head.checkpoint).toEqual(result.fixture.head.checkpoint);
    expect(result.head.allocations).toEqual(result.fixture.head.allocations); expect(result.after).toEqual(result.head);
  });
}

test('unknown cell inspection is opaque and does not disclose generated geometry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot();
    const action = await f.action('maze.inspect', { scope: 'cell', ...fixture.actor, row: 511, column: 511 });
    return { reply: await f.dispatch(action), head: await f.head(), fixture, trace: f.trace() };
  });
  expect(result.reply.disposition).toBe('applied');
  expect(result.reply.observation!.data).toEqual({ scope: 'cell', state: 'unknown' });
  expect(result.head.checkpoint).toEqual(result.fixture.head.checkpoint); expect(result.trace.statuses).toEqual([]);
});

test('SDK rejects changed arguments under a completed original key without replacing its proof', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot();
    const action = await f.action('maze.inspect', { scope: 'cell', ...fixture.actor });
    const reply = await f.dispatch(action), retained = await f.retained(action), head = await f.head();
    const changed = await f.dispatch({ ...action, arguments: { ...action.arguments, row: 511 } });
    return { reply, changed, retained, afterRecord: await f.retained(action), head, after: await f.head(), trace: f.trace() };
  });
  expect(result.reply.disposition).toBe('applied'); expect(result.changed.disposition).toBe('unresolved');
  expect(result.trace.invocations).toBe(1);
  expect(result.trace.statuses).toHaveLength(1); expect(result.trace.statuses[0].state).toBe('action.error');
  expect(String(result.trace.statuses[0].detail)).toMatch(/identity|fingerprint|changed/i);
  expect(result.afterRecord).toEqual(result.retained); expect(result.after).toEqual(result.head);
});

test('room continuation retains sources and foreign-publication cursor receives an explicit refusal', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot();
    const first = await f.dispatch(await f.action('maze.inspect', { scope: 'room', ...fixture.actor }));
    const cursor = first.observation!.data.next as string;
    if (!cursor) throw Error('Expected bounded room continuation');
    const next = await f.dispatch(await f.action('maze.inspect', { scope: 'room', ...fixture.actor, cursor }));
    const foreign = JSON.parse(cursor); foreign.publication.id = crypto.randomUUID();
    const refusal = await f.dispatch(await f.action('maze.inspect', { scope: 'room', ...fixture.actor, cursor: JSON.stringify(foreign) }));
    return { fixture, first, next, refusal, sizes: [first, next, refusal].map(f.bytes), head: await f.head(), trace: f.trace() };
  });
  expect(result.trace.statuses).toEqual([]); expect(result.trace.invocations).toBe(3);
  for (const reply of [result.first, result.next]) {
    expect(reply.disposition).toBe('applied'); expect(reply.observation!.observationId).not.toBe(result.fixture.publication.id);
    expect(reply.observation).toMatchObject({
      revision: result.fixture.start.observation.revision, observedAt: result.fixture.start.observation.observedAt });
  }
  expect(new Set([result.fixture.start.observation, result.first.observation!, result.next.observation!,
    result.refusal.observation!].map(o => o.observationId)).size).toBe(4);
  expect(result.refusal.disposition).toBe('refused');
  expect(result.refusal.observation).toEqual({ ...result.fixture.start.observation, observationId: result.refusal.observation!.observationId });
  for (const size of result.sizes) expect(size).toBeLessThanOrEqual(4096);
  expect(result.head.checkpoint).toEqual(result.fixture.head.checkpoint);
});
