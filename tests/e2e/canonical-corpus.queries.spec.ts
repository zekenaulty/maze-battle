import { test, expect, corpusBrowser, evidence } from './canonical-corpus.test';
import { CORPUS_TIME } from './canonical-corpus.layout';

for (const step of [0, 6, 7]) test(`paired dispatched journal/objective/history/recall queries at common-prefix step ${step}`, async ({ browser }, info) => {
  const fixtures = [await corpusBrowser(browser, { controlled: true }), await corpusBrowser(browser, { controlled: true })];
  const results = [];
  try {
    for (const [index, variant] of (['A', 'B'] as const).entries()) {
      const page = fixtures[index].page;
      const boot = await page.evaluate(variant => window.canonicalCorpus.boot(variant), variant);
      const recalled = [...boot.firstSight.cells].sort((a, b) => a.world.column - b.world.column || a.world.row - b.world.row)[0].at;
      for (let i = 1; i <= step; i++) {
        await page.clock.setFixedTime(new Date(Date.parse(CORPUS_TIME) + i * 1000));
        await page.evaluate(() => window.canonicalCorpus.move('east'));
      }
      const batch = await page.evaluate(recalled => window.canonicalCorpus.queries(recalled), recalled);
      results.push(batch); await evidence(info, `raw-${variant}-queries-step-${step}.json`, { recalled, batch });
      expect(batch.frames.map(frame => frame.action.arguments.scope)).toEqual([
        'quests', 'quest', 'quests', 'quests', 'objective', 'decision', 'cell', 'cell', 'quest',
      ]);
      expect(batch.frames.map(frame => frame.result.disposition)).toEqual([
        'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'refused',
      ]);
      const data = batch.frames.map(frame => frame.result.observation.data);
      expect(data[0]).toMatchObject({ scope: 'quests', status: 'active', quests: [{ title: 'Recover the Survey Seal' }] });
      expect(data[1]).toMatchObject({ scope: 'quest', quest: { status: 'active', task: { objective: 'fetch', progress: 0, required: 1 } } });
      expect(data[2].quests).toEqual([]); expect(data[3].quests).toEqual([]);
      expect(data[4]).toMatchObject({ scope: 'objective', status: 'pending', carried: 0 });
      expect(data[5]).toMatchObject({ scope: 'decision', state: 'unavailable' });
      expect(data[6]).toMatchObject({ scope: 'cell', cell: {
        at: { level: recalled.level, ...recalled.cell }, state: step === 0 ? 'visible' : 'remembered',
      } });
      expect(data[7]).toMatchObject({ scope: 'cell', state: 'unknown' });
      expect(data[7]).not.toHaveProperty('cell');
      expect(batch.after.checkpoint).toEqual(batch.before.checkpoint);
      expect(batch.after.roots.world).toBe(batch.before.roots.world);
      expect(batch.after.roots.knowledge).toBe(batch.before.roots.knowledge);
      expect(Math.max(...batch.observationBytes)).toBeLessThanOrEqual(2800);
      expect(Math.max(...batch.resultBytes)).toBeLessThanOrEqual(4096);
      expect(batch.commits).toHaveLength(18);
      expect(batch.commits.every(row => row.operation === 'agentica.action.reserve' || row.operation === 'agentica.action.resolve')).toBe(true);
    }
    const [a, b] = results;
    if (step < 7) {
      expect(a.start).toEqual(b.start);
      expect(a.frames).toEqual(b.frames);
      expect(a.commits).toEqual(b.commits);
      expect(a.observationBytes).toEqual(b.observationBytes); expect(a.resultBytes).toEqual(b.resultBytes);
    } else {
      // No equality claim after real sight first diverges. Journal facts still describe the same accepted task.
      expect(a.frames[1].result.observation.data.quest).toEqual(b.frames[1].result.observation.data.quest);
    }
  } finally { for (const fixture of fixtures) await fixture.close(); }
});
