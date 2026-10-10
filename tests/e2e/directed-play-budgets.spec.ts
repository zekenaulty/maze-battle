import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`saved unlimited allowances render without settings controls or overflow at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?expedition=3');
    await expect(page.getByRole('button', { name: 'Travel', exact: true })).toBeEnabled();
    await page.evaluate(async () => {
      const path = '/src/persistence/directed/index.ts';
      const repository = await import(/* @vite-ignore */ path);
      const slot = 'known-destination-proof-v1';
      const current = await repository.readDirectedSave(slot);
      await repository.executeDirectedRequest(slot, { attemptId: 'unlimited-admission', owner: current.owner,
        epoch: current.epoch, expectedRevision: current.revision,
        command: { type: 'navigate', operationId: 'unlimited-trip', target: { kind: 'feature', featureId: 'V', arrival: 'adjacent' } } },
      Date.now, { steps: null, replans: null, durationMs: null });
    });
    await page.reload();
    await page.getByRole('tab', { name: 'Evidence' }).click();
    await expect(page.getByText('0 / unlimited', { exact: true })).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`unlimited-evidence-${width}.png`) });
    await page.getByRole('tab', { name: 'Travel' }).click();
    await page.getByRole('button', { name: 'Cancel travel' }).click();
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'cancelled');
  });
}
