import { test, expect } from '@playwright/test';
import type {} from './canonical-game-map-fixture';

for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`earned room paging and exact read-only recall at ${size.width}x${size.height}`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5220' ? route.continue() : route.abort());
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/tests/e2e/canonical-game-map-fixture.html');
    await page.waitForFunction(() => !!window.canonicalMap);
    await page.evaluate(() => window.canonicalMap.seedRoomPages());
    const before = await page.evaluate(() => window.canonicalMap.readCanonicalHead());
    const pages = await page.evaluate(async () => {
      const first = (await window.canonicalMap.rooms()).value;
      if (!first.next) throw Error('Fixture needs a second room page');
      return { first, second: (await window.canonicalMap.rooms(first.next)).value };
    });
    expect(pages.first.items).toHaveLength(4); expect(pages.second.items.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Rooms', exact: true })).toHaveAttribute('aria-selected', 'true');
    const pins = page.getByRole('group', { name: 'Earned room map' });
    await expect(pins.getByRole('button')).toHaveCount(4); await expect(page.locator('canvas')).toHaveCount(0);
    await page.setViewportSize(size);
    await page.getByRole('button', { name: 'Next room page' }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await expect(pins.getByRole('button')).toHaveCount(pages.second.items.length);
    const selected = pages.second.items[0], { row, column } = selected.anchor.world;
    await expect(page.getByRole('button', { name: `Recall room at ${row}, ${column}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('rooms.png'), fullPage: true });
    await page.getByRole('button', { name: `Recall room at ${row}, ${column}`, exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Nearby', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(`Room anchor ${row}, ${column}`, { exact: true })).toBeVisible();
    const canvas = page.locator('canvas'); await expect(canvas).not.toHaveAttribute('aria-busy', 'true');
    const frame = await canvas.evaluate((c: HTMLCanvasElement) => {
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, colors = new Set<number>();
      for (let i = 0; i < data.length; i += 4) colors.add(data[i] << 16 | data[i + 1] << 8 | data[i + 2]);
      return { row: Number(c.dataset.rowStart), column: Number(c.dataset.columnStart), rows: Number(c.dataset.rows),
        columns: Number(c.dataset.columns), colors: colors.size };
    });
    expect(frame.row + Math.floor(frame.rows / 2)).toBe(row); expect(frame.column + Math.floor(frame.columns / 2)).toBe(column);
    expect(frame.colors).toBeGreaterThan(20); expect(frame.rows * frame.columns).toBeLessThanOrEqual(1024);
    await canvas.click(); await page.keyboard.press('e'); await page.keyboard.press('t');
    expect(await page.evaluate(() => window.canonicalMap.clicks)).toEqual([]);
    expect(await page.evaluate(() => window.canonicalMap.readCanonicalHead())).toEqual(before);
    await page.screenshot({ path: info.outputPath('recalled-room.png'), fullPage: true });
    await page.keyboard.press('m'); await expect(page.getByRole('tablist', { name: 'Map views' })).toHaveCount(0);
    expect(await page.evaluate(() => window.canonicalMap.readCanonicalHead())).toEqual(before);
    expect(await page.evaluate(() => ({ clicks: window.canonicalMap.clicks, actions: window.canonicalMap.actions })))
      .toEqual({ clicks: [], actions: [] });
    await expect(page.getByRole('alert')).toHaveCount(0); expect(errors).toEqual([]);
    await info.attach('earned-room-pages', { body: JSON.stringify({ pages, frame, before }, null, 2), contentType: 'application/json' });
  });
}
