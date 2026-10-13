import { expect, test } from '@playwright/test';
import type * as Fixture from './canonical-game-host.fixture';
declare global { interface Window { gameHostFixture: typeof Fixture } }
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/canonical-game-host.html');
  await page.waitForFunction(() => !!window.gameHostFixture);
});
test('canonical publication and manual movement use one serialized GameSession queue', async ({ page }) => {
  const result = await page.evaluate(() => window.gameHostFixture.queueRoundTrip());
  expect(result.receipts).toEqual([result.initial + 1, result.initial + 2, result.initial + 3]);
  expect(result.proofs).toEqual([result.initial, result.initial + 2]);
  expect(result.final).toBe(result.initial + 3);
  expect(result.view).toMatchObject({ controlled: true, revision: result.final });
});
test('exact host retry returns the original without executing or rewinding the projected game', async ({ page }) => {
  const result = await page.evaluate(() => window.gameHostFixture.exactReplay());
  expect(result).toMatchObject({ identical: true, effects: 0, unchanged: true });
  expect(result.view).toMatchObject({ controlled: true, revision: result.revision, status: 'Reconciled' });
});
test('host inputs are captured before another microtask can mutate them', async ({ page }) => {
  expect(await page.evaluate(() => window.gameHostFixture.captureInput())).toEqual({ value: { count: 1 } });
});
test('retained navigation uses the real game queue and publishes its moved position', async ({ page }) => {
  const result = await page.evaluate(() => window.gameHostFixture.navigation());
  expect(result.admitted?.position).toEqual(result.start);
  expect(result.progress?.steps).toBe(1);
  expect(result.position).toEqual(result.progress?.position);
  expect(result.position?.cell.row).toBe(result.start.cell.row + 1);
});
for (const kind of ['host', 'settings', 'save', 'look'] as const) {
  test(`Stop aborts native ${kind} writes and drops the queued host action`, async ({ page }) => {
    const result = await page.evaluate(k => window.gameHostFixture.stopDuringCommit(k), kind);
    expect(result).toMatchObject({ aborted: true, unchanged: true, outcomes: ['rejected', 'rejected'] });
    expect(result.view).toMatchObject({ controlled: false, status: 'Fixture Stop' });
  });
}
test('failed host transaction latches recovery and is not replayed during takeover', async ({ page }) => {
  const result = await page.evaluate(() => window.gameHostFixture.failClosed());
  expect(result.outcomes).toEqual(['rejected', 'rejected']);
  expect(result.failedView).toMatchObject({ controlled: false, recoveryRequired: true });
  expect(result.recovered).toMatchObject({ controlled: true, recoveryRequired: false });
  expect(result.row).toBeNull(); expect(result.after).toBe(result.before);
});
