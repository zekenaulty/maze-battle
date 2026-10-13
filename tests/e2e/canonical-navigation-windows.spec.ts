import { test, expect } from './canonical-navigation-test';

test('a retained route window replenishes from earned memory without resetting cumulative progress', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), spaces = (await c.world.floorTranscript()).value.spaces, positions = [];
    // Test-only placement earns ordinary observations; the executor never receives this geometry.
    for (const space of spaces) {
      const room = (await c.readCanonical(p => c.world.loadWorldRoom(p, 1, space.id))).value;
      const center = room.geometry.cells[Math.floor(room.geometry.cells.length / 2)];
      const position = { level: 1, cell: { spaceId: space.id, row: center.row, column: center.column } };
      positions.push(position); await c.content.place(position); await c.knowledge.act({ kind: 'look' });
    }
    await c.content.place(targets.start); await c.knowledge.act({ kind: 'look' });
    for (const target of positions) {
      const admission = await c.admit(target, { steps: null, replans: null, durationMs: null }), initial = await c.readDestination(admission.id);
      if (initial.value.progress.route.length === 16 && !c.same(initial.value.progress.route.at(-1)!.to, target)) {
        const routeLengths = [], states = [];
        for (let i = 0; i < 17; i++) {
          await c.advance(admission.id); const p = (await c.readDestination(admission.id)).value.progress;
          routeLengths.push(p.route.length); if (i >= 15) states.push(p);
        }
        const finished = await c.finish(admission.id); return { initial, routeLengths, states, finished };
      }
      const cancelled = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: admission.id }), 'cancel');
      await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
        operationId: admission.id, terminalAttemptId: cancelled.receipt.attemptId }), 'acknowledge');
    }
    throw Error('Fixture did not establish an earned route longer than one retained window');
  });
  expect(result.routeLengths.every(length => length <= 16)).toBe(true);
  expect(result.states[0]).toMatchObject({ steps: 16, sequence: 16, replans: 0, route: [], status: 'running' });
  expect(result.states[1]).toMatchObject({ steps: 17, sequence: 17, replans: 1 });
  expect(result.finished.value.status).toBe('arrived'); expect(result.finished.value.progress.startedAt).toBe(result.initial.value.progress.startedAt);
});

test('elapsed destination deadline persists across takeover and explicit adoption', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), now = Date.now;
    try {
      Date.now = () => 1000;
      const admission = await c.admit(targets.target, { steps: null, replans: null, durationMs: 100 }); await c.advance(admission.id);
      await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'next' }), 'takeover');
      await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.resume', { owner: 'next' }), 'resume');
      await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.adopt', { operationId: admission.id }), 'adopt');
      const before = await c.readDestination(admission.id); Date.now = () => 1100; await c.advance(admission.id);
      return { before, after: await c.readDestination(admission.id) };
    } finally { Date.now = now; }
  });
  expect(result.after.value.progress).toMatchObject({ startedAt: 1000, deadline: 1100, steps: 1, sequence: 2, reason: 'time-limit', status: 'blocked' });
  expect(result.after.head.checkpoint).toEqual(result.before.head.checkpoint);
  expect(result.after.head.roots.world).toBe(result.before.head.roots.world); expect(result.after.head.roots.knowledge).toBe(result.before.head.roots.knowledge);
});

test('aborted, expired and stale-owner advances leave all state unchanged', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.target), head = (await c.readCanonicalHead()).head;
    const request = c.command(head, 'navigation.advance', { operationId: admission.id, sequence: 0 }), before = await c.dump();
    const controller = new AbortController(); controller.abort();
    const errors = [await c.executeNavigationCommand(request, { signal: controller.signal }).catch(String),
      await c.executeNavigationCommand({ ...request, deadlineAt: 1 }).catch(String),
      await c.executeNavigationCommand({ ...request, expected: { ...request.expected, owner: 'stale' } }).catch(String)];
    return { errors, before, after: await c.dump() };
  });
  expect(result.errors.every(value => typeof value === 'string')).toBe(true); expect(result.after).toEqual(result.before);
});
