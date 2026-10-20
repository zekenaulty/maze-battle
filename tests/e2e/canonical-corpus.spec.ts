import { test, expect, corpusBrowser, evidence } from './canonical-corpus.test';
import { corpusNormalizer } from './canonical-corpus.normalize';
import { CORPUS_TIME } from './canonical-corpus.layout';

test('paired actor projections match until normal sight earns the junction difference', async ({ browser }, info) => {
  const a = await corpusBrowser(browser), b = await corpusBrowser(browser);
  try {
    const startA = await a.page.evaluate(() => window.canonicalCorpus.boot('A'));
    const startB = await b.page.evaluate(() => window.canonicalCorpus.boot('B'));
    await evidence(info, 'raw-cold-starts.json', { startA, startB });
    for (const boot of [startA, startB]) {
      expect(boot.before.checkpoint.knowledge).toBeNull(); expect(boot.before.head.roots.knowledge).toBeNull();
      expect(boot.before.counts.knowledge).toBe(0); expect(boot.before.quest).toBeNull();
      expect(boot.before.roster.inventory.items.some(item => item.baseId === 'survey-seal')).toBe(false);
      expect(boot.before.receipts.some(receipt => ['move', 'look'].includes((receipt.result as { kind?: string }).kind!))).toBe(false);
      expect(boot.surface.raw.position).toEqual(boot.before.checkpoint.position);
      expect(boot.surface.raw.sight!.cells).toEqual(boot.firstSight.cells);
      expect(boot.firstSight.header).toMatchObject({ radius: 7, count: 30, sequence: 1, previous: null });
      expect(boot.surface.raw.quests).toMatchObject([{ status: 'active', task: { progress: 0, required: 1 } }]);
      expect(boot.surface.raw.randomBattles).toBe(false);
      expect(boot.firstSight.cells.flatMap(cell => cell.chests)).toEqual([]);
    }
    expect(startA.before.world).not.toEqual(startB.before.world);
    const normalizeA = corpusNormalizer(), normalizeB = corpusNormalizer(), trace = [];
    expect(normalizeA.normalize(startA.surface.raw)).toEqual(normalizeB.normalize(startB.surface.raw));
    trace.push({ step: 0, a: startA.surface, b: startB.surface });
    let firstDivergence: number | null = null;
    for (let step = 1; step <= 7; step++) {
      const frames = [];
      for (const fixture of [a, b]) {
        await fixture.page.clock.setFixedTime(new Date(Date.parse(CORPUS_TIME) + step * 1000));
        frames.push(await fixture.page.evaluate(async () => {
          const f = window.canonicalCorpus; const receipts = await f.move('east');
          return { receipts, surface: await f.surface() };
        }));
      }
      const [left, right] = frames;
      await evidence(info, `raw-common-step-${step}.json`, { left, right });
      expect(left.surface.metrics.reads.some(r => r.area === 'world')).toBe(false);
      expect(right.surface.metrics.reads.some(r => r.area === 'world')).toBe(false);
      expect(left.surface.metrics.stats.writes).toBe(0); expect(right.surface.metrics.stats.writes).toBe(0);
      expect(Math.max(...left.surface.metrics.frameBytes, ...right.surface.metrics.frameBytes)).toBeLessThanOrEqual(2800);
      const sameSight = JSON.stringify(left.surface.raw.sight!.cells) === JSON.stringify(right.surface.raw.sight!.cells);
      if (!sameSight && firstDivergence === null) firstDivergence = step;
      const normalizedA = normalizeA.normalize(left.surface.raw), normalizedB = normalizeB.normalize(right.surface.raw);
      if (sameSight) {
        expect(normalizedA).toEqual(normalizedB);
        expect(left.surface.metrics.reads.length).toBe(right.surface.metrics.reads.length);
      } else expect(normalizedA).not.toEqual(normalizedB);
      trace.push({ step, a: left.surface, b: right.surface });
    }
    expect(firstDivergence).toBe(7);
    await evidence(info, 'paired-cold-start-and-earned-divergence.json', { startA, startB, trace, firstDivergence,
      identityAllowlistA: [...normalizeA.identities], identityAllowlistB: [...normalizeB.identities] });
  } finally { await a.close(); await b.close(); }
});

