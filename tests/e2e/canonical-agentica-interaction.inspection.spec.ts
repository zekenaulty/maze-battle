import { test, expect, evidence } from './canonical-agentica-interaction.test';

test('actual action hooks reserve and inspect the public current cell without content or sight effects', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaInteraction, boot = await f.boot(), before = await f.effects();
    const inspected = await f.inspectCurrent(), after = await f.effects(), retained = await f.retained(inspected.action);
    const beforeReplay = await f.dump(), replay = await f.dispatch(inspected.action), afterReplay = await f.dump();
    return { boot, before, inspected, after, retained, beforeReplay, replay, afterReplay };
  });
  await evidence(info, 'current-cell-inspection.json', r);
  expect(r.inspected.action.arguments).toEqual({ scope: 'cell',
    ...Object.fromEntries(Object.entries(r.boot.observation.data.actor as Record<string, unknown>)
      .filter(([key]) => ['level', 'spaceId', 'row', 'column'].includes(key))) });
  expect(r.inspected.result.disposition).toBe('applied');
  expect(r.inspected.result.observation).toMatchObject({ data: { scope: 'cell', cell: { state: 'visible' } } });
  expect(r.inspected.result.operation).toBeUndefined();
  expect(r.retained.value!.original.action).toEqual(r.inspected.action);
  expect(r.retained.value!.original.effect).toBe('readOnly');
  expect(r.retained.value!.result).toEqual(r.inspected.result);
  expect(r.after).toEqual(r.before);
  expect(r.replay).toEqual(r.inspected.result); expect(r.afterReplay).toBe(r.beforeReplay);
});
