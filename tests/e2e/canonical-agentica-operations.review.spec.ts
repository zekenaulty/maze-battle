import { test, expect } from './canonical-agentica-operations.test';

test('review: valid fresh-publication admission can be confirmed', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const url = '/tests/e2e/operation-review.probes.ts';
    const probes: typeof import('./operation-review.probes') = await import(url);
    return probes.newPublication();
  });
  console.log('FRESH_PUBLICATION', JSON.stringify(result));
  expect(result.admission).toBe('applied');
  expect(result.confirmation).toBe('accepted');
  expect(result.wrongPublication).toContain('original grant changed'); expect(result.wrongUnchanged).toBe(true);
  expect(result.retainedPublication).toEqual(result.publication); expect(result.publication).not.toEqual(result.oldPublication);
  expect(result.startObservation).toBe(result.oldPublication.id); expect(result.steps).toBe(1);
});

for (const damage of ['receipt', 'body', 'record', 'witness', 'source'] as const) test(`review: corrupted predecessor ${damage} blocks reads and next advance`, async ({ page }) => {
  const result = await page.evaluate(async damage => {
    const url = '/tests/e2e/operation-review.probes.ts';
    const probes: typeof import('./operation-review.probes') = await import(url);
    return probes.predecessor(damage);
  }, damage);
  console.log('PREDECESSOR', JSON.stringify(result));
  expect(result.read).not.toBe('accepted'); expect(result.advance.accepted).toBe(false); expect(result.unchanged).toBe(true);
});

test('review: validates only the current event and its immediate predecessor', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const url = '/tests/e2e/operation-review.probes.ts';
    const probes: typeof import('./operation-review.probes') = await import(url);
    return probes.boundedPredecessor();
  });
  expect(result.sequence).toBe(3); expect(result.calls).toEqual(result.expected); expect(result.stats.reads).toBeLessThan(2048);
});

test('review: ACK cannot change service activeEpoch while keeping the exact event', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const url = '/tests/e2e/operation-review.probes.ts';
    const probes: typeof import('./operation-review.probes') = await import(url);
    return probes.changedActiveEpoch();
  });
  expect(result.result).toContain('differs from original'); expect(result.unchanged).toBe(true);
});
