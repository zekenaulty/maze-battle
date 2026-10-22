import { test, expect } from '@playwright/test';
import type {} from './canonical-room-connections.fixture';
import { CORPUS_TIME } from './canonical-corpus.layout';
import { DEFAULT_WORK_LIMITS } from '../../src/persistence/canonical/types';

test('native earned passage collapses to another room; retained query survives new sight, reload and local Stop', async ({ page, context }, info) => {
  const origin = 'http://127.0.0.1:5428', external: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    external.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.clock.setFixedTime(CORPUS_TIME);
  await page.goto(`${origin}/tests/e2e/canonical-room-connections.html`);
  await page.waitForFunction(() => !!window.canonicalRoomConnections);
  const attach = async (name: string, value: unknown) => info.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
  try {
    const setup = await page.evaluate(() => window.canonicalRoomConnections.boot());
    await attach('ordinary-earned-prelude.json', setup);
    expect(setup.prelude).toHaveLength(12);
    expect(setup.prelude.every(frame => (frame.receipt.result as { moved: boolean }).moved)).toBe(true);
    expect(setup.prelude.some(frame => frame.sight!.header.actor.cell.spaceId === setup.passage)).toBe(true);
    const batches = [];
    for (const [scope, spaceId] of [['connections', setup.origin], ['links', setup.origin],
      ['connections', 'unknown-probe'], ['connections', setup.passage]] as const) {
      const batch = await page.evaluate(({ scope, spaceId }) => window.canonicalRoomConnections.inspect(scope, spaceId), { scope, spaceId });
      batches.push(batch); await attach(`raw-${scope}-${batches.length}.json`, batch);
      expect(batch.after.checkpoint).toEqual(batch.before.checkpoint);
      expect(batch.after.roots.world).toBe(batch.before.roots.world);
      expect(batch.after.roots.knowledge).toBe(batch.before.roots.knowledge);
      expect(batch.result.operation).toBeUndefined(); expect(batch.result.completion).toBeUndefined();
      expect(batch.observationBytes).toBeLessThanOrEqual(2800); expect(batch.resultBytes).toBeLessThanOrEqual(4096);
      expect(batch.commits.map(c => c.operation)).toEqual(['agentica.action.reserve', 'agentica.action.resolve']);
      for (const { measured } of batch.commits) {
        const trace = measured.trace, commit = measured.value;
        expect(trace.native.some(row => row.area === 'world')).toBe(false);
        expect(trace.writes.every(row => row.area === 'execution')).toBe(true);
        expect(trace.knowledgeReads).toBeLessThanOrEqual(256); expect(trace.knowledgeBytes).toBeLessThanOrEqual(1024 * 1024);
        expect(trace.native).toHaveLength(commit.stats.reads);
        expect(trace.native.reduce((sum, row) => sum + row.bytes, 0)).toBe(commit.stats.readBytes);
        // This small native fixture fits even these stricter thresholds; transaction limits are unchanged.
        expect(commit.stats.reads).toBeLessThanOrEqual(256); expect(commit.stats.readBytes).toBeLessThanOrEqual(1024 * 1024);
        expect(commit.stats.readBytes + commit.stats.writeBytes).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.bytes);
      }
    }
    const [positive, links, unknown, passage] = batches, data = positive.result.observation!.data;
    expect(positive.result.disposition).toBe('applied');
    expect(data).toMatchObject({ scope: 'connections', coverage: 'indexed-exits', state: 'complete', room: { spaceId: setup.origin, kind: 'room' },
      connections: [{ room: { spaceId: setup.destination, kind: 'room' }, proof: { steps: 8, crossings: 2 } }] });
    const firstSeen = setup.prelude.find(frame => frame.sight!.header.spaces?.some(space =>
      space.spaceId === setup.destination && space.kind === 'room'))!;
    const index = firstSeen.sight!.header.spaces!.find(space => space.spaceId === setup.destination)!.index;
    const seen = firstSeen.sight!.cells[index];
    expect(data.connections).toEqual([{ room: { level: seen.at.level, spaceId: setup.destination, kind: 'room',
      anchor: { at: seen.at, world: seen.world, source: { sequence: firstSeen.knowledge.sequence,
        id: firstSeen.knowledge.id, index } } },
      proof: { digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/), steps: 8, crossings: 2 } }]);
    expect(data.next).toBeUndefined();
    expect(JSON.stringify(data.connections)).not.toContain(`"spaceId":"${setup.passage}"`);
    expect(links.result.disposition).toBe('applied');
    expect(JSON.stringify(links.result.observation!.data)).toContain(setup.passage);
    for (const refused of [unknown, passage]) {
      expect(refused.result.disposition).toBe('refused');
      expect(refused.result.observation!.data).toEqual({ scope: 'connections', state: 'refused', reason: 'not-known-room' });
    }
    const changed = await page.evaluate(async () => {
      const f = window.canonicalRoomConnections, before = await f.head(), moved = await f.move('west');
      return { before, moved, after: await f.head() };
    });
    expect(changed.after.checkpoint).not.toEqual(changed.before.checkpoint);
    expect(changed.after.roots.knowledge).not.toBe(changed.before.roots.knowledge);
    await attach('ordinary-new-knowledge.json', changed);
    await page.evaluate(() => window.canonicalRoomConnections.stop()); await page.reload();
    await page.waitForFunction(() => !!window.canonicalRoomConnections);
    const resumed = await page.evaluate(() => window.canonicalRoomConnections.resume());
    expect(resumed.epoch).toBeGreaterThan(changed.after.epoch);
    expect(resumed.roots.knowledge).toBe(changed.after.roots.knowledge);
    for (const phase of ['reload', 'stopped']) {
      if (phase === 'stopped') {
        const stop = await page.evaluate(() => window.canonicalRoomConnections.localStop());
        await attach('funded-local-stop.json', stop);
        expect(stop.launch.guard.terminal?.disposition).toBe('cancelled');
        expect(stop.repeated.receipt).toEqual(stop.cancelled.receipt);
        // Offline admission has no real remote settlement; its ACK reservation must remain.
        expect(stop.head.quota.reservations).toBe(1);
      }
      const replay = await page.evaluate(({ action, result }) => window.canonicalRoomConnections.replay(action, result),
        { action: positive.action, result: positive.result });
      await attach(`exact-replay-${phase}.json`, replay);
      expect(replay.value.loaded).toMatchObject({ status: 'completed', result: positive.result });
      expect(replay.value.repeated).toEqual(positive.result); expect(replay.value.reconciled).toEqual(positive.result);
      expect(replay.after).toEqual(replay.before); expect(replay.commits).toEqual([]); expect(replay.trace.writes).toEqual([]);
      expect(replay.trace.knowledgeReads).toBe(0);
      expect(replay.trace.native.filter(row => row.store === 'records').every(row => row.area === 'execution')).toBe(true);
    }
    expect(external).toEqual([]); expect(errors).toEqual([]);
  } finally { await page.evaluate(() => window.canonicalRoomConnections?.stop()); }
});
