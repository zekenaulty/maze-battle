import { test, expect } from './canonical-frontier.test';

for (const phase of ['admit', 'advance'] as const) for (const store of ['records', 'nodes', 'receipts', 'heads']) {
  test(`${phase}: failed ${store} write rolls back frontier custody, movement and sight`, async ({ page }) => {
    const result = await page.evaluate(async ({ phase, store }) => {
      const c = window.canonicalFrontier, seeded = await c.seed(), selection = seeded.page.value[0];
      const id = phase === 'admit' ? crypto.randomUUID() : (await c.admit(selection)).id;
      const head = (await c.readCanonicalHead()).head;
      const request = phase === 'admit' ? c.command(head, 'operation.admit', { operationId: id,
        binding: c.json(c.createFrontierBinding(selection)), terminalBytes: c.MIN_TERMINAL_BYTES })
        : c.command(head, 'navigation.advance', { operationId: id, sequence: 0 });
      const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      let injections = 0;
      IDBObjectStore.prototype.add = function(...args) {
        if (this.name === store) { injections++; throw new DOMException('Injected frontier failure', 'QuotaExceededError'); }
        return add.apply(this, args);
      };
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === store) { injections++; throw new DOMException('Injected frontier failure', 'QuotaExceededError'); }
        return put.apply(this, args);
      };
      let failure;
      try { failure = await c.refusal(() => c.executeNavigationCommand(request)); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      const after = await c.dump(), retry = await c.executeNavigationCommand(request), current = await c.readDestination(id);
      const afterRetry = await c.dump(), replay = await c.executeNavigationCommand(request);
      return { injections, failure, before, after, retry, current, afterRetry, replay, afterReplay: await c.dump() };
    }, { phase, store });
    expect(result.injections).toBeGreaterThan(0); expect(result.failure!.rejected).toBe(true);
    expect(result.failure!.message).toContain('QuotaExceededError'); expect(result.after).toBe(result.before);
    expect(result.retry.replayed).toBe(false); expect(result.current.value.progress.steps).toBe(phase === 'admit' ? 0 : 1);
    expect(result.current.head.quota.reservations).toBe(1);
    expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(result.retry.receipt);
    expect(result.afterReplay).toBe(result.afterRetry);
  });
}

test('two concurrent deliveries of the exact advance commit only one approach step', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), admission = await c.admit(seeded.page.value[0]);
    const before = await c.readDestination(admission.id), request = c.command(before.head, 'navigation.advance', { operationId: admission.id, sequence: 0 });
    const replies = await Promise.all([c.executeNavigationCommand(request), c.executeNavigationCommand(request)]);
    return { before, replies, after: await c.readDestination(admission.id) };
  });
  expect(result.replies.map(reply => reply.replayed).sort()).toEqual([false, true]);
  expect(result.replies[0].receipt).toEqual(result.replies[1].receipt);
  expect(result.after.value.progress).toMatchObject({ sequence: 1, steps: 1 });
  expect(result.after.head.revision).toBe(result.before.head.revision + 1);
});

test('bounded approach consumes its original step allowance without extending to another frontier', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), selection = seeded.page.value[0];
    const admission = await c.admit(selection, { steps: 1, replans: 0, durationMs: null });
    const original = await c.readDestination(admission.id);
    if (original.value.progress.route.length !== 1 || c.same(original.value.progress.route[0].to, selection.at))
      throw Error('Step-bound fixture requires an anchor farther than one step');
    await c.advance(admission.id); const terminal = await c.finish(admission.id), effects = await c.effects();
    const before = await c.dump(), refused = await c.refusal(() => c.advance(admission.id));
    return { original, terminal, effects, before, after: await c.dump(), refused };
  });
  expect(result.terminal.value.progress).toMatchObject({ status: 'blocked', reason: 'step-limit', steps: 1,
    binding: result.original.value.progress.binding, startedAt: result.original.value.progress.startedAt, deadline: null });
  expect(result.refused.rejected).toBe(true); expect(result.after).toBe(result.before);
  expect(result.effects.targets.every(target => !target.contract?.accepted && !target.chest?.chest.opened)).toBe(true);
});
