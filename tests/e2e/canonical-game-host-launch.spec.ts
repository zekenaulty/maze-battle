import { expect, test } from '@playwright/test';
import type * as Fixture from './canonical-game-host-launch.fixture';
declare global { interface Window { hostLaunchFixture: typeof Fixture } }
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/canonical-game-host.html'); await page.waitForFunction(() => !!window.hostLaunchFixture);
});
test('actual GameSession launch retains earned source identity and requires an explicit initial grant', async ({ page }) => {
  const result = await page.evaluate(() => window.hostLaunchFixture.announcementIsNotPermission());
  expect(result.refused).toBe('Error: Canonical storage: missing run grant'); expect(result.absent).toBe(true);
  expect(result.result).toEqual({ accepted: true }); expect(result.sourceId).toBe(result.originalId); expect(result.guard).toBe('admitted');
});
test('funded guard cancellation revokes the grant before a later queued host effect', async ({ page }) => {
  const result = await page.evaluate(() => window.hostLaunchFixture.stoppedGuard());
  expect(result.refused).toContain('guard changed'); expect(result.absent).toBe(true);
});
test('manual movement makes the original launch publication stale without rewriting its evidence', async ({ page }) => {
  const result = await page.evaluate(() => window.hostLaunchFixture.manualObservation());
  expect(result.refused).toContain('publication'); expect(result.unchanged).toBe(true);
});
