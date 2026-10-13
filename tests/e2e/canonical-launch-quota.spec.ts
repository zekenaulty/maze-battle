import { expect, test } from './canonical-launch.test';

test('funded Stop and ACK need no ordinary launch write at exhausted normal quota, even after global Stop', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); await c.fillNormalCapacity();
    const before = await c.dump(), refused = await c.gate().catch(String), after = await c.dump();
    const head = (await c.readCanonicalHead()).head;
    await c.controlCanonical(c.command(head, 'control.stop', { owner: head.owner }), 'stop');
    const stopped = await c.stop(), terminal = (await c.readLaunchTerminal('launch')).value;
    const acknowledged = await c.ack(stopped.request.attemptId), final = await c.readLaunch(), finalTerminal = (await c.readLaunchTerminal('launch')).value;
    return { before, after, refused, stopped, acknowledged, terminal, finalTerminal, final, dump: await c.dump() };
  });
  expect(String(r.refused)).toContain('quota exhausted'); expect(r.after).toEqual(r.before);
  expect(r.terminal).toEqual(r.finalTerminal); expect(r.terminal.terminal.receipt).toEqual(r.stopped.outcome.receipt);
  expect(r.final.value!.guard.state).toBe('acknowledged'); expect(r.final.head.quota.reservations).toBe(0); expect(r.final.head.quota.reservedBytes).toBe(0);
  expect(r.final.head.quota.usedBytes).toBe(r.dump.bytes);
});

test('ambiguous start remains ambiguous at quota, but local cancellation and acknowledgement are funded', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed()); await c.transition('dispatch'); await c.fillNormalCapacity();
    const before = await c.dump(), announcement = await c.announce().catch(String), after = await c.dump();
    const stop = await c.stop(); await c.ack(stop.request.attemptId);
    return { before, after, announcement, retained: (await c.readLaunch()).value, terminal: (await c.readLaunchTerminal('launch')).value };
  });
  expect(String(r.announcement)).toContain('quota exhausted'); expect(r.after).toEqual(r.before);
  expect(r.retained!.dispatch).not.toBeNull(); expect(r.retained!.run).toBeNull(); expect(r.retained!.guard.state).toBe('acknowledged');
  expect(r.terminal.terminal.source.operation).toBe('operation.cancel');
});

for (const stage of ['admit', 'dispatch', 'announce', 'grant'] as const) for (const store of ['records', 'nodes', 'receipts', 'heads', ...(stage === 'admit' ? ['operations'] : [])])
  test(`${stage}: native ${store} failure rolls back the whole lifecycle transition`, async ({ page }) => {
    const r = await page.evaluate(async ({ stage, store }) => {
      const c = window.canonicalLaunch, binding = await c.seed();
      if (stage !== 'admit') await c.admit(binding);
      if (stage === 'announce' || stage === 'grant') await c.transition('dispatch');
      if (stage === 'grant') await c.announce();
      const current = stage === 'admit' ? null : (await c.readLaunch()).value!, head = (await c.readCanonicalHead()).head;
      const request = stage === 'admit' ? c.command(head, 'operation.admit', { operationId: c.launchGuardId('launch'), binding, terminalBytes: 128 * 1024 })
        : c.command(head, `agentica.launch.${stage}`, { launchId: 'launch', ...(stage === 'dispatch' ? {} : stage === 'announce'
          ? { dispatch: { ...current!.dispatch!.ref }, started: c.launchStartedFixture(current!.binding.start) as never }
          : { run: { ...current!.run!.ref }, publication: { ...current!.binding.publication } }) });
      const before = await c.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
      IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
      let error = '';
      try { await c.executeLaunchCommand(request); } catch (cause) { error = String(cause); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      const after = await c.dump(), retry = await c.executeLaunchCommand(request), exact = await c.executeLaunchCommand(request);
      return { before, after, error, retry, exact };
    }, { stage, store });
    expect(r.error).toContain('QuotaExceededError'); expect(r.after).toEqual(r.before); expect(r.retry.replayed).toBe(false);
    expect(r.exact.replayed).toBe(true); expect(r.exact.receipt).toEqual(r.retry.receipt);
  });
