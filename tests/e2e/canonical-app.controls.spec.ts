import { test, expect, type Page } from '@playwright/test';

async function head(page: Page) {
  return page.evaluate(async () =>
    (await (await import('/src/persistence/canonical/read.ts')).readCanonicalHead()).head);
}

async function ready(page: Page) {
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
}

async function origin(page: Page) {
  const canvas = page.locator('canvas');
  return [await canvas.getAttribute('data-row-start'), await canvas.getAttribute('data-column-start')];
}

for (const touch of [false, true]) test.describe(touch ? 'Phone camera' : 'Desktop camera', () => {
  test.use({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: touch });

  test('zoom, drag and recenter do not move or mutate the game', async ({ page, context }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await ready(page);
    const before = await head(page);
    await expect(page.getByLabel('Camera zoom 100%', { exact: true })).toBeVisible();
    const canvas = page.locator('canvas');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw Error('Missing canvas');
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    if (touch) {
      await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
      await expect(page.getByLabel('Camera zoom 115%', { exact: true })).toBeVisible();
    } else {
      await page.mouse.move(x, y); await page.mouse.wheel(0, -120);
      await expect(page.getByLabel('Camera zoom 112%', { exact: true })).toBeVisible();
    }
    await ready(page);
    const centered = await origin(page);
    if (touch) {
      const cdp = await context.newCDPSession(page);
      try {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        for (let step = 1; step <= 6; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 12, y: y - step * 9, id: 1 }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally { await cdp.detach(); }
    } else {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x - 120, y - 90, { steps: 6 }); await page.mouse.up();
    }
    await expect.poll(() => origin(page)).not.toEqual(centered);
    await ready(page);
    expect(await head(page)).toEqual(before);
    await page.getByRole('button', { name: 'Recenter camera', exact: true }).click();
    await expect.poll(() => origin(page)).toEqual(centered);
    await ready(page);
    const layout = await canvas.evaluate(element => {
      const c = element as HTMLCanvasElement, rect = c.getBoundingClientRect();
      const bytes = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, colors = new Set<number>();
      for (let i = 0; i < bytes.length; i += 16) colors.add((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]);
      return { colors: colors.size, top: rect.top, bottom: rect.bottom, width: rect.width,
        headerBottom: document.querySelector('.screen-bar')!.getBoundingClientRect().bottom,
        screenWidth: innerWidth, screenHeight: innerHeight, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(layout.colors).toBeGreaterThan(20);
    expect(layout.top).toBeGreaterThanOrEqual(layout.headerBottom);
    expect(layout.bottom).toBeLessThanOrEqual(layout.screenHeight);
    expect(layout.width).toBeLessThanOrEqual(layout.screenWidth);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.screenWidth);
    expect(await head(page)).toEqual(before); expect(errors).toEqual([]);
    await info.attach('camera-layout.json', { body: JSON.stringify({ touch, layout, head: before }), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(touch ? 'phone-camera.png' : 'desktop-camera.png') });
  });
});
