import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-review';

for (const viewport of [{ width: 1100, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`standalone saved-room map is bounded and readable at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/tests/e2e/stream-map-panel.html');
    const panel = page.locator('.stream-map-panel');
    await expect(page.getByRole('img', { name: /Observed map of entry/ })).toBeVisible({ timeout: 60_000 });
    const expected = await page.evaluate(async () => {
      const page = await window.stream.api.readStreamKnowledge('stream', 'entry');
      return Object.entries(page!.cells).map(([key, cell]) => [key, String(cell.observedAt)]);
    });
    expect(await panel.locator('[data-map-cell]').evaluateAll(nodes => nodes.map(node => [node.getAttribute('data-map-cell'), node.getAttribute('data-observed-at')]))).toEqual(expected);
    await expect(panel).toHaveAttribute('data-summary-count', '12'); await expect(panel).toHaveAttribute('data-room-page-count', '1');
    const select = page.getByLabel('Saved room', { exact: true });
    if (viewport.width < 600) await expect(select).toBeVisible();
    else await expect(select).toBeHidden();
    const overflows = await panel.evaluate(node => [node, ...node.querySelectorAll('button, h2, h3, .stream-map-detail, .stream-map-viewport')]
      .filter(element => element.getBoundingClientRect().width > 0 && element.scrollWidth > element.clientWidth + 2).map(element => element.className));
    expect(overflows).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`map-${viewport.width}.png`), fullPage: true });
    const stored = await page.evaluate(() => window.stream.raw());
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(panel).toHaveAttribute('data-summary-count', '3'); await expect(panel).toHaveAttribute('data-room-page-count', '1');
    await expect(panel.locator('[data-current-cell]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Current room', exact: true }).click();
    await expect(page.getByRole('img', { name: /Observed map of entry/ })).toBeVisible();
    await expect(panel).toHaveAttribute('data-summary-count', '3'); await expect(panel).toHaveAttribute('data-room-page-count', '1');
    expect(await page.evaluate(() => window.stream.raw())).toEqual(stored);
  });
}
