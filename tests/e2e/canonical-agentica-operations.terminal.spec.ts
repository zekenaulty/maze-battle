import { test, expect } from './canonical-agentica-operations.test';
import { bootDriver, cancel, fillQuota, peer, pulse } from './canonical-agentica-operations.terminal-support';

test('Stop before confirmation cancels at quota and verifies terminal without ordinary outbox or custody writes', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry); await fillQuota(page); await cancel(page);
  const terminal = await page.evaluate(s => window.canonicalAgenticaOperations.terminal(s.action, s.binding), s);
  expect(terminal!.event).toMatchObject({ kind: 'cancelled', sequence: 1, usage: { steps: 0 } });
  expect(terminal!.confirmed).toBeNull();
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  const ack = await page.evaluate(s => window.canonicalAgenticaOperations.terminal(s.action, s.binding), s);
  expect(ack!.event).toEqual(terminal!.event); expect(ack!.bound.operation.state).toBe('acknowledged');
  expect(service.deliveries).toEqual([terminal!.event]);
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  expect(service.deliveries).toHaveLength(1);
});

test('lost custody ACK and quota pressure do not block Stop or cause stale probe replay', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry); await pulse(page); service.loseNext('progress');
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().catch(String))).toContain('fetch');
  await fillQuota(page); await cancel(page);
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  expect(service.deliveries.map(e => [e.sequence, e.kind])).toEqual([[1, 'progress'], [2, 'cancelled']]);
  const state = (await page.evaluate(a => window.canonicalAgenticaOperations.read(a), s.action)).value!;
  expect(state.custodyAck).toBeNull(); expect(state.progress.steps).toBe(0); expect(state.operation.state).toBe('acknowledged');
});

test('cancelled pending step flushes exact prefix without needing ordinary ACK writes at quota', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry); await pulse(page); await pulse(page); await pulse(page);
  const before = (await page.evaluate(a => window.canonicalAgenticaOperations.read(a), s.action)).value!;
  await fillQuota(page); await cancel(page);
  expect(await pulse(page)).toEqual({ status: 'terminal-prefix-delivered', sequence: 2 });
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  expect(service.deliveries[1]).toEqual(before.event!.data.event);
  expect(service.deliveries.map(e => e.kind)).toEqual(['progress', 'progress', 'cancelled']);
  const after = (await page.evaluate(a => window.canonicalAgenticaOperations.read(a), s.action)).value!;
  expect(after.progress).toEqual(before.progress); expect(after.acknowledgement).toBeNull();
});

test('lost terminal response survives reload and releases reserve only after exact inventory reconciliation', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry); await cancel(page); service.loseNext('cancelled');
  expect(await page.evaluate(() => window.canonicalAgenticaOperations.pulseDriver().catch(String))).toContain('fetch');
  const before = await page.evaluate(s => window.canonicalAgenticaOperations.terminal(s.action, s.binding), s);
  expect(before!.bound.operation.state).toBe('settled');
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaOperations);
  await page.evaluate(async s => { const f = window.canonicalAgenticaOperations; await f.resume(); await f.attachDriver(s.action, s.binding); }, s);
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  const after = await page.evaluate(s => window.canonicalAgenticaOperations.terminal(s.action, s.binding), s);
  expect(after!.event).toEqual(before!.event); expect(after!.bound.progress).toEqual(before!.bound.progress);
  expect(service.deliveries).toHaveLength(1);
});

test('arrival is not objective completion or cognition; explicit Stop cancels the original decision', async ({ page }) => {
  const s = await bootDriver(page), service = await peer(page, s.entry);
  await pulse(page); await pulse(page);
  for (let i = 0; i < 3; i++) { await pulse(page); if (i < 2) await pulse(page); }
  expect(await pulse(page)).toEqual({ status: 'locally-settled', progress: 'arrived' });
  const decision = await pulse(page);
  expect(decision).toMatchObject({ status: 'decision-required', event: { kind: 'decision', sequence: 5 } });
  expect('event' in decision && decision.event).not.toHaveProperty('completion'); expect(service.stops).toHaveLength(0);
  const count = service.deliveries.length; await pulse(page); expect(service.deliveries).toHaveLength(count);
  await fillQuota(page); await cancel(page);
  expect(await pulse(page)).toEqual({ status: 'terminal-prefix-delivered', sequence: 4 });
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'decision' });
  expect(service.stops).toEqual(['event' in decision ? decision.event : null]);
  expect(service.entry()).toMatchObject({ state: 'cancelled' }); expect(service.entry().wakeRunId).toBeUndefined();
});

for (const field of ['event', 'state', 'action', 'admission', 'usage'] as const)
  test(`changed terminal acknowledgement ${field} cannot release reservation`, async ({ page }) => {
    const s = await bootDriver(page); await pulseSetup();
    async function pulseSetup() { await peer(page, s.entry); await pulse(page); await cancel(page); }
    const r = await page.evaluate(async ({ s, field }) => {
      const f = window.canonicalAgenticaOperations, t = (await f.terminal(s.action, s.binding))!;
      const entry = structuredClone({ ...s.entry, state: 'cancelled', latestEvent: t.event });
      if (field === 'event') entry.latestEvent.eventId = 'wrong-event';
      if (field === 'state') entry.state = 'parked';
      if (field === 'action') entry.action.arguments = {};
      if (field === 'admission') entry.admission!.summary = 'changed original';
      if (field === 'usage') entry.usage.providerCalls++;
      const before = await f.dump(), error = await f.terminalAck(s.action, s.binding, entry).then(() => 'accepted', String);
      return { error, unchanged: before === await f.dump() };
    }, { s, field });
    expect(r.error).not.toBe('accepted'); expect(r.unchanged).toBe(true);
  });

test('generic cleanup cannot bypass an agent operation policy even if its action link is removed', async ({ page }) => {
  const s = await bootDriver(page);
  const r = await page.evaluate(async s => {
    const f = window.canonicalAgenticaOperations, head = (await f.readCanonicalHead()).head, db = await f.openCanonicalDatabase();
    const operation = (await db.get('operations', [head.gameId, s.operationId]))!;
    const source = (await db.get('receipts', [head.gameId, operation.admissionAttemptId]))!;
    delete (source.result as { host?: unknown }).host; await db.put('receipts', source, [head.gameId, source.attemptId]); db.close();
    const stopped = await f.cancel(s.operationId), before = await f.dump();
    const error = await f.operateCanonical(await f.command('operation.acknowledge', { operationId: s.operationId,
      terminalAttemptId: stopped.receipt.attemptId }), 'acknowledge').then(() => 'accepted', String);
    return { error, unchanged: before === await f.dump() };
  }, s);
  expect(r.error).toContain('acknowledgement policy'); expect(r.unchanged).toBe(true);
});
