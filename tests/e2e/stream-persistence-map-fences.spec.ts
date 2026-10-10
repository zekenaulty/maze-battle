import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-map';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/stream-persistence-map.html'); await page.waitForFunction(() => Boolean(window.streamMap));
  await page.evaluate(() => window.streamMap.setup());
});

test('revision fences survive control/refusal changes but reject after progress, including across reload', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const { api } = window.streamMap;
    const first = await api.listDiscoveredSpaces('stream');
    await window.stream.api.claimStreamControl('stream', 'other-owner', 0);
    const refusal = await window.stream.act({ type: 'collect' });
    if (refusal.disposition !== 'refused') throw new Error('Expected a durable refusal');
    await api.listDiscoveredSpaces('stream', { cursor: first.nextCursor });
    await window.streamReview.step();
    return first;
  });
  await page.reload(); await page.waitForFunction(() => Boolean(window.streamMap));
  const result = await page.evaluate(async original => {
    const { api, trace } = window.streamMap;
    const codes: string[] = [];
    for (const operation of [() => api.listDiscoveredSpaces('stream', { cursor: original.nextCursor }),
      () => api.readDiscoveredSpace('stream', 'entry', { expectedView: original.view })]) {
      try { await trace<unknown>(operation); codes.push('accepted'); } catch (error) { codes.push((error as { code: string }).code); }
    }
    const fresh = (await trace(() => api.listDiscoveredSpaces('stream'))).result;
    const entry = fresh.summaries.find(value => value.spaceId === 'entry')!;
    const page = await api.readDiscoveredSpace('stream', 'entry', { expectedView: fresh.view, expectedPageRevision: entry.pageRevision });
    return { codes, fresh, page };
  }, original);
  expect(result.codes).toEqual(['STALE_VIEW', 'STALE_VIEW']);
  expect(result.page!.pageRevision).toBeLessThan(result.fresh.view.revision);
  expect(Object.values(result.page!.knowledge.cells).some(cell => cell.observedAt < result.page!.pageRevision)).toBe(true);
});

test('scope mismatch, private-scope input and malformed limits/cursors reject without exposing internal identity', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api } = window.streamMap;
    const first = await api.listDiscoveredSpaces('stream');
    await window.stream.setup(undefined, 'other'); await window.stream.api.ensureStreamPublicScope('other');
    const errors: { code: string; message: string }[] = [];
    for (const operation of [() => api.listDiscoveredSpaces('other', { cursor: first.nextCursor }),
      () => api.listDiscoveredSpaces('stream', { limit: 13 }), () => api.listDiscoveredSpaces('stream', { limit: null as unknown as number }),
      () => api.listDiscoveredSpaces('stream', { cursor: 'x'.repeat(2049) }),
      () => api.listDiscoveredSpaces('stream', { expectedView: { ...first.view, scopeId: '["spaces-v2","seed",42]' } })]) {
      try { await operation(); errors.push({ code: 'accepted', message: '' }); }
      catch (error) { errors.push({ code: (error as { code: string }).code, message: String(error) }); }
    }
    return errors;
  });
  expect(result.map(error => error.code)).toEqual(['STALE_VIEW', 'INVALID_REQUEST', 'INVALID_REQUEST', 'INVALID_REQUEST', 'INVALID_REQUEST']);
  expect(JSON.stringify(result)).not.toContain('spaces-v2'); expect(JSON.stringify(result)).not.toContain('seed');
});

test('corrupt or missing promised page rejects; no repairs, skipped rows, or fabricated observations', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api } = window.streamMap, { raw, openDB, topology } = window.stream;
    const listing = await api.listDiscoveredSpaces('stream');
    const entry = listing.summaries[0];
    const db = await openDB(topology.TOPOLOGY_DATABASE);
    const key = ['stream', entry.spaceId];
    const original = await db.get('streamKnowledge', key);
    const codes: string[] = [];
    for (const value of [undefined, null, false, { ...original, revision: listing.view.revision + 1 }, { ...original, seed: 42 }]) {
      await db.put('streamKnowledge', value, key);
      const before = await raw();
      for (const operation of [() => api.listDiscoveredSpaces('stream'),
        () => api.readDiscoveredSpace('stream', entry.spaceId, { expectedView: listing.view })]) {
        try { await operation(); codes.push('accepted'); } catch (error) { codes.push((error as { code: string }).code); }
      }
      if (JSON.stringify(before) !== JSON.stringify(await raw())) throw new Error('Map rewrote corrupt record');
    }
    await db.delete('streamKnowledge', key);
    try { await api.readDiscoveredSpace('stream', entry.spaceId, { expectedView: listing.view, expectedPageRevision: entry.pageRevision }); }
    catch (error) { codes.push((error as { code: string }).code); }
    await db.put('streamKnowledge', original, key); db.close();
    try { await api.readDiscoveredSpace('stream', entry.spaceId, { expectedView: listing.view, expectedPageRevision: entry.pageRevision + 1 }); }
    catch (error) { codes.push((error as { code: string }).code); }
    return codes;
  });
  expect(result).toHaveLength(12); expect(result.every(code => code === 'CORRUPT_RECORD')).toBe(true);
});
