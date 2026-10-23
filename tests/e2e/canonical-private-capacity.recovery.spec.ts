import { expect, test } from './canonical-private-capacity.test';
import type { PolicyFault } from './canonical-private-capacity.support';

for (const fault of ['missing', 'tampered', 'overbooked'] as PolicyFault[]) test(`${fault}: funded cleanup survives stopped takeover, recovery claim and reload`, async ({ page }, info) => {
  const saved = await page.evaluate(async fault => {
    const c = window.privateCapacityFixture, original = await c.seed(), damaged = await c.damagePolicy(fault), before = await c.dump();
    const takeover = c.command(damaged.head, 'control.takeover', { owner: 'rescuer' });
    const taken = await c.controlCanonical(takeover, 'takeover');
    return { original, damaged, before, takeover, taken, terminalBytes: c.MIN_TERMINAL_BYTES,
      acknowledgementBytes: c.ACKNOWLEDGEMENT_BYTES, afterTakeover: await c.dump() };
  }, fault);
  await page.reload(); await page.waitForFunction(() => !!window.privateCapacityFixture);
  const r = await page.evaluate(async wire => {
    const input = JSON.parse(wire) as typeof saved;
    const c = window.privateCapacityFixture;
    const claim = c.command(await c.current(), 'control.claim', { owner: 'cleanup-owner', recovery: true });
    const claimed = await c.controlCanonical(claim, 'claim'), stopped = await c.current();
    const stale = await c.refusal(() => c.operateCanonical(c.command(input.damaged.head, 'operation.cancel', { operationId: 'funded-original' }), 'cancel'));
    const expiredInput = c.command(stopped, 'operation.cancel', { operationId: 'funded-original' }); expiredInput.deadlineAt = 0;
    const expired = await c.refusal(() => c.operateCanonical(expiredInput, 'cancel'));
    const cancel = c.command(stopped, 'operation.cancel', { operationId: 'funded-original' });
    const cancelled = await c.operateCanonical(cancel, 'cancel'), terminal = await c.current();
    const wrongAck = await c.refusal(() => c.operateCanonical(c.command(terminal, 'operation.acknowledge', {
      operationId: 'funded-original', terminalAttemptId: 'not-original-terminal' }), 'acknowledge'));
    const ack = c.command(terminal, 'operation.acknowledge', { operationId: 'funded-original', terminalAttemptId: cancel.attemptId });
    const acknowledged = await c.operateCanonical(ack, 'acknowledge');
    const final = await c.readCanonical(p => p.liveOperation('funded-original')), beforeReplay = await c.dump();
    const replays = [await c.controlCanonical(input.takeover, 'takeover'), await c.controlCanonical(claim, 'claim'),
      await c.operateCanonical(cancel, 'cancel'), await c.operateCanonical(ack, 'acknowledge')];
    return { claim, claimed, stopped, stale, expired, cancel, cancelled, terminal, wrongAck, ack, acknowledged,
      final, beforeReplay, replays, after: await c.dump() };
  }, JSON.stringify(saved));
  await info.attach('funded-cleanup.json', { body: JSON.stringify({ saved, r }, null, 2), contentType: 'application/json' });
  expect(saved.afterTakeover.domain).toBe(saved.before.domain); expect(saved.taken.head).toMatchObject({ owner: 'rescuer', status: 'stopped' });
  for (const head of [saved.taken.head!, r.stopped, r.terminal, r.final.head]) {
    expect(head.roots).toEqual(saved.damaged.head.roots); expect(head.checkpoint).toEqual(saved.damaged.head.checkpoint);
    expect(head.generation).toBe(saved.damaged.head.generation); expect(head.gameId).toBe(saved.damaged.head.gameId);
    expect(Object.hasOwn(head.quota, 'privateCapacity')).toBe(Object.hasOwn(saved.damaged.head.quota, 'privateCapacity'));
    expect(Reflect.get(head.quota, 'privateCapacity')).toEqual(Reflect.get(saved.damaged.head.quota, 'privateCapacity'));
  }
  expect(r.stopped).toMatchObject({ owner: 'cleanup-owner', status: 'stopped', epoch: saved.damaged.head.epoch + 2 });
  for (const [refusal, message] of [[r.stale, 'stale owner or revision'], [r.expired, 'deadline expired'], [r.wrongAck, 'terminal acknowledgement changed']] as const) {
    expect(refusal.error).toContain(message); expect(refusal.after).toEqual(refusal.before);
  }
  expect(r.terminal.quota.reservedBytes).toBe(saved.damaged.head.quota.reservedBytes - saved.terminalBytes);
  expect(r.terminal.allocations['funded-original'].bytes).toBe(saved.acknowledgementBytes);
  expect(r.terminal.quota.usedBytes - r.stopped.quota.usedBytes).toBeLessThanOrEqual(saved.damaged.head.allocations['funded-original'].bytes - r.terminal.allocations['funded-original'].bytes);
  expect(r.final.head.quota.usedBytes - r.terminal.quota.usedBytes).toBeLessThanOrEqual(r.terminal.allocations['funded-original'].bytes);
  expect(r.final.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0, usedBytes: r.after.bytes });
  expect(r.final.head.allocations).toEqual({}); expect(r.final.head.status).toBe('stopped');
  expect(r.final.value).toMatchObject({ state: 'acknowledged', admissionAttemptId: saved.original.admission.attemptId,
    acknowledgementAttemptId: r.ack.attemptId, binding: { source: saved.original.effect.attemptId, target: 'fixture-known' },
    terminal: { disposition: 'cancelled', attemptId: r.cancel.attemptId } });
  expect(r.after.domain).toBe(saved.before.domain); expect(r.after).toEqual(r.beforeReplay);
  expect(r.replays.map(x => x.replayed)).toEqual([true, true, true, true]);
  expect(r.replays.map(x => x.receipt)).toEqual([saved.taken.receipt, r.claimed.receipt, r.cancelled.receipt, r.acknowledged.receipt]);
});

for (const source of ['admission', 'terminal'] as const) test(`invalid policy does not bypass missing ${source} cleanup evidence`, async ({ page }, info) => {
  const r = await page.evaluate(async source => {
    const c = window.privateCapacityFixture, original = await c.seed(); await c.damagePolicy('tampered');
    const cancel = c.command(await c.current(), 'operation.cancel', { operationId: 'funded-original' });
    if (source === 'terminal') await c.operateCanonical(cancel, 'cancel');
    const head = await c.current(), db = await c.openCanonicalDatabase();
    try { await db.delete('receipts', [head.gameId, source === 'admission' ? original.admission.attemptId : cancel.attemptId]); }
    finally { db.close(); }
    const result = await c.refusal(() => source === 'admission' ? c.operateCanonical(cancel, 'cancel')
      : c.operateCanonical(c.command(head, 'operation.acknowledge', { operationId: 'funded-original', terminalAttemptId: cancel.attemptId }), 'acknowledge'));
    return { source, original, cancel, head, result, final: await c.current() };
  }, source);
  await info.attach('missing-source.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  expect(r.result.error).toContain('missing operation source receipt'); expect(r.result.after).toEqual(r.result.before);
  expect(r.final).toEqual(r.head); expect(r.final.quota.reservations).toBe(1);
});
