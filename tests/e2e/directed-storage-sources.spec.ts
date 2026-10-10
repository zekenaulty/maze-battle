import { expect, test } from '@playwright/test';
import { openFixture } from './directed-storage-support';

test.beforeEach(async ({ page }) => openFixture(page));
for (const historyMode of ['checkpoint-v1', 'legacy-full-audit'] as const) {
  test(`${historyMode}: source contexts preserve exact missing and observed history after reload`, async ({ page }) => {
    const initial = await page.evaluate(async historyMode => {
      const db = window.directedStorage;
      await db.createDirectedSave('sources', { historyMode }); await db.claimDirectedSave('sources', 'owner');
      const before = (await db.readDirectedSave('sources'))!;
      const prefix = `${before.world.id}:${before.actor.id}:observation:`;
      const ids = [`${prefix}1`, `${prefix}${before.knowledge.revision + 1}`];
      const captured = await db.captureDirectedSourceContext('sources', 'sources-context', 'decision-fixture', ids);
      const human = await db.captureDirectedSourceContext('sources', 'human-context', 'human-view', ids);
      const after = await db.readDirectedSave('sources');
      await db.executeDirectedRequest('sources', await db.request('sources', 'look', { type: 'look' }), 100);
      return { before, after, captured, human, ids };
    }, historyMode);
    expect(initial.before).toEqual(initial.after);
    expect(initial.captured.json).toBe(initial.human.json);
    const body = JSON.parse(initial.captured.json);
    expect(body.observations).toHaveLength(1); expect(body.missingIds).toEqual([initial.ids[1]]);
    expect(initial.captured.json).not.toContain('sourceWorldRevision');
    await page.reload();
    const restored = await page.evaluate(async ids => {
      const db = window.directedStorage;
      const replay = await db.captureDirectedSourceContext('sources', 'sources-context', 'decision-fixture', ids);
      const fresh = await db.captureDirectedSourceContext('sources', 'new-context', 'decision-fixture', ids);
      const read = await db.readDirectedObservationSources('sources', ids);
      const audit = await db.auditDirectedSave('sources');
      return { replay, fresh, read, archived: audit.contexts.find(value => value.id === 'sources-context') };
    }, initial.ids);
    expect(restored.replay).toEqual(initial.captured); expect(restored.archived).toEqual(initial.captured);
    expect(JSON.parse(restored.fresh.json).observations).toHaveLength(2);
    expect(restored.fresh.json).toBe(restored.read.json);
    expect(JSON.parse(restored.fresh.json).observations[0]).toEqual(body.observations[0]);
  });
}

test('source context bounds and selection identity fail closed', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const db = window.directedStorage;
    await db.createDirectedSave('sources', { historyMode: 'checkpoint-v1' });
    await db.captureDirectedSourceContext('sources', 'fixed', 'human-view', []);
    const errors = [];
    for (const ids of [Array.from({ length: 9 }, (_, i) => `source-${i}`), ['duplicate', 'duplicate'], ['other']]) {
      try { await db.captureDirectedSourceContext('sources', 'fixed', 'human-view', ids); errors.push('unexpected success'); }
      catch (error) { errors.push(String(error)); }
    }
    return errors;
  });
  expect(errors[0]).toContain('source ID limit'); expect(errors[1]).toContain('duplicate'); expect(errors[2]).toContain('payload conflict');
});
