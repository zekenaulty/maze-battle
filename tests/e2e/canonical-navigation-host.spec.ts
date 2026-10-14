import { test, expect } from './canonical-navigation-test';

test('host action/event refs and post-movement evidence commit in the navigation transaction; bookkeeping does not reinterpret publication tokens', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), published = (await c.readCanonicalHead()).head;
    await c.executeCanonical(c.command(published, 'fixture.publication'), async tx => {
      await tx.pages.set('execution', 'fixture/publication', c.json({ ...published, world: published.roots.world, knowledge: published.roots.knowledge })); return null;
    });
    const current = (await c.readCanonicalHead()).head, request = c.command(current, 'operation.admit', { operationId: 'composed',
      binding: c.json(c.createDestinationBinding(targets.adjacent)), terminalBytes: c.MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' });
    const admission = await c.executeNavigationCommand(request, { host: c.fixtureHost({ publicationKey: 'fixture/publication' }) });
    const active = await c.readDestination('composed');
    const step = await c.executeNavigationCommand(c.command(active.head, 'navigation.advance', { operationId: 'composed', sequence: 0 }), { host: c.fixtureHost() });
    const settle = await c.executeNavigationCommand(c.command((await c.readCanonicalHead()).head, 'operation.settle', {
      operationId: 'composed', disposition: 'completed' }), { host: c.fixtureHost() });
    const rows = await c.readCanonical(async p => {
      const rows = [];
      for (const result of [admission, step, settle]) for (const ref of Object.values((result.receipt.result as any).host) as any[]) {
        rows.push({ ref, record: await p.get('execution', ref.key), receipt: result.receipt });
      }
      return rows;
    });
    return { published, current, admission, active, step, settle, rows: rows.value, terminal: (await c.readDestinationTerminal('composed')).value };
  });
  expect(result.current.revision).toBeGreaterThan(result.published.revision); expect(result.active.value.operation.state).toBe('admitted');
  for (const item of result.rows) {
    expect(item.record?.id).toBe(item.ref.recordId); expect(item.ref.revision).toBe(item.receipt.afterRevision);
    expect(item.ref.sourceAttemptId).toBe(item.receipt.attemptId); expect(item.receipt.afterRevision).toBe(item.receipt.beforeRevision + 1);
  }
  expect((result.rows[2].record?.value as any).knowledge).toEqual(result.step.head?.checkpoint.knowledge);
  expect((result.rows[2].record?.value as any).position).toEqual(result.step.head?.checkpoint.position);
  expect(result.terminal.terminal.ref.attemptId).toBe(result.settle.receipt.attemptId);
});

for (const phase of ['admit', 'step', 'settle'] as const) test(`${phase}: hook failure rolls back all stores and retry/replay preserve exact host refs`, async ({ page }) => {
  const result = await page.evaluate(async phase => {
    const c = window.canonicalNavigation, request = await c.hostPhase(phase), before = await c.dump();
    const error = await c.executeNavigationCommand(request, { host: c.fixtureHost({ fail: true }) }).catch(String), after = await c.dump();
    const committed = await c.executeNavigationCommand(request, { host: c.fixtureHost() });
    await c.knowledge.act({ kind: 'look' }); const later = await c.dump();
    const replay = await c.executeNavigationCommand(request, { host: { prepare: async () => { throw Error('must not run'); }, commit: async () => { throw Error('must not run'); } } });
    return { error, before, after, committed, replay, later, final: await c.dump() };
  }, phase);
  expect(result.error).toContain('host commit refused'); expect(result.after).toEqual(result.before);
  expect(result.replay.receipt).toEqual(result.committed.receipt); expect(result.replay.stats).toMatchObject({ reads: 2, writes: 0 });
  expect(result.final).toEqual(result.later);
});

test('prepare can reject a stale retained publication at the current canonical fence before any admission', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), published = (await c.readCanonicalHead()).head;
    await c.executeCanonical(c.command(published, 'fixture.publication'), async tx => {
      await tx.pages.set('execution', 'fixture/publication', c.json({ ...published, world: published.roots.world, knowledge: published.roots.knowledge })); return null;
    });
    await c.knowledge.act({ kind: 'look' });
    const request = c.command((await c.readCanonicalHead()).head, 'operation.admit', { operationId: 'stale-publication',
      binding: c.json(c.createDestinationBinding(targets.target)), terminalBytes: c.MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' }), before = await c.dump();
    const error = await c.executeNavigationCommand(request, { host: c.fixtureHost({ publicationKey: 'fixture/publication' }) }).catch(String);
    return { before, after: await c.dump(), error };
  });
  expect(result.error).toContain('publication changed'); expect(result.after).toEqual(result.before);
});

test('native failure while adding the composed event rolls back movement and both host records', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, request = await c.hostPhase('step'), before = await c.dump(), add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(...args) {
      if (this.name === 'records' && args[0]?.key === `fixture/host/${request.attemptId}/event`) throw new DOMException('Injected', 'QuotaExceededError');
      return add.apply(this, args);
    };
    let error = '';
    try { await c.executeNavigationCommand(request, { host: c.fixtureHost() }); } catch (cause) { error = String(cause); }
    finally { IDBObjectStore.prototype.add = add; }
    return { before, after: await c.dump(), error };
  });
  expect(result.error).toContain('QuotaExceededError'); expect(result.after).toEqual(result.before);
});
