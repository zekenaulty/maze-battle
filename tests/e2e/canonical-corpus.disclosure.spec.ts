import { test, expect, corpusBrowser, evidence } from './canonical-corpus.test';
import { CORPUS_TIME } from './canonical-corpus.layout';
import { corpusNormalizer } from './canonical-corpus.normalize';
import { corpusDifferences } from './canonical-corpus.diff';
import type { CanonicalHead } from '../../src/persistence/canonical/types';

test('controlled A/B prefix has exact earned payload and native storage work', async ({ browser }, info) => {
  const fixtures = [await corpusBrowser(browser, { controlled: true }), await corpusBrowser(browser, { controlled: true })];
  const normalizers = [corpusNormalizer(), corpusNormalizer()];
  const summary = [];
  try {
    const starts = [];
    for (const [index, variant] of (['A', 'B'] as const).entries()) {
      const fixture = fixtures[index];
      expect(await fixture.page.evaluate(() => indexedDB.databases())).toEqual([]);
      starts.push(await fixture.page.evaluate(variant => window.canonicalCorpus.boot(variant, true), variant));
    }
    await evidence(info, 'controlled-cold-starts.json', starts);
    expect(starts[0].before.world).not.toEqual(starts[1].before.world);
    const worldBytes = starts.map(boot => boot.before.world.reduce<number>((sum, row) => sum + Buffer.byteLength(JSON.stringify(row)), 0));
    const authoredByteDelta = worldBytes[1] - worldBytes[0];
    expect(authoredByteDelta).toBe(4);
    expect(starts[1].genesis.initialized.stats.writeBytes - starts[0].genesis.initialized.stats.writeBytes).toBe(authoredByteDelta);
    expect(starts[1].before.head.quota.usedBytes - starts[0].before.head.quota.usedBytes).toBe(authoredByteDelta);
    for (const boot of starts) {
      expect(boot.before.checkpoint.knowledge).toBeNull(); expect(boot.before.head.roots.knowledge).toBeNull();
      expect(boot.before.counts.knowledge).toBe(0); expect(boot.before.quest).toBeNull();
      expect(boot.firstSight.header).toMatchObject({ radius: 7, count: 30, sequence: 1, previous: null });
    }
    let firstDivergence: number | null = null;
    for (let step = 0; step <= 7; step++) {
      const frames = [];
      for (const [index, fixture] of fixtures.entries()) {
        await fixture.page.clock.setFixedTime(new Date(Date.parse(CORPUS_TIME) + step * 1000));
        const frame = step === 0 ? { receipts: [], surface: starts[index].surface } : await fixture.page.evaluate(async () => {
          const receipts = await window.canonicalCorpus.move('east');
          return { receipts, surface: await window.canonicalCorpus.surface(true) };
        });
        const control = await fixture.page.evaluate(() => ({ allocations: window.corpusControl!.allocations(),
          trace: window.corpusControl!.snapshot(), now: Date.now() }));
        frames.push({ ...frame, ...control });
      }
      await evidence(info, `controlled-raw-step-${step}.json`, frames);
      const [a, b] = frames, sameSight = JSON.stringify(a.surface.raw.sight!.cells) === JSON.stringify(b.surface.raw.sight!.cells);
      const nativeDifferences = corpusDifferences(a.surface.metrics.nativeReads, b.surface.metrics.nativeReads);
      const heads = frames.map(frame => frame.surface.metrics.nativeReads![1].result as CanonicalHead);
      const normalized = frames.map((frame, index) => normalizers[index].normalize(frame.surface.raw));
      await evidence(info, `controlled-normalized-step-${step}.json`, normalized);
      await evidence(info, `controlled-native-differences-${step}.json`, nativeDifferences);
      if (!sameSight && firstDivergence === null) firstDivergence = step;
      summary.push({ step, sameSight, stats: frames.map(f => f.surface.metrics.stats),
        allocations: frames.map(f => f.allocations.length), frames: frames.map(f => f.surface.metrics.frameBytes),
        exactPayload: JSON.stringify(a.surface.raw) === JSON.stringify(b.surface.raw),
        exactWork: JSON.stringify(a.surface.metrics.stats) === JSON.stringify(b.surface.metrics.stats),
        exactNativePayload: nativeDifferences.length === 0, usedBytes: heads.map(head => head.quota.usedBytes),
        logicalCalls: frames.map(frame => frame.surface.metrics.reads.length) });
      for (const frame of frames) {
        const { stats, nativeReads, reads, frameBytes } = frame.surface.metrics;
        expect(frame.trace).toMatchObject({ active: false, pending: 0, violations: [] });
        expect(nativeReads).toHaveLength(stats.reads);
        expect(nativeReads!.reduce((sum, read) => sum + read.bytes!, 0)).toBe(stats.readBytes);
        expect(nativeReads!.filter(read => read.error)).toEqual([]);
        expect(nativeReads![1].store).toBe('heads');
        const head = nativeReads![1].result as CanonicalHead;
        const worldRoots = nativeReads!.filter(read => read.store === 'nodes' && (read.key as string[])[1] === head.roots.world);
        expect(worldRoots).toHaveLength(frameBytes.length);
        for (const root of worldRoots) {
          expect(root.caller).toContain('CanonicalPages.snapshotAt');
          expect(root.result).toMatchObject({ node: { prefix: '' } });
        }
        expect(nativeReads!.filter(read => read.store === 'records' && (read.result as { area: string })?.area === 'world')).toEqual([]);
        expect(reads.some(read => read.area === 'world')).toBe(false);
        expect(stats.writes).toBe(0); expect(stats.writeBytes).toBe(0);
        expect(Math.max(...frameBytes)).toBeLessThanOrEqual(2800);
        expect(new Set(frame.allocations.map(row => row.id)).size).toBe(frame.allocations.length);
        expect(frame.allocations.length).toBeGreaterThan(0);
        expect(frame.now).toBe(Date.parse(CORPUS_TIME) + step * 1000);
      }
      if (sameSight) {
        // No normalization at all for the controlled payload, costs or logical access order.
        expect(a.allocations).toEqual(b.allocations);
        expect(a.surface.raw).toEqual(b.surface.raw);
        expect(JSON.stringify(a.surface.raw)).toBe(JSON.stringify(b.surface.raw));
        expect(normalized[0]).toEqual(normalized[1]);
        expect(a.surface.metrics.reads).toEqual(b.surface.metrics.reads);
        expect(a.surface.metrics.frameBytes).toEqual(b.surface.metrics.frameBytes);
        expect.soft(a.surface.metrics.stats, `Exact native work at step ${step}`).toEqual(b.surface.metrics.stats);
        // Explicit private payload inequality, not a normalization or equality claim.
        expect(heads[1].quota.usedBytes - heads[0].quota.usedBytes).toBe(authoredByteDelta);
        const policies = heads.map(head => head.quota.privateCapacity!);
        expect(policies[1].consumedBytes - policies[0].consumedBytes).toBe(authoredByteDelta);
        expect(policies[0].allocatedBytes).toBe(policies[1].allocatedBytes);
        expect(policies[0].active).toBeNull(); expect(policies[1].active).toBeNull();
        expect(heads[0].quota.usedBytes - policies[0].consumedBytes)
          .toBe(heads[1].quota.usedBytes - policies[1].consumedBytes);
        expect(nativeDifferences).toEqual([{ path: '/1/result/quota/usedBytes',
          left: { present: true, value: heads[0].quota.usedBytes }, right: { present: true, value: heads[1].quota.usedBytes } },
        { path: '/1/result/quota/privateCapacity/consumedBytes',
          left: { present: true, value: policies[0].consumedBytes }, right: { present: true, value: policies[1].consumedBytes } }]);
      } else expect(a.surface.raw).not.toEqual(b.surface.raw);
    }
    expect(firstDivergence).toBe(7);
  } finally {
    await evidence(info, 'controlled-summary.json', { summary,
      identityAllowlists: normalizers.map(normalizer => [...normalizer.identities]) });
    for (const [index, fixture] of fixtures.entries()) {
      await evidence(info, `controlled-final-diagnostics-${index}.json`, await fixture.page.evaluate(() => ({
        allocations: window.corpusControl!.allocations(), trace: window.corpusControl!.snapshot() })));
      await fixture.close();
    }
  }
});
