import { test, expect } from './canonical-decision-controller.test';
import { seedRootStop } from './canonical-decision-controller.root-stop.setup';

test('a valid later claim does not rewrite historical no-claim root Stop discharge or grant new authority', async ({ page }) => {
  await seedRootStop(page, { quota: false });
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController; await c.acknowledge(); const original = await c.state();
    await c.retainRemoteClaim(); const claimed = await c.state(), before = await c.dump(), count = c.calls().length;
    const ack = await c.acknowledge(), unchanged = before === await c.dump(); await c.create();
    const pulse = await c.wait(c.begin('pulse'));
    return { original, claimed, ack, unchanged, pulse, final: await c.state(), calls: c.calls().slice(count) };
  });
  expect(result.original.claim).toBeNull();
  expect(result.original.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-root-stop', decision: { claim: null } } });
  expect(result.claimed.claim!.row.revision).toBeGreaterThan(result.original.acknowledgement!.receipt.afterRevision);
  expect(result.ack.status).toBe('navigation-acknowledged'); expect(result.unchanged).toBe(true);
  expect(result.claimed.acknowledgement).toEqual(result.original.acknowledgement);
  expect(result.final.acknowledgement).toEqual(result.original.acknowledgement);
  expect(result.pulse.status).toBe('rejected'); expect(result.final.grant).toBeNull();
  expect(result.calls.filter(c => c.method !== 'close')).toEqual([]);
});
