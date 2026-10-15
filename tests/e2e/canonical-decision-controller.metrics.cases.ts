import { test, expect } from './canonical-decision-controller.test';
import { seedRootStop } from './canonical-decision-controller.root-stop.setup';

for (const scenario of ['no-claim', 'claim-with-child'] as const)
  test(`decision-root-stop bounded phase metrics: ${scenario}`, async ({ page }, info) => {
    let childId: string | undefined;
    if (scenario === 'no-claim') await seedRootStop(page);
    else childId = await page.evaluate(async () => {
      const c = window.canonicalDecisionController; await c.boot(); await c.create(); await c.prepare(await c.publish());
      await c.pulse(); await c.pulse(); await c.pulse(); const child = await c.completeSuccessor(await c.draft());
      c.settle('continued'); await c.wait(c.begin('cancel')); await c.fillQuota(); await c.acknowledgeRoot(await c.rootEntry());
      return child.seed.operationId;
    });
    const result = await page.evaluate(async childId => {
      const c = window.canonicalDecisionController, before = await c.state(), funding = await c.funding(childId);
      const count = c.calls().length, metrics = await c.measureRootStop(), after = await c.state();
      return { before, funding, metrics, after, finalFunding: await c.funding(childId), calls: c.calls().slice(count) };
    }, childId);
    const m = result.metrics;
    await info.attach(`root-stop-metrics-${scenario}.json`, { contentType: 'application/json', body: JSON.stringify(m, null, 2) });
    console.log(`ROOT_STOP_METRICS ${JSON.stringify({ scenario, ...m })}`);
    expect(m.historicalState).toBe('acknowledged'); expect(result.calls).toEqual([]);
    expect(result.after.acknowledgement!.source.attemptId).toBe(m.acknowledgement);
    expect(result.after.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-root-stop' } });
    expect(result.after.claim).toEqual(result.before.claim); expect(result.after.grant).toEqual(result.before.grant);
    expect(result.after.selection).toEqual(result.before.selection); expect(result.after.launch.guard).toEqual(result.before.launch.guard);
    expect(result.finalFunding.head.allocations[result.finalFunding.navigation!.id]).toBeUndefined();
    for (const phase of [m.prepare, m.ack, m.historical]) {
      expect(phase.reads).toBeGreaterThan(0); expect(phase.reads).toBeLessThanOrEqual(m.limits.reads + 2);
      expect(phase.readBytes + phase.writeBytes).toBeLessThanOrEqual(m.limits.bytes);
    }
    for (const phase of [m.prepare, m.historical]) {
      expect(phase.writes).toBe(0); expect(phase.writeBytes).toBe(0); expect(phase.transactions).toEqual(['readonly']);
    }
    expect(m.ack.writes).toBe(3); expect(m.ack.transactions).toEqual(['readonly', 'readwrite']);
    expect(Object.entries(m.ack.byStore).filter(([, row]) => row.writes).map(([name]) => name).sort())
      .toEqual(['heads', 'operations', 'receipts']);
    expect(m.historical.canonical.writes).toBe(0); expect(m.historical.canonical.writeBytes).toBe(0);
    expect(m.historical.canonical.reads).toBeLessThanOrEqual(m.limits.reads);
    expect(m.historical.canonical.readBytes).toBeLessThanOrEqual(m.limits.bytes);
    if (scenario === 'no-claim') { expect(result.before.claim).toBeNull(); expect(result.before.grant).toBeNull(); }
    else {
      expect(result.before.claim).not.toBeNull(); expect(result.before.grant).not.toBeNull();
      expect(result.finalFunding.child).toEqual(result.funding.child);
      expect(result.funding.child!.state).toBe('settled'); expect(result.funding.head.allocations[childId!].bytes).toBeGreaterThan(0);
      expect(result.finalFunding.head.allocations[childId!]).toEqual(result.funding.head.allocations[childId!]);
    }
  });
