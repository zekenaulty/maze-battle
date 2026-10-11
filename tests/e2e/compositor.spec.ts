import { expect, test } from '@playwright/test';
import type { FixtureOptions, FixtureVersion } from './compositor-fixture';

for (const version of ['classic', 'structured-v1', 'structured-v2', 'structured-v3'] satisfies FixtureVersion[]) {
  for (const mode of ['camera', 'overview'] as const) {
    test(`${version} ${mode}: eligibility, opacity, joints, resize and knowledge`, async ({ page }, testInfo) => {
      await page.goto('/tests/e2e/compositor-fixture.html');
      await page.waitForFunction(() => Boolean(window.compositor));
      await page.waitForLoadState('networkidle');
      const cases = [
        { width: 900, height: 740, zoom: 1 },
        { width: 613, height: 497, zoom: 0.7 },
        { width: 390, height: 520, zoom: 1.6 },
      ];
      for (const size of cases) {
        await page.setViewportSize({ width: size.width, height: size.height });
        const options: FixtureOptions = { version, mode, zoom: size.zoom };
        const result = await page.evaluate(options => window.compositor.inspect(options), options);
        await testInfo.attach(`${size.width}-pixels`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
        await page.screenshot({ path: testInfo.outputPath(`${size.width}-mixed.png`) });
        expect.soft(result.coldHiddenNonBase, 'first frame and first frame after resize also hide unknown geometry').toBe(0);
        expect.soft(result.hiddenNonBase, 'whole unknown canvas, including exterior walls and padding').toBe(0);
        expect.soft(result.repeatMismatches, 'same context repeats without accumulating rendering state').toBe(0);
        expect.soft(result.dimMismatches, 'every pixel must equal one 58% base overlay, including tile seams').toBe(0);
        expect.soft(result.currentMismatches, 'fully current matches cleared scene').toBe(0);
        expect.soft(result.dimSamples).toBe(size.width * size.height * result.backing.dpr ** 2);
        if (version === 'structured-v2' || version === 'structured-v3') {
          expect.soft(result.voidSamples).toBeGreaterThan(100);
          expect.soft(result.voidNonBase, 'permanently inaccessible gap is uniform base').toBe(0);
        }
        expect.soft(result.cornerSamples).toBeGreaterThan(0);
        expect.soft(result.cornerBright, 'legitimate outer joint is still visible').toBeGreaterThan(0);
        expect.soft(result.cornerMismatches, 'joint including its exterior quadrant matches clear rendering').toBe(0);
        expect.soft(result.hiddenGuidanceMismatches, 'unseen branches, room labels, routes and stairs cannot change output').toBe(0);
        expect.soft(result.knowledgeUnchanged).toBe(true);
      }
      for (const state of ['clear', 'dim', 'hidden'] as const) {
        await page.evaluate(({ options, state }) => window.compositor.show(options, state), { options: { version, mode }, state });
        await page.screenshot({ path: testInfo.outputPath(`390-${state}.png`) });
      }
      if (mode === 'camera') {
        const result = await page.evaluate(options => window.compositor.inspect(options), { version, mode, origin: { row: 5, column: 5 } });
        expect(result.hiddenNonBase).toBe(0);
        expect(result.dimMismatches).toBe(0);
        expect(result.hiddenGuidanceMismatches).toBe(0);
        expect(result.knowledgeUnchanged).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('390-panned.png') });
      }
    });
  }
}

test('generated v3 256-room renderer timing and read-only smoke', async ({ page }, testInfo) => {
  await page.goto('/tests/e2e/compositor-fixture.html');
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(() => window.compositor.measureGenerated());
  await testInfo.attach('generated-256-timing', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.rooms).toBe(256);
  expect(result.knowledgeUnchanged).toBe(true);
  for (const timing of result.results) expect(timing.nonBase).toBeGreaterThan(100);
});
