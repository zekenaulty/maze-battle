import { test, expect, evidence } from './canonical-agentica-quests.test';

test('ordinary guild acceptance supplies paged quest and detail wire results without domain effects or private IDs', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests, boot = await f.boot(), rows = await f.journalRows(), before = await f.domainState();
    const pages = await f.allPages(), proofs = [];
    for (const current of pages) proofs.push(await f.retained(current.action));
    const chosen = pages.flatMap(current => current.data.quests).find(quest => quest.task.objective === 'fetch')!;
    const detail = await f.detail(chosen.target), after = await f.domainState();
    const beforeReplay = await f.dump(), replay = await f.dispatch(pages[0].action), afterReplay = await f.dump();
    return { boot, rows, before, pages, proofs, detail, after, beforeReplay, replay, afterReplay,
      trace: f.trace(), sizes: [...pages.map(current => current.result), detail.result]
        .map(result => ({ observation: f.bytes(result.observation), result: f.bytes(result) })) };
  });
  expect(r.boot.start.capabilities).toHaveLength(5);
  expect(r.boot.start.capabilities.map(capability => capability.id)).not.toContain('quest.context');
  expect(r.boot.start.observation.data).not.toHaveProperty('quests');
  expect(r.boot.start.observation.data).not.toHaveProperty('inventory');
  expect(r.boot.accepted.length).toBeGreaterThan(4);
  expect(r.boot.receipts).toHaveLength(r.boot.accepted.length);
  for (const receipt of r.boot.receipts) expect(receipt.result).toMatchObject({ kind: 'accept-quest', outcome: 'applied' });
  expect(r.pages.length).toBeGreaterThan(1);
  const summaries = r.pages.flatMap(current => current.data.quests);
  const expected = r.rows.map(quest => ({ title: quest.title, status: quest.status,
    task: { objective: quest.task.objective, noun: quest.task.noun, required: quest.task.required, progress: quest.task.progress },
    reward: quest.reward }));
  expect(summaries.map(({ target: _target, ...quest }) => quest)).toEqual(expected);
  for (const current of r.pages) {
    expect(current.data).toMatchObject({ scope: 'quests', floor: 1, status: 'active' });
    expect(current.data.quests.length).toBeGreaterThan(0); expect(current.data.quests.length).toBeLessThanOrEqual(4);
    expect(current.result.disposition).toBe('applied'); expect(current.result.operation).toBeUndefined();
  }
  expect(r.pages.at(-1)!.data.next).toBeUndefined();
  const references = r.proofs.flatMap(proof => {
    const value = proof.proof!.row.value as unknown as { query: { rows: { key: string; id: string }[] } };
    return value.query.rows.map(row => row.key);
  });
  expect(references).toEqual(r.rows.map(quest => `quest/${quest.id}`));
  expect(new Set(references).size).toBe(r.rows.length);
  const fetch = r.rows.find(quest => quest.task.objective === 'fetch')!;
  expect(r.detail.data).toMatchObject({ scope: 'quest', floor: 1, quest: {
    title: fetch.title, description: fetch.description, targetName: fetch.targetRoomName,
    acceptedAt: fetch.acceptedAt, task: { itemName: fetch.task.item!.displayName }, reward: fetch.reward,
  } });
  for (const proof of r.proofs) {
    expect(proof.value!.original.effect).toBe('readOnly');
    expect(proof.proof!.source.operation).toBe('agentica.action.resolve');
    expect(proof.proof!.receipt.result).toMatchObject({ recordId: proof.proof!.row.id });
  }
  const wire = JSON.stringify(r.trace.sent);
  for (const quest of r.rows) for (const id of [quest.id, quest.originRoomId, quest.targetRoomId,
    `quest-item:${quest.id}`, ...(quest.task.item ? [quest.task.item.baseId] : [])]) {
    expect(wire).not.toContain(id);
    expect(wire).not.toContain(Buffer.from(id).toString('base64'));
  }
  expect(wire).not.toContain('"query"'); expect(wire).not.toContain('quests/floor/');
  for (const size of r.sizes) {
    expect(size.observation).toBeLessThanOrEqual(2800); expect(size.result).toBeLessThanOrEqual(4096);
  }
  expect(r.after).toEqual(r.before);
  expect(r.replay).toEqual(r.pages[0].result); expect(r.afterReplay).toBe(r.beforeReplay);
  await evidence(info, 'quest-query-wire-and-canonical-provenance.json', r);
});

test('reader is current-floor scoped and excludes unaccepted offers and other statuses', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests, boot = await f.boot({ accept: 2 }), before = await f.domainState();
    const active = await f.list(), complete = await f.list('complete'), claimed = await f.list('claimed');
    const foreign = await f.action({ scope: 'quests', status: 'active', level: 2 }), result = await f.dispatch(foreign);
    return { boot, before, active, complete, claimed, result, after: await f.domainState() };
  });
  expect(r.boot.offers.length).toBeGreaterThan(r.boot.accepted.length);
  expect(r.active.data.quests).toHaveLength(2); expect(r.active.data.next).toBeUndefined();
  for (const current of [r.complete, r.claimed]) {
    expect(current.data.quests).toEqual([]); expect(current.data.next).toBeUndefined();
    expect(current.result.disposition).toBe('applied');
  }
  expect(r.result.disposition).toBe('refused'); expect(r.result.operation).toBeUndefined();
  expect(r.after).toEqual(r.before);
  await evidence(info, 'accepted-membership-and-floor-scope.json', r);
});

test('source-backed query needs no geometry, room content, chest or award-source lookup', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaQuests; await f.boot();
    const original = await f.action({ scope: 'quests', status: 'active' }); await f.reserve(original);
    const before = await f.dump(), domain = await f.domainState(), query = await f.guarded(original);
    const hidden = await f.hiddenUnavailable(original), afterProbe = await f.dump();
    const result = await f.perform(original);
    const data = result.observation!.data as unknown as { quests: { target: string }[] };
    const selected = await f.action({ scope: 'quest', target: data.quests[0].target }); await f.reserve(selected);
    const detail = await f.guarded(selected), detailHidden = await f.hiddenUnavailable(selected);
    const detailResult = await f.perform(selected);
    return { original, before, query, hidden, afterProbe, result, detail, detailHidden, detailResult,
      domain, after: await f.domainState() };
  });
  expect(r.hidden.removed).toBeGreaterThan(0); expect(r.detailHidden.removed).toBeGreaterThan(0);
  expect(r.hidden.result.value).toEqual(r.query.value);
  expect(r.detailHidden.result.value).toEqual(r.detail.value);
  expect(r.afterProbe).toBe(r.before);
  expect(r.result.observation!.data).toEqual(r.query.value.observation.data);
  expect(r.detailResult.observation!.data).toEqual(r.detail.value.observation.data);
  for (const query of [r.query, r.detail]) {
    const reads = query.accesses.filter(access => access.area === 'world');
    expect(reads.length).toBeLessThanOrEqual(32); expect(query.worldBytes).toBeLessThanOrEqual(128 * 1024);
    expect(reads.filter(access => access.method === 'scan').every(access => access.count! <= 4)).toBe(true);
    expect(query.stats.writes).toBe(0); expect(query.stats.reads).toBeLessThanOrEqual(2048);
    expect(JSON.stringify(reads)).not.toMatch(/dungeon\/|roster\/|quests\/target\//);
  }
  expect(r.after).toEqual(r.domain);
  await evidence(info, 'quest-reader-hidden-record-independence.json', r);
});
