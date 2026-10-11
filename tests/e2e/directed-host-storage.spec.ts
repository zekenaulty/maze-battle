import { expect, test } from '@playwright/test';
import type {} from './directed-host-fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/directed-host-fixture.html');
  await page.waitForFunction(() => !!window.directedHost);
});

test('admission and exact replay never count arrival or repeat effects', async ({ page }) => {
  const initial = await page.evaluate(async () => {
    const h = window.directedHost, binding = await h.setup(), action = await h.action(binding);
    const result = await h.actions.executeDirectedAgenticaAction('directed', action);
    return { binding, action, result, raw: await window.directedStream.raw() };
  });
  expect(initial.result.disposition).toBe('applied');
  expect(initial.result.operation).toBeDefined();
  expect(initial.result.completion).toBeUndefined();
  expect(initial.result.observation!.data.view).toEqual({ kind: 'operation' });
  expect(initial.result.observation!.data).not.toHaveProperty('knowledge');
  expect(initial.result.observation!.data).not.toHaveProperty('observation');
  expect(initial.raw.records.find(row => row.store === 'streamCheckpoints')!.value.moves).toBe(0);
  await page.reload(); await page.waitForFunction(() => !!window.directedHost);
  const replay = await page.evaluate(async action => {
    const h = window.directedHost;
    const result = await h.actions.executeDirectedAgenticaAction('directed', action);
    return { result, raw: await window.directedStream.raw() };
  }, initial.action);
  expect(replay).toEqual({ result: initial.result, raw: initial.raw });
});

test('context views are explicit, paginated, historical and do not move or generate the world', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, s = window.directedStream, binding = await h.setup();
    const before = await s.api.loadStreamSnapshot('directed');
    const query = async (tool: string, args: Record<string, unknown>) => {
      const action = await h.action(binding, tool, args);
      return { action, result: await h.actions.executeDirectedAgenticaAction('directed', action) };
    };
    const map = await query('maze.map', { spaceId: 'entry', depth: 2, limit: 4 });
    const room = await query('maze.room', { spaceId: 'entry', offset: 0, limit: 16 });
    const next = await query('maze.room', { spaceId: 'entry', offset: 16, limit: 16 });
    const unknown = await query('maze.room', { spaceId: 'unseen', offset: 0, limit: 16 });
    const after = await s.api.loadStreamSnapshot('directed');
    await s.act({ type: 'move', direction: 'west' });
    const replay = await h.actions.executeDirectedAgenticaAction('directed', room.action);
    return { before, after, map: map.result, room: room.result, next: next.result, unknown: unknown.result, replay };
  });
  expect(proof.after).toEqual(proof.before);
  const map = proof.map.observation!.data.context as any;
  expect(map.rooms).toHaveLength(1);
  expect(JSON.stringify(map)).not.toMatch(/"(?:cells|row|column|recipe|seed)"/);
  expect(proof.room.observation!.data.context).toMatchObject({ kind: 'room', offset: 0, nextOffset: 16 });
  expect(proof.next.observation!.data.context).toMatchObject({ kind: 'room', offset: 16 });
  expect(proof.unknown.observation!.data.context).toEqual({ kind: 'room', status: 'unknown', spaceId: 'unseen' });
  expect(proof.replay).toEqual(proof.room);
});

test('archived query scope cannot be substituted with another valid view', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, s = window.directedStream, binding = await h.setup();
    const first = await h.action(binding, 'maze.room', { spaceId: 'entry', offset: 0, limit: 16 });
    const next = await h.action(binding, 'maze.room', { spaceId: 'entry', offset: 16, limit: 16 });
    await h.actions.executeDirectedAgenticaAction('directed', first);
    const different = await h.actions.executeDirectedAgenticaAction('directed', next);
    const key = ['directed', h.sdk.actionKey(first)], db = await s.openDB(s.TOPOLOGY_DATABASE);
    const stored = await db.get('directedAgenticaActions', key);
    stored.record.result.observation.data.context = different.observation!.data.context;
    await db.put('directedAgenticaActions', stored, key); db.close();
    let error = '';
    try { await h.actions.settleDirectedAgenticaAction('directed', first); } catch (cause) { error = String(cause); }
    return error;
  });
  expect(proof).toContain('room query selection changed');
});

test('pending reconciliation settles without ever admitting a journey', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, binding = await h.setup(), action = await h.action(binding);
    const result = await h.actions.settleDirectedAgenticaAction('directed', action);
    const replay = await h.actions.executeDirectedAgenticaAction('directed', action);
    return { result, replay, raw: await window.directedStream.raw() };
  });
  expect(proof.result.disposition).toBe('unavailable');
  expect(proof.replay).toEqual(proof.result);
  expect(proof.raw.records.filter(row => row.store === 'directedStreamOperations')).toHaveLength(0);
});

test('events remain immutable after lost delivery and cancellation fences local travel first', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, s = window.directedStream, binding = await h.setup(), action = await h.action(binding);
    const admission = await h.actions.executeDirectedAgenticaAction('directed', action);
    const id = admission.operation!.operationId;
    const event = await h.events.stageDirectedHostEvent('directed', id);
    const raw = await s.raw();
    const replay = await h.events.stageDirectedHostEvent('directed', id);
    const replayRaw = await s.raw();
    await h.control.cancelDirectedAgenticaOperation('directed', id, binding.control);
    const cancelled = await s.durable.loadDirectedStreamSession('directed');
    await h.events.acknowledgeDirectedHostEvent('directed', event);
    const cancellation = await h.events.stageDirectedHostEvent('directed', id);
    await h.events.acknowledgeDirectedHostEvent('directed', cancellation);
    const original = await h.actions.settleDirectedAgenticaAction('directed', action);
    return { event, replay, raw, replayRaw, cancelled, cancellation, admission, original };
  });
  expect(proof.replay).toEqual(proof.event);
  expect(proof.replayRaw).toEqual(proof.raw);
  expect(proof.cancelled.record!.state.operation.status).toBe('cancelled');
  expect(proof.cancellation).toMatchObject({ kind: 'cancelled', sequence: 2 });
  expect(proof.original).toEqual(proof.admission);
});

