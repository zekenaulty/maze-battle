import { test, expect, ready, reload } from './canonical-decision-ack.test';

for (const state of ['waking', 'continued', 'completed', 'blocked', 'cancelled']) for (const claimFirst of [false, true])
  test(`${claimFirst ? 'waking claim to current' : 'already settled claim'} ${state} ACK releases only navigation`, async ({ page }, info) => {
    const { seed, proof } = await ready(page, claimFirst);
    const r = await page.evaluate(async ({ proof, state, claimFirst }) => {
      const c = window.canonicalDecisionAck, entry = structuredClone(proof.entry);
      if (state !== 'waking') Object.assign(entry, { state, settledUsage: { ...entry.usage, continuations: entry.usage.continuations + 1 } });
      if (!claimFirst) await c.claim({ ...proof, entry });
      const before = await c.state(), ack = await c.ack(entry), after = await c.state();
      return { before, ack, after, entry };
    }, { proof, state, claimFirst });
    expect(r.after.terminal!.operation.state).toBe('acknowledged');
    expect(r.ack.request.input).toMatchObject({ operationId: seed.operationId, proof: { delivery: 'decision-handoff',
      decision: { intent: r.before.intent!.reference, claim: r.before.claim!.reference }, remote: { state } } });
    expect(r.after.head.allocations[seed.operationId]).toBeUndefined();
    expect(r.after.head.allocations[seed.launchGuard]).toEqual(r.before.head.allocations[seed.launchGuard]);
    expect(r.after.terminal!.guard).toEqual(r.before.terminal!.guard);
    expect(r.after.terminal!.grant).toEqual(r.before.terminal!.grant); expect(r.after.terminal!.run).toEqual(r.before.terminal!.run);
    expect(r.after.terminal!.original).toEqual(r.before.terminal!.original);
    expect(r.after.terminal!.event).toEqual(r.before.terminal!.event); expect(r.after.terminal!.event.kind).toBe('decision');
    expect(r.after.head.checkpoint).toEqual(r.before.head.checkpoint); expect(r.after.head.roots).toEqual(r.before.head.roots);
    expect(r.after.claim).toEqual(r.before.claim); expect(r.after.intent).toEqual(r.before.intent);
    expect(r.after.stats.writes).toBe(0); expect(r.after.stats.reads).toBeLessThan(2048);
    await info.attach('funded-decision-ack.json', { contentType: 'application/json', body: JSON.stringify({ request: r.ack.request,
      receipt: r.ack.receipt, historicalRead: r.after.stats, originalGuard: r.before.terminal!.guard, afterGuard: r.after.terminal!.guard }) });
    await reload(page, seed);
    const historical = await page.evaluate(async () => { const c = window.canonicalDecisionAck, before = await c.dump();
      return { state: await c.state(), unchanged: before === await c.dump() }; });
    expect(historical.state.terminal).toEqual(r.after.terminal); expect(historical.unchanged).toBe(true);
  });

test('new owner explicit decision adoption ACK preserves original operation and launch custody', async ({ page }) => {
  const seed = await page.evaluate(() => window.canonicalDecisionAck.boot()); await reload(page, seed, true);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecisionAck; await c.prepare(); const proof = await c.proof(); await c.claim(proof);
    const before = await c.state(); await c.ack(proof.entry); return { before, after: await c.state(), proof };
  });
  expect(r.before.intent!.data.adoption!.nextSessionEpoch).toBe(String(r.before.head.epoch));
  expect(r.proof.entry.activeEpoch).not.toBe(seed.action.sessionEpoch);
  expect(r.after.terminal!.operation.state).toBe('acknowledged'); expect(r.after.terminal!.guard).toEqual(r.before.terminal!.guard);
  expect(r.after.terminal!.original).toEqual(r.before.terminal!.original); expect(r.after.claim).toEqual(r.before.claim);
});

test('original signal and stopped-without-wake decision proofs remain separate', async ({ page }) => {
  const seed = await page.evaluate(() => window.canonicalDecisionAck.boot(false));
  const r = await page.evaluate(async seed => {
    const c = window.canonicalDecisionAck; await c.cancel(false); const before = await c.state();
    const entry = { ...seed.entry, latestEvent: before.terminal!.event, state: 'cancelled' };
    const rejected = await c.ack(entry).then(() => 'accepted', String);
    await c.ack(entry, 'signal'); return { rejected, after: await c.state() };
  }, seed);
  expect(r.rejected).not.toBe('accepted'); expect(r.after.terminal!.operation.state).toBe('acknowledged');
});

test('original stop-decision without a successor still ACKs at quota', async ({ page }) => {
  const seed = await page.evaluate(() => window.canonicalDecisionAck.boot());
  const r = await page.evaluate(async seed => {
    const c = window.canonicalDecisionAck; await c.cancel(); const quota = await c.quota(), before = await c.state();
    const entry = { ...seed.entry, latestEvent: before.terminal!.event, state: 'cancelled', stopDecision: before.terminal!.event };
    await c.ack(entry, 'stop-decision'); return { quota, after: await c.state() };
  }, seed);
  expect(r.quota).not.toBe('accepted'); expect(r.after.terminal!.operation.state).toBe('acknowledged');
  expect(r.after.terminal!.guard.state).toBe('settled'); expect(r.after.head.allocations[seed.launchGuard]).toBeDefined();
});
