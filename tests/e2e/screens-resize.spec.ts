import { expect, test, type Page } from '@playwright/test';

const sizes = [
  { width: 800, height: 1000 },
  { width: 1700, height: 1000 },
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1700, height: 1000 },
  { width: 800, height: 1000 },
];

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`canvas resize at ${deviceScaleFactor}x density`, () => {
    test.use({ deviceScaleFactor, hasTouch: deviceScaleFactor === 2 });

    test('fits its stage through panel expansion, shrinking, rotation and map changes', async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(sizes[0]);
      await page.goto('/tests/e2e/screens-fixture.html');
      await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();

      for (const [index, size] of sizes.entries()) {
        await page.setViewportSize(size);
        await expectCanvasFits(page);
        await expect(page.getByLabel('Camera zoom 100%')).toBeVisible();
        await page.screenshot({ path: info.outputPath(`resize-${index}-${size.width}.png`) });
      }

      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect(page.getByLabel('Camera zoom 115%')).toBeVisible();
      await page.setViewportSize(sizes[1]);
      await expectCanvasFits(page);
      await expect(page.getByLabel('Camera zoom 115%')).toBeVisible();

      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await page.setViewportSize(sizes[3]);
      await expectCanvasFits(page);
      await page.setViewportSize(sizes[1]);
      await expectCanvasFits(page);
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await page.getByRole('button', { name: 'Recenter camera', exact: true }).click();
      await expectCanvasFits(page);
      expect(errors).toEqual([]);
    });
  });
}

async function expectCanvasFits(page: Page) {
  const canvas = page.getByLabel('Dungeon map');
  const measure = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const stage = element.parentElement!.getBoundingClientRect();
    const header = document.querySelector('.screen-bar')!.getBoundingClientRect();
    const controls = document.querySelector('.controls')!.getBoundingClientRect();
    return {
      fitsStage: Math.abs(rect.width - (stage.width - 8)) <= 1 && Math.abs(rect.height - (stage.height - 8)) <= 1,
      fitsScreen: rect.top >= header.bottom && rect.bottom <= Math.min(innerHeight, controls.top) && rect.right <= innerWidth,
      backingMatches: element.width === Math.floor(Math.floor(rect.width) * devicePixelRatio)
        && element.height === Math.floor(Math.floor(rect.height) * devicePixelRatio),
    };
  });
  const expected = { fitsStage: true, fitsScreen: true, backingMatches: true };
  await expect.poll(measure).toEqual(expected);
  // Catch intrinsic-size feedback after the animation/resize observer has redrawn.
  await page.waitForTimeout(250);
  expect(await measure()).toEqual(expected);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    const colors = new Set<string>();
    for (let index = 0; index < pixels.length; index += 256) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    }
    return colors.size;
  })).toBeGreaterThan(10);
}
