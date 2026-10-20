import { test, expect, evidence } from './canonical-return-objective.test';

test('ordinary accepted single-item fetch and earned entrance share one immutable publication receipt', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalReturnObjective, boot = await f.boot(), before = await f.nativeState(), domain = await f.domainState();
    const bound = await f.publish(), after = await f.nativeState();
    return { boot, before, domain, bound, after, afterDomain: await f.domainState(), reread: await f.read(bound.ref) };
  });
  const goal = r.bound.proof.publication.objective!;
  expect(r.boot.accepted).toHaveLength(1);
  expect(r.boot.receipts).toHaveLength(1);
  expect(r.boot.accepted[0]).toMatchObject({ id: r.boot.questId, status: 'active', task: { objective: 'fetch', required: 1, progress: 0 } });
  expect(goal).toMatchObject({ schema: 1, kind: 'retrieve-return', launchId: r.bound.goal.launchId, objectiveId: r.bound.goal.objectiveId,
    quest: { questId: r.boot.questId, title: r.boot.accepted[0].title, item: r.boot.accepted[0].task.item,
      acceptedAt: r.boot.accepted[0].acceptedAt }, entrance: { at: r.boot.sight.entrance.at } });
  const quest = r.before.records.find(row => row.id === goal.quest.ref.id)!;
  expect(quest.key).toBe(`quest/${r.boot.questId}`);
  expect((quest.value as { quest: unknown }).quest).toEqual(r.boot.accepted[0]);
  const source = r.before.records.find(row => row.id === goal.entrance.source.id)!;
  const header = source.value as { sequence: number; chunks: string[] };
  const chunk = r.before.records.find(row => row.id === header.chunks[Math.floor(goal.entrance.source.index / 16)])!;
  const cell = (chunk.value as { cells: { at: unknown; stairs: string[] }[] }).cells[goal.entrance.source.index % 16];
  expect(header.sequence).toBe(goal.entrance.source.sequence);
  expect(cell.at).toEqual(goal.entrance.at); expect(cell.stairs).toContain('town');
  expect(r.after.head.revision).toBe(r.before.head.revision + 1);
  expect(r.after.records.length - r.before.records.length).toBe(1);
  expect(r.after.receipts.length - r.before.receipts.length).toBe(1);
  expect(r.after.operations).toEqual(r.before.operations);
  expect(r.afterDomain).toEqual(r.domain);
  expect(r.bound.proof.receipt).toEqual(r.bound.receipt);
  expect(JSON.parse((r.bound.receipt.result as { snapshotWitness: string }).snapshotWitness)).toEqual(r.bound.proof.record);
  expect(r.bound.proof.source).toEqual(r.bound.original);
  expect(r.reread).toEqual(r.bound.proof);
  expect(r.bound.reads.filter(r => r.area === 'world').map(r => r.key)).toEqual([
    `quest/${r.boot.questId}`, `quest/${r.boot.questId}`, `contract/${r.boot.questId}`,
  ]);
  expect(r.bound.reads.filter(r => r.area === 'knowledge').length).toBeLessThanOrEqual(64);
  expect(r.bound.reads.some(r => r.method === 'scan')).toBe(false);
  expect(r.bound.reads.filter(r => r.method === 'set')).toEqual([
    { method: 'set', area: 'execution', key: r.bound.ref.key },
  ]);
  await evidence(info, 'atomic-source-binding-and-bounded-reads.json', r);
});

test('staged typed binding abort leaves no publication, receipt, allocation or domain change', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalReturnObjective; await f.boot();
    const before = await f.dump(), result = await f.refusal(() => f.publish(f.choice(), false, false, true));
    return { before, result, after: await f.dump(), state: await f.nativeState() };
  });
  expect(r.result).toMatchObject({ rejected: true, message: expect.stringContaining('abort after binding') });
  expect(r.after).toBe(r.before); expect(r.state.operations).toEqual([]);
  await evidence(info, 'atomic-staging-abort.json', r);
});

test('lost publication reply replays unchanged after journal mutation, reload and owner change', async ({ page }, info) => {
  const original = await page.evaluate(async () => {
    const f = window.canonicalReturnObjective, boot = await f.boot(), bound = await f.publish();
    await f.mutateQuest(); return { boot, bound, changed: await f.nativeState() };
  });
  expect(original.changed.records.some(row => (row.value as { quest?: { title: string } }).quest?.title === 'Changed after publication')).toBe(true);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalReturnObjective);
  const r = await page.evaluate(async serialized => {
    const f = window.canonicalReturnObjective, head = await f.resume(), before = await f.dump();
    const bound = JSON.parse(serialized) as { ref: Parameters<typeof f.read>[0]; original: Parameters<typeof f.replay>[0] };
    const read = await f.read(bound.ref), replay = await f.replay(bound.original);
    return { head, before, read, replay, after: await f.dump() };
  }, JSON.stringify({ ref: original.bound.ref, original: original.bound.original }));
  expect(r.head.owner).not.toBe(original.boot.head.owner);
  expect(r.head.epoch).toBeGreaterThan(original.boot.head.epoch);
  expect(r.read).toEqual(original.bound.proof);
  expect(r.replay).toEqual({ receipt: original.bound.receipt, calls: 0, replayed: true });
  expect(r.after).toBe(r.before);
  await evidence(info, 'historical-binding-reload-replay.json', { original, r });
});

test('publication request and checkpoint aliases cannot rewrite the retained owner choice', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalReturnObjective; await f.boot();
    const domain = await f.domainState(), bound = await f.publish(f.choice(), true);
    return { domain, bound, after: await f.domainState() };
  });
  expect(r.bound.proof.source).toEqual(r.bound.original);
  expect(r.bound.proof.publication.objective).toMatchObject({ launchId: r.bound.goal.launchId, objectiveId: r.bound.goal.objectiveId,
    quest: { questId: r.bound.goal.questId }, entrance: { at: { level: 1 } } });
  expect(JSON.stringify(r.bound.proof)).not.toContain('caller-mutated');
  expect(r.after).toEqual(r.domain);
  await evidence(info, 'publication-input-snapshots.json', r);
});

test('actual prepareGameLaunch snapshots caller options and admits the matching typed root', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalReturnObjective; const boot = await f.boot();
    const domain = await f.domainState(), prepared = await f.prepare(true);
    return { boot, domain, prepared, after: await f.domainState() };
  });
  expect(r.prepared.prepared.start).toMatchObject({ objectiveId: r.prepared.expected.objectiveId,
    provider: r.prepared.expected.provider, limits: r.prepared.expected.limits });
  expect(r.prepared.proof.publication.objective).toMatchObject({ launchId: r.prepared.prepared.launchId,
    objectiveId: r.prepared.expected.objectiveId, quest: { questId: r.boot.questId } });
  expect(r.prepared.launch!.guard.state).toBe('admitted'); expect(r.prepared.launch!.grant).toBeNull();
  expect(r.after).toEqual(r.domain);
  await evidence(info, 'prepare-game-launch-owner-binding.json', r);
});
