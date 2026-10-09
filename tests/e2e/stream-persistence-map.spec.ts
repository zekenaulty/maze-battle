import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-map';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/stream-persistence-map.html'); await page.waitForFunction(() => Boolean(window.streamMap));
});

for (const extraPages of [0, 30, 300]) test(`bounded knowledge-only listing and exact read with ${extraPages + 2} saved pages`, async ({ page }) => {
  const result = await page.evaluate(async extraPages => {
    const { api, setup, trace } = window.streamMap;
    const initial = await setup(extraPages), before = await window.stream.raw();
    const ids: string[] = [], counts: number[] = [], cursorRecords: number[] = [];
    let cursor: string | undefined, listing;
    do {
      const measured = await trace(() => api.listDiscoveredSpaces('stream', { cursor }));
      listing = measured.result;
      if (JSON.stringify(measured.reads) !== JSON.stringify({ roots: 1, streamCheckpoints: 1 })) throw new Error('Unexpected metadata reads');
      counts.push(listing.summaries.length); cursorRecords.push(measured.cursorRecords);
      ids.push(...listing.summaries.map(summary => summary.spaceId));
      cursor = listing.nextCursor;
      if (cursor) {
        const payload = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'));
        if (payload.includes(initial.checkpoint.scopeId) || payload.includes('spaces-v2')) throw new Error('Private scope in cursor');
      }
    } while (cursor);
    const exact = await trace(() => api.readDiscoveredSpace('stream', 'entry', { expectedView: listing!.view }));
    const missing = await trace(() => api.readDiscoveredSpace('stream', 'socket-0:room', { expectedView: listing!.view }));
    const storedEntry = before.records.find(record => record.store === 'streamKnowledge' && Array.isArray(record.key) && record.key[1] === 'entry')!.value;
    return { ids, counts, cursorRecords, exact, missing, storedEntry, view: listing!.view, initial,
      unchanged: JSON.stringify(before) === JSON.stringify(await window.stream.raw()) };
  }, extraPages);
  expect(result.ids).toHaveLength(extraPages + 2); expect(new Set(result.ids).size).toBe(result.ids.length);
  expect(result.ids).toEqual([...result.ids].sort()); expect(Math.max(...result.counts)).toBeLessThanOrEqual(12);
  expect(Math.max(...result.cursorRecords)).toBeLessThanOrEqual(13);
  if (extraPages) expect(result.cursorRecords[0]).toBe(13);
  expect(result.view).toEqual({ scopeId: result.initial.publicScopeId, revision: result.initial.checkpoint.revision,
    topologyRevision: result.initial.checkpoint.topologyRevision });
  expect(result.exact.reads).toEqual({ roots: 1, streamCheckpoints: 1, streamKnowledge: 1 });
  expect(result.exact.result?.knowledge).toEqual(result.storedEntry);
  expect(result.exact.result?.pageRevision).toBe(result.storedEntry.revision);
  expect(result.missing.result).toBeUndefined(); expect(result.unchanged).toBe(true);
});

test('map reads do not allocate an absent public scope', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await window.stream.setup();
    const before = await window.stream.raw();
    let code = '';
    try { await window.streamMap.api.listDiscoveredSpaces('stream'); } catch (error) { code = (error as { code: string }).code; }
    return { code, unchanged: JSON.stringify(before) === JSON.stringify(await window.stream.raw()) };
  });
  expect(result.code).toBe('PUBLIC_SCOPE_REQUIRED'); expect(result.unchanged).toBe(true);
});

test('a real observed planner floor lists only persisted pages after reload', async ({ page }) => {
  const complete = await page.evaluate(async () => {
    await window.stream.setup(); await window.stream.api.ensureStreamPublicScope('stream');
    for (let step = 0; step < 2000; step++) {
      const result = await window.streamReview.step();
      if (result.after.checkpoint.phase === 'complete') return result.after.checkpoint;
    }
    throw new Error('Planner did not finish');
  });
  await page.reload(); await page.waitForFunction(() => Boolean(window.streamMap));
  const result = await page.evaluate(async () => {
    const { api, trace } = window.streamMap;
    let cursor: string | undefined;
    let pages = 0, opened = 0, cleared = 0;
    do {
      const { result } = await trace(() => api.listDiscoveredSpaces('stream', { cursor }));
      pages += result.summaries.length;
      opened += result.summaries.reduce((total, summary) => total + summary.openedChests, 0);
      cleared += result.summaries.filter(summary => summary.cleared).length;
      cursor = result.nextCursor;
    } while (cursor);
    return { pages, opened, cleared };
  });
  expect(result).toEqual({ pages: complete.visitedSpaces, opened: complete.collectedChests, cleared: complete.clearedSpaces });
});
