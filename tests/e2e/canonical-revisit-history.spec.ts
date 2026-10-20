import { test, expect, type Page } from '@playwright/test';
import { boot, measured, move, offline, ready, state, type Sample } from './canonical-revisit.support';

async function keyboardStep(page: Page, direction: 'ArrowLeft' | 'ArrowRight') {
  const before = (await state(page)).checkpoint.position;
  await page.keyboard.press(direction);
  await expect.poll(async () => (await state(page)).checkpoint.position).not.toEqual(before);
  await ready(page);
}
const counts = (page: Page) => page.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.audit.ts')).counts());

test('actual App local keyboard I/O stays bounded separately across retained depth and legal movement history', async ({ browser }, info) => {
  const samples: { depth: number; historyMoves: number; direction: string; sample: Sample; counts: Awaited<ReturnType<typeof counts>> }[] = [];
  for (const depth of [1, 16]) {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5277' }), network = offline(context), page = await context.newPage();
    try {
      await boot(page, depth);
      // Same two ordinary earned off-stair cells in the identical authored first room.
      await move(page, 'east'); await move(page, 'east');
      await keyboardStep(page, 'ArrowLeft'); await keyboardStep(page, 'ArrowRight');
      for (const historyMoves of depth === 1 ? [0] : [0, 128]) {
        const before = await counts(page);
        if (historyMoves) {
          for (let n = 0; n < historyMoves; n++) await keyboardStep(page, n % 2 ? 'ArrowRight' : 'ArrowLeft');
          const after = await counts(page);
          expect(after.observations - before.observations).toBe(historyMoves);
          expect(after.receipts - before.receipts).toBe(historyMoves);
        }
        for (const direction of ['ArrowLeft', 'ArrowRight'] as const) {
          const retained = await counts(page);
          const [sample] = await measured([page], () => keyboardStep(page, direction));
          samples.push({ depth, historyMoves, direction, sample, counts: retained });
          expect(sample.readKeys.filter(k => /^dungeon\/(?!1(?:\/|$))\d/.test(k))).toEqual([]);
          expect(sample.writeKeys.filter(k => k.startsWith('dungeon/'))).toEqual([]);
          expect(sample.reads).toBeLessThan(2500); expect(sample.writes).toBeLessThan(150);
          expect(sample.readBytes).toBeLessThan(1_000_000); expect(sample.writeBytes).toBeLessThan(180_000);
        }
      }
      expect(network).toEqual([]);
    } finally { await context.close(); }
  }
  for (const direction of ['ArrowLeft', 'ArrowRight']) {
    const same = samples.filter(s => s.direction === direction), first = same[0].sample;
    expect(same).toHaveLength(3);
    for (const { sample } of same.slice(1)) {
      expect(sample.reads).toBeLessThan(first.reads + 100);
      expect(sample.readBytes).toBeLessThan(first.readBytes + 160_000);
      expect(sample.writeBytes).toBeLessThan(first.writeBytes + 20_000);
    }
  }
  await info.attach('depth-history-io.json', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});
