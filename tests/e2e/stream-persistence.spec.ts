import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-fixture';

const fixture = '/tests/e2e/stream-persistence-fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => Boolean(window.stream)); });

test('fresh gameplay owns topology; prepare persists only current-room evidence and its compact receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, topology, setup, request, raw, trace } = window.stream;
    const initial = await setup();
    const input = await request({ type: 'prepare', frontierId: initial.snapshot.room.sockets[0].id }, 'prepare-first');
    const materialized: string[] = [];
    const measured = await trace(() => api.executeStreamAction('stream', input, space => {
      materialized.push(space.spec.id); return window.stream.materializeTopologySpace(space);
    }));
    const snapshotRead = await trace(() => api.loadStreamSnapshot('stream'));
    const snapshot = snapshotRead.result;
    const receipt = await api.loadStreamAction('stream', input);
    const knowledgeRead = await trace(() => api.readStreamKnowledge('stream', 'socket-0:room'));
    let blocked = '';
    try { await topology.expandTopologyNext('stream', { scopeId: snapshot.checkpoint.scopeId, requestId: 'bare', expectedRevision: 1 }); }
    catch (error) { blocked = String(error); }
    const stored = await raw();
    return { initial, measured, snapshot, receipt, snapshotReads: snapshotRead.total, knowledgeRead, materialized, blocked, root: await topology.loadTopologyHeader('stream'), bytes: stored.bytes,
      knowledgePages: stored.records.filter(record => record.store === 'streamKnowledge').length };
  });
  expect(result.measured.result.disposition).toBe('applied');
  expect(result.measured.total).toBeLessThanOrEqual(43);
  expect(result.measured.reads.buckets).toBe(25);
  expect(result.snapshot.checkpoint.topologyRevision).toBe(1);
  expect(result.snapshot.checkpoint.position).toEqual(result.initial.snapshot.checkpoint.position);
  expect(result.snapshot.room.sockets[0].status).toBe('linked');
  expect(result.snapshot.room.connections).toHaveLength(1);
  expect(result.receipt?.result).toEqual(result.measured.result);
  expect(result.receipt?.result.observation).toBeUndefined();
  expect(result.knowledgeRead.result).toBeUndefined(); expect(result.knowledgeRead.total).toBe(3);
  expect(result.snapshotReads).toBe(8); expect(result.materialized).toEqual(['entry']);
  expect(result.knowledgePages).toBe(1);
  expect(result.snapshot.observation.visibleOpenings.every(port => port.destination === undefined)).toBe(true);
  expect(result.blocked).toContain('Gameplay-managed');
  expect(result.root?.serializedBytes).toBe(result.bytes);
});

test('full small floor completes through atomic commands and retains chest/knowledge state across reload', async ({ page }) => {
  await page.evaluate(() => window.stream.setup());
  const result = await page.evaluate(() => window.stream.playSmallFloor());
  expect(result.snapshot.checkpoint.phase).toBe('complete');
  expect(result.snapshot.checkpoint.visitedSpaces).toBe(15);
  expect(result.snapshot.checkpoint.clearedSpaces).toBe(15);
  expect(result.snapshot.checkpoint.collectedChests).toBe(7);
  expect(result.spaces).toBe(15);
  expect(result.maximumReads).toBeLessThanOrEqual(43);
  await page.reload(); await page.waitForFunction(() => Boolean(window.stream));
  expect(await page.evaluate(() => window.stream.api.loadStreamSnapshot('stream'))).toEqual(result.snapshot);
  const stored = await page.evaluate(async () => {
    const snapshot = await window.stream.raw();
    const pages = snapshot.records.filter(record => record.store === 'streamKnowledge');
    const actions = snapshot.records.filter(record => record.store === 'streamActions');
    return { bytes: snapshot.bytes, root: await window.stream.topology.loadTopologyHeader('stream'), pages: pages.length,
      opened: pages.reduce((total, record) => total + Object.values(record.value.chests).filter((chest: any) => chest.opened).length, 0),
      actions: actions.length, observations: actions.some(record => record.value.result.observation !== undefined) };
  });
  expect(stored.pages).toBe(15); expect(stored.opened).toBe(7);
  expect(stored.actions).toBe(result.commands); expect(stored.observations).toBe(false);
  expect(stored.root?.serializedBytes).toBe(stored.bytes);
  console.log(JSON.stringify({ evidence: 'stream playable floor', commands: result.commands, spaces: result.spaces, maximumReads: result.maximumReads, bytes: stored.bytes }));
});

test('exact receipts reconcile after reload and takeover before session/epoch/revision fences', async ({ page }) => {
  const original = await page.evaluate(async () => {
    await window.stream.setup();
    const request = await window.stream.request({ type: 'move', direction: 'north' }, 'original');
    const result = await window.stream.api.executeStreamAction('stream', request);
    const refused = await window.stream.request({ type: 'collect' }, 'refused');
    const refusal = await window.stream.api.executeStreamAction('stream', refused);
    return { request, result, refused, refusal };
  });
  expect(original.refusal.disposition).toBe('refused');
  await page.reload(); await page.waitForFunction(() => Boolean(window.stream));
  const result = await page.evaluate(async original => {
    const { api, raw } = window.stream;
    const control = await api.claimStreamControl('stream', 'owner-b', 0);
    const before = await raw();
    const replay = await api.executeStreamAction('stream', original.request, () => { throw new Error('Replay materialized geometry'); });
    const refused = await api.executeStreamAction('stream', original.refused);
    const fenced = await api.executeStreamAction('stream', { ...original.request, actionId: 'old-owner', expectedRevision: 1 });
    let changed = '';
    try { await api.executeStreamAction('stream', { ...original.request, command: { type: 'collect' } }); } catch (error) { changed = String(error); }
    return { control, replay, refused, fenced, changed, unchanged: JSON.stringify(before) === JSON.stringify(await raw()),
      loaded: await api.loadStreamAction('stream', 'original'), absent: await api.loadStreamAction('stream', 'old-owner') };
  }, original);
  expect(result.control).toEqual({ sessionId: 'owner-b', epoch: 1 });
  expect(result.replay).toEqual(original.result); expect(result.refused).toEqual(original.refusal);
  expect(result.fenced.disposition).toBe('conflict'); expect(result.absent).toBeUndefined();
  expect(result.changed).toContain('reused'); expect(result.unchanged).toBe(true);
  expect(result.loaded?.request).toEqual(original.request);
});
