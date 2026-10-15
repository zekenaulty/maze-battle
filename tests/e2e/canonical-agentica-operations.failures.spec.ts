import { test, expect } from './canonical-agentica-operations.test';

for (const phase of ['confirmation', 'custody', 'event', 'ack'] as const) for (const store of ['records', 'nodes', 'receipts', 'heads']) {
  test(`${phase} ${store} write failure rolls back all stores and original attempt retries`, async ({ page }) => {
    const r = await page.evaluate(async ({ phase, store }) => {
      const f = window.canonicalAgenticaOperations, s = await f.boot(), identity = await f.prepareAction(s.action);
      if (phase !== 'confirmation') await f.confirm(s.action, s.binding, s.entry);
      if (phase === 'event' || phase === 'ack') await f.acceptCustody(s.action, s.entry);
      if (phase === 'ack') await f.advance(s.action);
      const state = (await f.read(s.action)).value, entry = phase === 'custody' ? { ...s.entry, latestEvent: state!.confirmation.data.probe }
        : phase === 'ack' ? { ...s.entry, latestEvent: state!.event!.data.event } : s.entry;
      const request = await f.command(phase === 'confirmation' ? 'agentica.operation.confirm' : phase === 'event' ? 'navigation.advance'
        : phase === 'custody' ? 'agentica.operation.custody' : 'agentica.operation.ack',
        phase === 'confirmation' ? { action: identity.storageKey, binding: s.binding, entry }
          : phase === 'custody' ? { action: identity.storageKey, confirmation: state!.confirmation.reference, entry }
          : phase === 'event' ? { operationId: s.operationId, sequence: 0 } : { action: identity.storageKey, event: state!.event!.reference, entry });
      const run = () => phase === 'confirmation' ? f.confirm(s.action, s.binding, entry, request) : phase === 'event'
        ? f.advance(s.action, undefined, request) : phase === 'custody' ? f.custodyAck(s.action, entry, undefined, request) : f.ack(s.action, entry, undefined, request);
      const before = await f.dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.add = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return add.apply(this, args); };
      IDBObjectStore.prototype.put = function(...args) { if (this.name === store) throw new DOMException('Injected', 'QuotaExceededError'); return put.apply(this, args); };
      let error = '';
      try { await run(); } catch (cause) { error = String(cause); }
      finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
      const after = await f.dump(), retried = await run(), saved = await f.dump(), replay = await run();
      return { before, after, error, retried, saved, replay, afterReplay: await f.dump() };
    }, { phase, store });
    expect(r.error).toContain('QuotaExceededError'); expect(r.after).toBe(r.before); expect(r.retried.outcome.replayed).toBe(false);
    expect(r.replay.outcome.replayed).toBe(true); expect(r.afterReplay).toBe(r.saved);
  });
}

for (const target of ['confirmation', 'custody', 'event', 'ack'] as const) for (const damage of ['missing-record', 'missing-receipt', 'witness', 'source-input']) {
  test(`${target} ${damage} fails closed during read and next advance`, async ({ page }) => {
    const r = await page.evaluate(async ({ target, damage }) => {
      const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
      await f.acceptCustody(s.action, s.entry);
      const moved = await f.advance(s.action), saved = await f.ack(s.action, { ...s.entry, latestEvent: moved.state!.event!.data.event });
      const state = saved.state!, ref = target === 'confirmation' ? state.confirmation.reference : target === 'custody' ? state.custodyAck!.reference
        : target === 'event' ? state.event!.reference : state.acknowledgement!.reference;
      const head = (await f.readCanonicalHead()).head, db = await f.openCanonicalDatabase(), row = (await db.get('records', [head.gameId, ref.id]))!;
      const attempt = (row.value as { sourceAttemptId: string }).sourceAttemptId, receipt = (await db.get('receipts', [head.gameId, attempt]))!;
      if (damage === 'missing-record') await db.delete('records', [head.gameId, row.id]);
      if (damage === 'missing-receipt') await db.delete('receipts', [head.gameId, receipt.attemptId]);
      if (damage === 'witness') { (row.value as { schema: number }).schema = 99; await db.put('records', row, [head.gameId, row.id]); }
      if (damage === 'source-input') { const source = JSON.parse(receipt.fingerprint); source.input = { changed: true };
        receipt.fingerprint = f.fingerprint(source); await db.put('receipts', receipt, [head.gameId, receipt.attemptId]); }
      db.close(); const before = await f.dump(), read = await f.read(s.action).then(() => 'unexpected-success', String);
      const identity = await f.prepareAction(s.action), request = await f.command('navigation.advance', { operationId: s.operationId, sequence: 1 });
      const advance = await f.executeNavigationCommand(request, { host: f.operationProgressHooks(identity, state.confirmation.reference) }).then(() => 'unexpected-success', String);
      return { before, after: await f.dump(), read, advance };
    }, { target, damage });
    expect(r.read).toMatch(/^Error:/); expect(r.advance).toMatch(/^Error:/); expect(r.after).toBe(r.before);
  });
}

test('normal quota blocks progress ACK but funded navigation and launch cancellation/ACK remain usable', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
    await f.acceptCustody(s.action, s.entry);
    const moved = await f.advance(s.action), head = (await f.readCanonicalHead()).head, db = await f.openCanonicalDatabase();
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId); db.close(); const before = await f.dump();
    const error = await f.ack(s.action, { ...s.entry, latestEvent: moved.state!.event!.data.event }).catch(String), after = await f.dump();
    const cancelled = [];
    for (const operationId of [s.operationId, s.launchGuard]) {
      const cancel = await f.cancel(operationId);
      const terminal = operationId === s.operationId ? (await f.terminal(s.action, s.binding))! : null;
      const ack = terminal ? await f.terminalAck(s.action, s.binding, { ...s.entry, state: 'cancelled', latestEvent: terminal.event })
        : await f.launchAck();
      cancelled.push({ cancel, receipt: ack.receipt });
    }
    return { error, before, after, cancelled, state: (await f.read(s.action)).value };
  });
  expect(String(r.error)).toContain('quota exhausted'); expect(r.after).toBe(r.before);
  for (const item of r.cancelled) { expect(item.cancel.replayed).toBe(false); expect(item.receipt.result).toMatchObject({ phase: 'acknowledge' }); }
  expect(r.state!.event!.data.event.kind).toBe('progress'); expect(r.state!.acknowledgement).toBeNull();
  expect(r.state!.operation.state).toBe('acknowledged'); expect(r.state!.operation.terminal!.disposition).toBe('cancelled');
});
