import { test, expect } from '@playwright/test';
import type {} from './canonical-agentica-actions.fixture';

test('graph replies and malformed-cursor refusals replay exactly after reload and takeover', async ({ page, context }) => {
  const errors: string[] = [], external: string[] = [], origin = 'http://127.0.0.1:5236';
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === `${origin}/@vite/client`) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (new URL(url).origin === origin) return route.continue();
    external.push(url); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => { external.push(socket.url()); socket.close(); });
  await page.goto('/tests/e2e/canonical-agentica-actions.html');
  await page.waitForFunction(() => !!window.canonicalAgenticaActions);
  const original = await page.evaluate(async () => {
    const f = window.canonicalAgenticaActions, fixture = await f.boot(), rows = [];
    for (const scope of ['map', 'links']) {
      const query = scope === 'map' ? { scope, level: fixture.actor.level }
        : { scope, level: fixture.actor.level, spaceId: fixture.actor.spaceId };
      for (const malformed of [false, 'syntax', 'membership']) {
        const inner = { schema: 1, scope: scope === 'map' ? 'nodes' : 'links', level: query.level,
          ...(scope === 'map' ? { kind: 'room' } : { spaceId: fixture.actor.spaceId }), anchor: fixture.source,
          after: scope === 'map' ? { spaceId: fixture.actor.spaceId, ordinal: 999 } : 'a'.repeat(64) };
        const args = { ...query, ...(malformed ? { cursor: JSON.stringify({ schema: 1,
          publication: fixture.publication, query, after: malformed === 'syntax' ? 'not-json' : JSON.stringify(inner) }) } : {}) };
        const action = await f.action('maze.inspect', args), reply = await f.dispatch(action);
        rows.push({ scope, malformed, action, reply, record: await f.retained(action), size: f.bytes(reply) });
      }
    }
    const head = await f.head(), trace = f.trace(); f.stop(); return { fixture, head, rows, trace };
  });
  expect(original.trace.statuses).toEqual([]);
  expect(original.trace.invocations).toBe(6);
  for (const row of original.rows) {
    expect(row.reply.disposition).toBe(row.malformed ? 'refused' : 'applied');
    if (row.malformed === 'membership') expect(row.reply.summary).toBe('Inspection cursor is not a valid continuation.');
    expect(row.record.value!.result).toEqual(row.reply);
    expect(row.size).toBeLessThanOrEqual(4096);
    if (!row.malformed) expect(row.reply.observation!.data.scope).toBe(row.scope);
  }
  expect(original.head.checkpoint).toEqual(original.fixture.head.checkpoint);
  expect(original.head.roots.knowledge).toBe(original.fixture.head.roots.knowledge);
  expect(original.head.roots.world).toBe(original.fixture.head.roots.world);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaActions);
  const replay = await page.evaluate(async actions => {
    const f = window.canonicalAgenticaActions, before = await f.resume(), replies = [];
    try {
      for (const action of actions) replies.push({ reply: await f.dispatch(action),
        reconcile: await f.dispatch(action, 'action.reconcile'), record: await f.retained(action) });
      return { before, after: await f.head(), replies, trace: f.trace() };
    } finally { f.stop(); }
  }, original.rows.map(row => row.action));
  expect(replay.before.owner).not.toBe(original.head.owner);
  expect(replay.before.epoch).toBeGreaterThan(original.head.epoch);
  expect(replay.after).toEqual(replay.before);
  replay.replies.forEach((row, index) => {
    expect(row.reply).toEqual(original.rows[index].reply);
    expect(row.reconcile).toEqual(row.reply); expect(row.record).toEqual(original.rows[index].record);
  });
  expect(replay.trace.invocations).toBe(0); expect(replay.trace.statuses).toEqual([]);
  expect(errors).toEqual([]); expect(external).toEqual([]);
});
