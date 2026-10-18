import { test, expect, evidence } from './canonical-agentica-interaction.test';
import { confirmed, effectsOf, expectSingleChestEffect, pulse, reloadOriginal } from './canonical-agentica-interaction.support';

for (const sequence of [2, 3]) test(`lost ${sequence === 2 ? 'progress' : 'terminal'} reply reconciles across full reload without reopening the chest`, async ({ page }, info) => {
  const { s, peer } = await confirmed(page); await pulse(page);
  const applied = await effectsOf(page); expectSingleChestEffect(s.before, applied);
  expect(await pulse(page)).toEqual({ status: 'locally-settled', progress: 'applied' });
  expect(await pulse(page)).toMatchObject({ status: 'decision-required' });
  await page.evaluate(() => window.canonicalAgenticaInteraction.cancel());
  if (sequence === 3) expect(await pulse(page)).toEqual({ status: 'terminal-prefix-delivered', sequence: 2 });
  peer.loseNext(sequence);
  expect(await page.evaluate(() => window.canonicalAgenticaInteraction.pulse().catch(String))).toContain('fetch');
  const before = (await page.evaluate(s => window.canonicalAgenticaInteraction.terminal(s.action, s.binding),
    { action: s.action, binding: s.binding })).value!;
  expect(before.bound.operation.state).toBe('settled'); expect(await effectsOf(page)).toEqual(applied);
  await reloadOriginal(page, s);
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'decision' });
  const after = (await page.evaluate(s => window.canonicalAgenticaInteraction.terminal(s.action, s.binding),
    { action: s.action, binding: s.binding })).value!;
  expect(after.bound.operation.state).toBe('acknowledged'); expect(after.bound.progress).toEqual(before.bound.progress);
  expect(after.event).toEqual(before.event); expect(peer.deliveries).toEqual([before.probe, before.previous]);
  expect(peer.stops).toEqual([before.event]); expect(peer.entry().wakeRunId).toBeUndefined();
  expect(await effectsOf(page)).toEqual(applied);
  const replay = await page.evaluate(async a => {
    const f = window.canonicalAgenticaInteraction, before = await f.dump(), result = await f.dispatch(a);
    return { before, after: await f.dump(), result };
  }, s.action);
  expect(replay.result).toEqual(s.admission); expect(replay.after).toBe(replay.before);
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'decision' });
  expect(peer.stops).toHaveLength(1); expect(peer.violations).toEqual([]);
  await evidence(info, `lost-reply-${sequence}-reload.json`, { s, applied, before, after, replay, deliveries: peer.deliveries, stops: peer.stops });
});
