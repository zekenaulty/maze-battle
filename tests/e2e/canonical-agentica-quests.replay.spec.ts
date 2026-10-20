import { test, expect, evidence } from './canonical-agentica-quests.test';

test('lost reply replays the exact original after journal change, page reload and owner change', async ({ page }, info) => {
  const setup = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests, boot = await f.boot();
    const original = await f.action({ scope: 'quests', status: 'active' }), retained = await f.loseReply(original);
    const changedId = await f.mutateJournal();
    return { boot, original, retained, changedId, rows: await f.journalRows(), trace: f.trace() };
  });
  expect(setup.retained.value!.result!.disposition).toBe('applied');
  expect(setup.trace.sent).toEqual([]); expect(setup.trace.lost).toHaveLength(1);
  expect(setup.trace.invocations).toBe(1);
  expect(setup.rows.find(quest => quest.id === setup.changedId)!.title).toMatch(/^Changed journal:/);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaQuests);
  const r = await page.evaluate(async original => {
    const f = window.canonicalAgenticaQuests, resumed = await f.resume(), before = await f.dump();
    const domain = await f.domainState(), replay = await f.dispatch(original, 'action.reconcile'), direct = await f.perform(original);
    return { resumed, before, domain, replay, direct, after: await f.dump(), afterDomain: await f.domainState(),
      retained: await f.retained(original), trace: f.trace() };
  }, setup.original);
  expect(r.resumed.head.owner).not.toBe(setup.boot.head.owner);
  expect(r.resumed.head.epoch).toBeGreaterThan(setup.boot.head.epoch);
  expect(r.replay).toEqual(setup.retained.value!.result); expect(r.direct).toEqual(r.replay);
  expect(r.retained.proof).toEqual(setup.retained.proof);
  expect(r.trace.invocations).toBe(0);
  expect(r.after).toBe(r.before); expect(r.afterDomain).toEqual(r.domain);
  expect(JSON.stringify(r.replay)).not.toContain('Changed journal:');
  await evidence(info, 'lost-query-reply-exact-historical-replay.json', { setup, r });
});

for (const kind of ['publication', 'original', 'result', 'mapping'] as const)
  test(`missing or altered ${kind} evidence cannot be repaired by a fresh query`, async ({ page }, info) => {
    const r = await page.evaluate(async kind => {
      const f = window.canonicalAgenticaQuests; await f.boot();
      const first = await f.list(); await f.removeEvidence(first.action, kind);
      const before = await f.dump(), result = await f.refusal(() => f.perform(first.action));
      return { first, before, result, after: await f.dump(), trace: f.trace() };
    }, kind);
    expect(r.result.rejected).toBe(true); expect(r.after).toBe(r.before);
    expect(r.trace.invocations).toBe(1); expect(r.trace.sent).toHaveLength(1);
    await evidence(info, `query-${kind}-evidence-fails-closed.json`, r);
  });

test('an unreserved query is unresolved and has no receipt or domain effect', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests; await f.boot();
    const original = await f.action({ scope: 'quests', status: 'active' }), before = await f.dump();
    const result = await f.perform(original);
    return { before, result, after: await f.dump(), retained: await f.retained(original) };
  });
  expect(r.result.disposition).toBe('unresolved'); expect(r.result.operation).toBeUndefined();
  expect(r.retained.value).toBeNull(); expect(r.after).toBe(r.before);
  await evidence(info, 'unreserved-query-is-effect-free.json', r);
});
