import { expect, test, type Page } from '@playwright/test';

async function settled(page: Page) {
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
}
async function step(page: Page, key: string) {
  const status = await page.locator('.screen-status').textContent();
  await page.keyboard.press(key);
  await expect(page.locator('.screen-status')).not.toHaveText(status!);
  await settled(page);
}

test('actual App movement and render I/O stays local with 1, 8 and 16 retained qualified floors', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/depth-setup', route => route.fulfill({ contentType: 'text/html', body: '<title>Depth fixture setup</title>' }));
  await page.goto('/'); await settled(page);
  const samples = [];
  for (const floors of [1, 8, 16]) {
    // Keep GameSession out of setup transactions. No mutation of the user's preview origin.
    await page.goto('/depth-setup');
    expect(await page.evaluate(async floors => {
      const f = await import('../../tests/e2e/canonical-app-depth.fixture.ts'); return f.retainFloors(floors);
    }, floors)).toBe(floors);
    await page.goto('/'); await settled(page);
    // Warm the same two cells before each measurement; no floor-depth-dependent cold-map comparison.
    await step(page, 'ArrowRight'); await step(page, 'ArrowLeft');
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      await page.evaluate(async () => { const f = await import('../../tests/e2e/canonical-app-depth.fixture.ts'); await f.startProbe(); });
      await step(page, key);
      const sample = await page.evaluate(async () => { const f = await import('../../tests/e2e/canonical-app-depth.fixture.ts'); return f.finishProbe(); });
      samples.push({ floors, key, ...sample });
      expect(sample.native.operations.every(o => o.status === 'success')).toBe(true);
      expect(sample.native.operations.some(o => ['getAll', 'getAllKeys', 'clear'].includes(o.method))).toBe(false);
      expect(sample.readKeys.filter(k => /^dungeon\/(?!1\/|1$)\d/.test(k))).toEqual([]);
      expect(sample.writeKeys.filter(k => k.startsWith('dungeon/'))).toEqual([]);
      expect(sample.reads).toBeLessThan(2500); expect(sample.writes).toBeLessThan(150);
      expect(sample.writeBytes).toBeLessThan(180_000);
    }
  }
  for (const key of ['ArrowRight', 'ArrowLeft']) {
    const sameKey = samples.filter(s => s.key === key), first = sameKey[0];
    for (const sample of sameKey.slice(1)) {
      expect(sample.reads).toBeLessThan(first.reads + 100);
      expect(sample.writeBytes).toBeLessThan(first.writeBytes + 20_000);
    }
  }
  expect(errors).toEqual([]);
  await info.attach('actual-app-depth-native-io.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});
