import { test, expect, attachEvidence } from './canonical-frontier-exploration.test';

test('newly visible adjoining space stops exploration without crossing or claiming room completion', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed('A', 'scope-boundary'), effects = await c.effects();
    const admission = await c.admit(seeded.page.value[0]), rows = await c.capture(admission.id, 2);
    return { seeded, admission, rows, effects, afterEffects: await c.effects() };
  });
  await attachEvidence(info, 'other-space-visible.json', result);
  expect(result.rows).toHaveLength(2);
  const last = result.rows[1], progress = last.state.value.progress, notice = progress.notice!;
  expect(progress).toMatchObject({ steps: 1, status: 'decision', reason: 'scope-boundary', route: [] });
  expect(progress.position.cell.spaceId).toBe(result.seeded.sight.header.actor.cell.spaceId);
  expect(notice).toMatchObject({ kind: 'other-space-visible', previousSource: null });
  expect(notice.at.cell.spaceId).not.toBe(progress.position.cell.spaceId);
  const source = last.state.head.checkpoint.knowledge as { sequence: number; id: string };
  expect(notice.source).toEqual({ sequence: source.sequence, id: source.id, index: notice.source.index });
  expect(last.frame.sight.cells[notice.source.index].at).toEqual(notice.at);
  expect(result.seeded.sight.cells.every(cell => cell.at.cell.spaceId === progress.position.cell.spaceId)).toBe(true);
  expect(last.frame.sight.cells.some(cell => cell.chests.length || cell.stairs.length)).toBe(false);
  expect(last.state.head.roots.world).toEqual(result.seeded.page.head.roots.world);
  expect(result.afterEffects).toEqual(result.effects);
});
