import { test, expect, evidence } from './canonical-agentica-quests.test';

test('multibyte summaries page at the byte bound without silently skipping candidates', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests; await f.boot({ text: 'paged' });
    const before = await f.domainState(), rows = await f.journalRows(), pages = await f.allPages(), proofs = [];
    for (const current of pages) proofs.push(await f.retained(current.action));
    return { before, rows, pages, proofs, after: await f.domainState(),
      sizes: pages.map(current => ({ observation: f.bytes(current.result.observation), result: f.bytes(current.result) })) };
  });
  expect(r.pages.length).toBeGreaterThan(Math.ceil(r.rows.length / 4));
  expect(r.pages.flatMap(current => current.data.quests.map(quest => quest.title))).toEqual(r.rows.map(quest => quest.title));
  const references = r.proofs.flatMap(proof =>
    (proof.proof!.row.value as unknown as { query: { rows: { key: string }[] } }).query.rows.map(row => row.key));
  expect(references).toEqual(r.rows.map(quest => `quest/${quest.id}`)); expect(new Set(references).size).toBe(r.rows.length);
  for (const size of r.sizes) {
    expect(size.observation).toBeLessThanOrEqual(2800); expect(size.result).toBeLessThanOrEqual(4096);
  }
  expect(r.after).toEqual(r.before);
  await evidence(info, 'multibyte-quest-pagination-no-skips.json', r);
});

test('valid stored detail exceeding the observation byte limit explicitly refuses and retains that original refusal', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests; await f.boot({ text: 'oversized-detail' });
    const first = await f.list(), original = await f.action({ scope: 'quest', target: first.data.quests[0].target });
    const before = await f.domainState(), result = await f.dispatch(original), retained = await f.retained(original);
    const beforeReplay = await f.dump(), replay = await f.dispatch(original);
    return { first, before, result, retained, replay, beforeReplay, afterReplay: await f.dump(), after: await f.domainState(),
      sizes: { result: f.bytes(result), observation: f.bytes(result.observation) } };
  });
  expect(r.result.disposition).toBe('refused'); expect(r.result.summary).toMatch(/exceeds|bounded|size/i);
  expect(r.result.observation!.data).not.toHaveProperty('quest');
  expect(r.retained.proof!.row.value).not.toHaveProperty('query');
  expect(r.replay).toEqual(r.result); expect(r.afterReplay).toBe(r.beforeReplay);
  expect(r.sizes.result).toBeLessThanOrEqual(4096); expect(r.sizes.observation).toBeLessThanOrEqual(2800);
  expect(r.after).toEqual(r.before);
  await evidence(info, 'oversized-quest-detail-explicit-refusal.json', r);
});

for (const stage of ['reservation', 'result'] as const) test(`quota failure rolls back quest ${stage} without spending funded reserves`, async ({ page }, info) => {
  const r = await page.evaluate(async stage => {
    const f = window.canonicalAgenticaQuests; await f.boot();
    const original = await f.action({ scope: 'quests', status: 'active' });
    if (stage === 'result') await f.reserve(original);
    const exhausted = await f.exhaustQuota(), before = await f.dump(), domain = await f.domainState();
    const result = await f.refusal(() => stage === 'result' ? f.perform(original) : f.reserve(original));
    return { original, exhausted, before, domain, result, after: await f.dump(), afterDomain: await f.domainState(),
      head: await f.head(), retained: await f.retained(original) };
  }, stage);
  expect(r.result.rejected).toBe(true); expect(r.result.message).toMatch(/quota|capacity|budget/i);
  expect(r.after).toBe(r.before); expect(r.afterDomain).toEqual(r.domain);
  expect(r.head.allocations).toEqual(r.exhausted.allocations); expect(r.head.quota).toEqual(r.exhausted.quota);
  expect(r.head.quota.reservations).toBeGreaterThan(0);
  if (stage === 'result') expect(r.retained.value!.result).toBeNull();
  else expect(r.retained.value).toBeNull();
  await evidence(info, `quest-${stage}-quota-rollback.json`, r);
});
