import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('canvas')).toBeVisible();
}
async function auditNetwork(page: Page) {
  const calls: string[] = [], sockets: string[] = [];
  page.on('websocket', socket => { if (!socket.url().startsWith('ws://127.0.0.1:5288')) sockets.push(socket.url()); });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:5288/')) return route.continue();
    calls.push(`${route.request().method()} ${url}`);
    if (url.startsWith('http://127.0.0.1:5236/api/starts?')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  return { calls, sockets };
}
async function dump(page: Page) { return page.evaluate(async () => (await import('./tests/e2e/app-recovery.fixture.ts')).dump()); }

test('actual App recovery stays local and renders one retained original on desktop and mobile', async ({ page }, info) => {
  const network = await auditNetwork(page), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  const seed = await page.evaluate(async () => (await import('./tests/e2e/app-recovery.fixture.ts')).seedNavigation());
  const before = await dump(page);
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentica recovery' });
    await expect(dialog.getByText(seed.launchId, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Inspect original 1' })).toBeEnabled();
    expect(await dialog.getByRole('region', { name: 'Original action inspection' }).count()).toBe(0);
    await page.screenshot({ path: info.outputPath(`recovery-root-${width}.png`) });
    await dialog.getByRole('button', { name: 'Inspect original 1' }).click();
    const detail = dialog.getByRole('region', { name: 'Original action inspection' });
    await expect(detail.getByText(seed.actionId, { exact: true })).toBeVisible();
    await expect(detail.getByText('maze.navigate', { exact: true })).toBeVisible();
    expect(await dialog.locator('pre, textarea, canvas, input').count()).toBe(0);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeLessThanOrEqual(height);
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`recovery-detail-${width}.png`) });
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
    expect(await dump(page)).toEqual(before);
  }
  expect(network.calls).toEqual([]); expect(network.sockets).toEqual([]); expect(errors).toEqual([]);
});

test('actual App quota recovery Stop uses the same live controller and does not claim remote clearance', async ({ page }, info) => {
  const network = await auditNetwork(page); await ready(page);
  await page.evaluate(async () => (await import('./tests/e2e/app-recovery.fixture.ts')).seedNavigation());
  const state = await page.evaluate(async () => (await import('./tests/e2e/app-recovery.fixture.ts')).quotaFailure());
  expect(state).toEqual({ controlled: false, recovery: true, live: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Agentica recovery', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentica recovery' });
  await expect(dialog.getByRole('button', { name: 'Stop Agentic session' })).toBeEnabled();
  expect(network.calls).toEqual([]);
  await dialog.getByRole('button', { name: 'Check service' }).click();
  await expect(dialog.getByRole('status')).toContainText('absence does not prove no execution');
  expect(network.calls).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Stop Agentic session' }).click();
  await expect(dialog.getByText('Local Stop recorded; original service start is unknown. Session clearance remains unknown.')).toBeVisible();
  const after = await page.evaluate(async () => {
    const fixture = await import('./tests/e2e/app-recovery.fixture.ts'), launch = (await fixture.readLaunch()).value!;
    return { terminal: launch.guard.terminal?.disposition, live: !window.__appRecoverySession.hostSignal.aborted,
      owner: launch.guard.owner === window.__appRecoverySession.owner };
  });
  expect(after).toEqual({ terminal: 'cancelled', live: true, owner: true });
  expect(network.calls).toHaveLength(2); expect(network.calls.every(call => call.startsWith('GET '))).toBe(true);
  expect(network.sockets).toEqual([]);
  await page.screenshot({ path: info.outputPath('quota-stop-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Agentica recovery', exact: true })).toBeVisible();
});

test('actual App storage loading failure still exposes local recovery without network', async ({ page }, info) => {
  const network = await auditNetwork(page);
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw Error('Storage denied for isolated test'); } }); });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: 'Agentica recovery', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentica recovery' });
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(network.calls).toEqual([]); expect(network.sockets).toEqual([]);
  await page.screenshot({ path: info.outputPath('storage-failure-mobile.png') });
});
