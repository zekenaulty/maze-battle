import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`recovery control ${viewport.width}: one explicit crossing, reload and no automatic continuation`, async ({ page, context }, info) => {
    await page.setViewportSize(viewport);
    await openFixture(page);
    await page.evaluate(async () => {
      await window.directedStorage.setupRecovery('known-destination-proof-v1', 'recovery-ui');
      sessionStorage.setItem('maze-directed-controller-v1', 'recovery-ui');
    });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?expedition=3');
    const retry = page.getByRole('button', { name: 'Retry west crossing' });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(page.getByRole('status', { name: 'Travel status' })).toHaveText('The passage is still obstructed.');
    await expect(retry).toBeEnabled();
    const canvas = page.locator('canvas');
    expect((await canvas.boundingBox())!.height).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`recovery-${viewport.width}-blocked.png`) });

    const fixture = await context.newPage(); await openFixture(fixture);
    await fixture.evaluate(() => window.directedStorage.setRecoveryGate('known-destination-proof-v1', 'open'));
    await fixture.close();
    await page.reload();
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(page.getByRole('status', { name: 'Travel status' })).toHaveText('Crossed the passage. Travel remains stopped.');
    await expect(retry).toHaveCount(0);
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'interrupted');
    await page.reload();
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'interrupted');
    await expect(retry).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Travel', exact: true })).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`recovery-${viewport.width}-crossed.png`) });
    expect(errors).toEqual([]);
  });
}