test('explicit adoption retains original grant, usage and receipt lineage', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, s = window.directedStream, binding = await h.setup(), action = await h.action(binding);
    const admission = await h.actions.executeDirectedAgenticaAction('directed', action), id = admission.operation!.operationId;
    const before = (await s.durable.loadDirectedStreamSession('directed')).record!;
    const next = await s.durable.openDirectedStreamSession('directed', 'explicit-new-owner');
    const transfer = await h.control.adoptDirectedAgenticaOperation('directed', id, next.control);
    const adopted = (await s.durable.loadDirectedStreamSession('directed')).record!;
    await h.events.acknowledgeDirectedHostEvent('directed', transfer);
    const original = await h.actions.executeDirectedAgenticaAction('directed', action);
    return { before, adopted, transfer, admission, original };
  });
  expect(proof.transfer).toMatchObject({ kind: 'transfer', sequence: 1, sessionEpoch: '0', nextSessionEpoch: '1' });
  expect(proof.adopted.state.paused).toBe(false);
  for (const key of ['id', 'target', 'limits', 'startedAt', 'deadline', 'steps'] as const) {
    expect(proof.adopted.state.operation[key]).toEqual(proof.before.state.operation[key]);
  }
  expect(proof.original).toEqual(proof.admission);
});

test('inspection does not fabricate unseen facts; wrong destination is refused', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, binding = await h.setup();
    const inspect = await h.action(binding, 'maze.inspect', { spaceId: 'unseen', row: 0, column: 0 });
    const unknown = await h.actions.executeDirectedAgenticaAction('directed', inspect);
    const navigate = await h.action(binding, 'maze.navigate', { ...binding.destination, row: 0 });
    const refused = await h.actions.executeDirectedAgenticaAction('directed', navigate);
    return { unknown, refused };
  });
  expect(proof.unknown.disposition).toBe('refused');
  expect(proof.unknown.observation!.data.inspection).toBeUndefined();
  expect(proof.refused.disposition).toBe('refused');
  expect(proof.refused.operation).toBeUndefined();
});

test('execution racing recovery settles the original reservation exactly once', async ({ page, context }) => {
  const action = await page.evaluate(async () => {
    const h = window.directedHost; return h.action(await h.setup());
  });
  const second = await context.newPage(); await second.goto('/tests/e2e/directed-host-fixture.html');
  await second.waitForFunction(() => !!window.directedHost);
  const results = await Promise.all([
    page.evaluate(action => window.directedHost.actions.executeDirectedAgenticaAction('directed', action), action),
    second.evaluate(action => window.directedHost.actions.settleDirectedAgenticaAction('directed', action), action),
  ]);
  expect(results[0]).toEqual(results[1]);
  const records = await page.evaluate(() => window.directedStream.raw());
  expect(records.records.filter(row => row.store === 'directedStreamOperations')).toHaveLength(results[0].operation ? 1 : 0);
  expect(records.records.find(row => row.store === 'streamCheckpoints')!.value.moves).toBe(0);
});

test('quota rollback leaves pending admission and world unchanged', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, s = window.directedStream, binding = await h.setup(), action = await h.action(binding);
    const db = await s.openDB(s.TOPOLOGY_DATABASE), root = await db.get('roots', 'directed');
    root.quotaBytes = root.serializedBytes + 16;
    await db.put('roots', root, 'directed'); db.close();
    const before = await s.raw(); let error = '';
    try { await h.actions.executeDirectedAgenticaAction('directed', action); } catch (cause) { error = String(cause); }
    return { before, after: await s.raw(), error };
  });
  expect(proof.error).toMatch(/quota|Invalid topology root/);
  expect(proof.after).toEqual(proof.before);
});

test('changed original action cannot replace archived evidence', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, binding = await h.setup(), action = await h.action(binding);
    const original = await h.actions.executeDirectedAgenticaAction('directed', action);
    const before = await window.directedStream.raw(); let error = '';
    try { await h.actions.executeDirectedAgenticaAction('directed', { ...action, deadlineAt: new Date(Date.now() + 90000).toISOString() }); }
    catch (cause) { error = String(cause); }
    return { original, error, before, after: await window.directedStream.raw() };
  });
  expect(proof.error).toContain('reservation');
  expect(proof.after).toEqual(proof.before);
});

test('unreachable admission returns a refusal without leaving an orphan intention', async ({ page }) => {
  const proof = await page.evaluate(async () => {
    const h = window.directedHost, binding = await h.setup();
    const unknown = { ...binding, runId: 'unknown-run', destination: { spaceId: 'unseen', row: 0, column: 0 } };
    await h.runs.bindDirectedAgenticaRun('directed', unknown);
    const action = await h.action(unknown), result = await h.actions.executeDirectedAgenticaAction('directed', action);
    return { result, raw: await window.directedStream.raw() };
  });
  expect(proof.result.disposition).toBe('refused');
  expect(proof.raw.records.filter(row => row.store === 'directedStreamHeads' || row.store === 'directedStreamOperations')).toHaveLength(0);
});
