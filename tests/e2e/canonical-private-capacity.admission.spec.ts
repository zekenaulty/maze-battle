import { expect, test } from './canonical-private-capacity.test';
import type { PolicyFault } from './canonical-private-capacity.support';

const faults: PolicyFault[] = ['missing', 'tampered', 'overbooked'];
for (const fault of faults) test(`${fault}: fresh execute/admit/settle/resume/claim refuse without effects`, async ({ page }, info) => {
  const r = await page.evaluate(async fault => {
    const c = window.privateCapacityFixture, original = await c.seed(), damaged = await c.damagePolicy(fault);
    const cases = [];
    for (const action of ['execute', 'admit', 'settle']) {
      const head = await c.current();
      cases.push({ action, ...await c.refusal(async called => {
        const work = async () => { called(); return null; };
        return action === 'execute' ? c.executeCanonical(c.command(head, 'fixture.fresh'), work)
          : action === 'admit' ? c.operateCanonical(c.command(head, 'operation.admit', {
            operationId: 'new-operation', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES }), 'admit', work)
            : c.operateCanonical(c.command(head, 'operation.settle', { operationId: 'funded-original', disposition: 'completed' }), 'settle', work);
      }) });
    }
    await c.controlCanonical(c.command(await c.current(), 'control.stop', { owner: 'capacity-owner' }), 'stop');
    for (const action of ['resume', 'claim'] as const) cases.push({ action, ...await c.refusal(async () =>
      c.controlCanonical(c.command(await c.current(), `control.${action}`, { owner: action === 'resume' ? 'capacity-owner' : 'ordinary-claimant' }), action)) });
    return { original, damaged, cases, final: await c.current() };
  }, fault);
  await info.attach('fresh-refusals.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  expect(r.original.genesis.quota).toHaveProperty('privateCapacity', { version: 'private-world-v1', allocatedBytes: 0, consumedBytes: 0, active: null });
  expect(r.cases).toHaveLength(5);
  for (const c of r.cases) {
    expect(c.error, c.action).toMatch(fault === 'overbooked' ? /storage quota exhausted/ : /invalid (active )?private capacity/);
    expect(c.called, c.action).toBe(0); expect(c.after, c.action).toEqual(c.before);
    expect(c.before.bytes).toBe(c.action === 'resume' || c.action === 'claim' ? r.final.quota.usedBytes : r.damaged.head.quota.usedBytes);
  }
  if (fault === 'overbooked') expect(r.damaged.charge! + r.damaged.head.quota.reservedBytes).toBeGreaterThan(r.damaged.head.quota.limitBytes);
});

for (const fault of faults) test(`${fault}: adoption refuses with otherwise valid current custody`, async ({ page }, info) => {
  const r = await page.evaluate(async fault => {
    const c = window.privateCapacityFixture; await c.seed();
    await c.controlCanonical(c.command(await c.current(), 'control.takeover', { owner: 'adopter' }), 'takeover');
    await c.controlCanonical(c.command(await c.current(), 'control.resume', { owner: 'adopter' }), 'resume');
    const damaged = await c.damagePolicy(fault);
    const result = await c.refusal(() => c.operateCanonical(c.command(damaged.head, 'operation.adopt', { operationId: 'funded-original' }), 'adopt'));
    return { damaged, result };
  }, fault);
  await info.attach('adoption-refusal.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  expect(r.result.error).toMatch(fault === 'overbooked' ? /storage quota exhausted/ : /invalid (active )?private capacity/);
  expect(r.result.after).toEqual(r.result.before); expect(r.result.before.bytes).toBe(r.damaged.head.quota.usedBytes);
});

for (const fault of faults) test(`${fault}: expired receipt-first replay survives reload and refuses altered identity`, async ({ page }, info) => {
  const saved = await page.evaluate(async fault => {
    const c = window.privateCapacityFixture, original = await c.seed(), damaged = await c.damagePolicy(fault);
    return { original, damaged, before: await c.dump() };
  }, fault);
  await page.reload(); await page.waitForFunction(() => !!window.privateCapacityFixture);
  const r = await page.evaluate(async wire => {
    const input = JSON.parse(wire) as typeof saved;
    const c = window.privateCapacityFixture, meter = c.storageProbe(), now = Date.now; let called = 0;
    Date.now = () => input.original.effect.deadlineAt! + 1;
    try {
      const effect = await c.executeCanonical(input.original.effect, async () => { called++; return null; });
      const admission = await c.operateCanonical(input.original.admission, 'admit', async () => { called++; return null; });
      const reads = meter.finish();
      const conflict = await c.refusal(() => c.executeCanonical({ ...input.original.effect, input: { changed: true } }, async () => { called++; return null; }));
      return { effect, admission, called, reads, conflict, after: await c.dump() };
    } finally { Date.now = now; }
  }, JSON.stringify(saved));
  await info.attach('exact-replay.json', { body: JSON.stringify({ saved, r }, null, 2), contentType: 'application/json' });
  expect(r.called).toBe(0); expect(r.effect.replayed).toBe(true); expect(r.admission.replayed).toBe(true);
  expect(r.effect.receipt).toEqual(saved.original.committed.receipt); expect(r.admission.receipt).toEqual(saved.original.admitted.receipt);
  expect(r.after).toEqual(saved.before); expect(r.conflict.after).toEqual(r.conflict.before);
  expect(r.conflict.error).toContain('invalid original receipt');
  expect(r.reads.operations.map(o => [o.store, o.method])).toEqual([['meta', 'get'], ['receipts', 'get'], ['meta', 'get'], ['receipts', 'get']]);
});
