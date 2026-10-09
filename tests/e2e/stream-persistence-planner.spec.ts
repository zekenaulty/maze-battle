import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-review';

test('observed-page planner completes a growing IDB floor with browser reloads and bounded reads', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/tests/e2e/stream-persistence-review.html');
  await page.waitForFunction(() => Boolean(window.streamReview));
  await page.evaluate(async () => {
    const { api, recipe } = window.stream;
    await api.createStreamSlot('stream', { ...recipe, level: 10, seed: 55 });
    await api.claimStreamControl('stream', 'planner', null);
  });
  let complete = false, commands = 0, maximumReads = 0, crossings = 0, preparations = 0, reused = 0;
  for (let batch = 0; batch < 24 && !complete; batch++) {
    const result = await page.evaluate(async () => {
      let maximumReads = 0, crossings = 0, preparations = 0, commands = 0;
      for (; commands < 251; commands++) {
        const step = await window.streamReview.step();
        maximumReads = Math.max(maximumReads, step.measured.total);
        crossings += Number(step.before.checkpoint.position.spaceId !== step.after.checkpoint.position.spaceId);
        preparations += Number(step.request.command.type === 'prepare');
        if (step.after.checkpoint.phase === 'complete') { commands++; break; }
      }
      const measured = await window.stream.trace(() => window.stream.api.loadStreamSnapshot('stream'));
      return { snapshot: measured.result, snapshotReads: measured.total, maximumReads, crossings, preparations, commands,
        reused: window.streamReview.planner.diagnostics.work.reusedSteps };
    });
    commands += result.commands; maximumReads = Math.max(maximumReads, result.maximumReads);
    crossings += result.crossings; preparations += result.preparations; reused += result.reused;
    expect(result.snapshotReads).toBeLessThanOrEqual(8);
    complete = result.snapshot.checkpoint.phase === 'complete';
    await page.reload(); await page.waitForFunction(() => Boolean(window.streamReview));
    expect(await page.evaluate(() => window.stream.api.loadStreamSnapshot('stream'))).toEqual(result.snapshot);
  }
  expect(complete).toBe(true);
  const stored = await page.evaluate(async () => {
    const { api, raw, topology } = window.stream;
    const snapshot = await api.loadStreamSnapshot('stream');
    const { records, bytes } = await raw();
    const pages = records.filter(record => record.store === 'streamKnowledge');
    return { checkpoint: snapshot.checkpoint, pages: pages.length,
      opened: pages.reduce((total, record) => total + Object.values(record.value.chests).filter((value: any) => value.opened).length, 0),
      receipts: records.filter(record => record.store === 'streamActions').length, bytes,
      root: await topology.loadTopologyHeader('stream') };
  });
  expect(stored.pages).toBeGreaterThan(24);
  expect(stored.checkpoint.visitedSpaces).toBe(stored.pages); expect(stored.checkpoint.clearedSpaces).toBe(stored.pages);
  expect(stored.checkpoint.collectedChests).toBe(stored.opened); expect(stored.opened).toBe(stored.root!.header.rooms - 1);
  expect(stored.receipts).toBe(commands); expect(stored.root!.serializedBytes).toBe(stored.bytes);
  expect(crossings).toBe(2 * (stored.pages - 1)); expect(reused).toBeGreaterThan(20);
  console.log(JSON.stringify({ evidence: 'actual-IDB observed planner', commands, maximumReads, crossings, preparations,
    reused, spaces: stored.pages, chests: stored.opened, bytes: stored.bytes }));
});
