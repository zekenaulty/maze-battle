import { test, expect } from './canonical-test';

test('a foreign contract reference cannot complete an unvisited room quest', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.contract?.contract.objective === 'scout')!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.work(async tx => {
      const room = await c.content.records.loadRoomContent(tx.pages, 1, 'entry');
      await tx.pages.set('world', 'dungeon/1/content/entry', { ...room, contractId: t.room.contractId }); return {};
    });
    const before = (await c.dump()).content; let error = '';
    try { await c.content.step('east'); } catch (e) { error = String(e); }
    return { error, before, after: (await c.dump()).content };
  });
  expect(result.error).toContain('room contract is not reciprocal'); expect(result.after).toEqual(result.before);
});

for (const defect of ['unknown-source', 'missing-source', 'missing-collectible', 'missing-award'] as const)
  test(`quest reward refuses ${defect} without losing its original receipt`, async ({ page }) => {
    const result = await page.evaluate(async defect => {
      const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
      await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
      await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
      const opened = await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! });
      await c.content.work(async tx => {
        const key = c.content.records.contentKey('quest', t.room.contractId!);
        const contract = await c.content.records.loadContract(tx.pages, t.room.contractId!);
        const quest = (await c.content.records.loadAcceptedQuest(tx.pages, contract))!;
        if (defect === 'unknown-source' || defect === 'missing-award') {
          const row = await tx.pages.get('world', key);
          await tx.pages.set('world', key, c.world.json({ ...quest, award: defect === 'missing-award' ? null : { ...quest.award, chestId: 'nonexistent' } }), row!.indexes);
        } else if (defect === 'missing-source') await tx.pages.delete('world', c.content.records.chestKey(1, t.room.chestId!));
        else {
          const source = await c.content.records.loadChest(tx.pages, 1, t.room.chestId!);
          await c.content.records.saveChest(tx.pages, { ...source, chest: { ...source.chest,
            loot: source.chest.loot!.filter(i => i.category !== 'quest') } });
        }
        return {};
      });
      const before = (await c.dump()).content; let error = '';
      try { await c.content.act({ kind: 'claim-quest', questId: t.room.contractId! }); } catch (e) { error = String(e); }
      const replay = await c.content.executeContentCommand(opened.request);
      return { error, before, after: (await c.dump()).content, replay: replay.receipt, original: opened.outcome.receipt };
    }, defect);
    expect(result.error).toBeTruthy(); expect(result.after).toEqual(result.before); expect(result.replay).toEqual(result.original);
  });

test('immutable reads are cached only within a transaction and never republished', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.roster.seed();
    const query = () => c.readCanonical(async p => {
      const first = await p.get('world', 'roster/pack');
      const second = await p.get('world', 'roster/pack');
      return [first, second];
    });
    const meter = c.storageProbe(), first = await query(), native = meter.finish();
    await c.content.work(async tx => { const row = await tx.pages.get('world', 'roster/pack');
      await tx.pages.set('world', 'roster/pack', { ...(row!.value as Record<string, never>), gold: 987 }); return {}; });
    return { first, native, second: await query() };
  });
  expect(result.native.operations.filter(op => op.store === 'records')).toHaveLength(1);
  expect(result.native.operations.some(op => ['add', 'put'].includes(op.method))).toBe(false);
  expect(result.first.value[0]).toEqual(result.first.value[1]);
  expect(result.second.value[0]?.id).not.toEqual(result.first.value[0]?.id);
});