for (const variant of ['A', 'B'] as const) test(`${variant}: ordinary collection and actual reverse movement return the item to earned town entrance`, async ({ browser }, info) => {
  const f = await corpusBrowser(browser);
  try {
    const boot = await f.page.evaluate(variant => window.canonicalCorpus.boot(variant), variant);
    const junction = await f.page.evaluate(async () => {
      const f = window.canonicalCorpus, moves = await f.move('east', 12);
      return { moves, direction: await f.branch(), surface: await f.surface() };
    });
    expect(junction.direction).toBe(variant === 'A' ? 'east' : 'north');
    expect(junction.surface.raw.sight!.cells.flatMap(cell => cell.chests)).toEqual([]);
    const collected = await f.page.evaluate(async direction => {
      const f = window.canonicalCorpus, moves = await f.move(direction, 12), before = await f.audit();
      const receipt = await f.collect(); return { moves, before, receipt, after: await f.audit() };
    }, junction.direction);
    expect(collected.before.quest!.quest.status).toBe('active');
    expect(collected.before.roster.inventory.items.some(item => item.baseId === 'survey-seal')).toBe(false);
    expect(collected.after.quest).toMatchObject({ quest: { status: 'complete', task: { progress: 1 } }, award: { chestId: expect.any(String) } });
    const items = collected.after.roster.inventory.items.filter(item => item.baseId === 'survey-seal');
    expect(items).toHaveLength(1); expect(items[0].quantity).toBe(1);
    const returned = await f.page.evaluate(async () => {
      const f = window.canonicalCorpus, moves = await f.returnAlongReceipts();
      return { moves, audit: await f.audit(), surface: await f.surface() };
    });
    expect(returned.moves).toHaveLength(24);
    expect(returned.audit.checkpoint.position).toEqual(boot.before.checkpoint.position);
    expect(returned.audit.entrance!.at).toEqual(returned.audit.checkpoint.position);
    const actor = returned.surface.raw.sight!.cells.find(cell => JSON.stringify(cell.at) === JSON.stringify(returned.audit.checkpoint.position));
    expect(actor!.stairs).toContain('town');
    expect(returned.audit.roster.inventory.items.filter(item => item.baseId === 'survey-seal')).toEqual(items);
    await f.page.evaluate(() => window.canonicalCorpus.stop()); await f.page.reload();
    await f.page.waitForFunction(() => !!window.canonicalCorpus);
    const reload = await f.page.evaluate(async () => {
      const f = window.canonicalCorpus; await f.resume(); return f.audit();
    });
    expect(reload.quest).toEqual(returned.audit.quest);
    expect(reload.checkpoint.position).toEqual(returned.audit.checkpoint.position);
    expect(reload.roster.inventory.items).toEqual(returned.audit.roster.inventory.items);
    await evidence(info, `ordinary-${variant}-collection-return-reload.json`, { boot, junction, collected, returned, reload });
  } finally { await f.close(); }
});

test('authored initialization refuses an existing canonical game without rewriting it', async ({ browser }, info) => {
  const f = await corpusBrowser(browser);
  try {
    const result = await f.page.evaluate(async () => {
      const f = window.canonicalCorpus; await f.boot('A');
      const before = await f.audit(), refusal = await f.reinitialize('B').then(() => 'unexpected success', String);
      return { before, refusal, after: await f.audit() };
    });
    expect(result.refusal).toContain('game already exists'); expect(result.after).toEqual(result.before);
    await evidence(info, 'no-existing-save-overwrite.json', result);
  } finally { await f.close(); }
});
