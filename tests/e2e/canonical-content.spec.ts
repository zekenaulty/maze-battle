import { test, expect } from './canonical-test';

test('content preparation creates unopened caches and posted contracts, never items, acceptance or knowledge', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.roster.seed();
    const before = await c.roster.read(), head = (await c.readCanonicalHead()).head;
    await c.content.prepare();
    return { before: before.value, after: (await c.roster.read()).value, targets: await c.content.targets(),
      knowledge: [(await c.readCanonicalHead()).head.roots.knowledge, head.roots.knowledge] };
  });
  expect(result.after).toEqual(result.before);
  expect(result.targets.filter(t => t.chest)).toHaveLength(2);
  expect(result.targets.every(t => t.contract?.accepted === false && t.contract.contract.status === 'posted')).toBe(true);
  expect(result.targets.filter(t => t.chest).every(t => !t.chest?.chest.opened && !t.chest?.chest.loot)).toBe(true);
  expect(result.knowledge[0]).toEqual(result.knowledge[1]);
});

for (const mode of ['manual', 'auto-play'] as const) test(`${mode} movement across a chest never opens it or accepts its quest`, async ({ page }) => {
  const result = await page.evaluate(async mode => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    const at = t.chest!.chest.position;
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, row: at.row, column: at.column - 1 } }, mode);
    const before = (await c.roster.read()).value.state.inventory;
    await c.content.step('east'); await c.content.step('east');
    return { before, after: (await c.roster.read()).value.state.inventory, targets: await c.content.targets() };
  }, mode);
  expect(result.after).toEqual(result.before);
  expect(result.targets.every(t => !t.contract?.accepted && !t.chest?.chest.opened)).toBe(true);
});

test('explicit accept, collect and claim persist actual items and exactly-once gold through reload', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    const before = (await c.roster.read()).value.state.inventory;
    const opened = await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! });
    return { target: t, before, opened };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const result = await page.evaluate(async serialized => {
    const original = JSON.parse(serialized) as { target: { room: { contractId: string; chestId: string } }; opened: { request: import('../../src/persistence/canonical/types').CanonicalRequest } };
    const c = window.canonical, id = original.target.room.contractId!;
    const read = () => c.readCanonical(async p => c.content.records.loadAcceptedQuest(p, await c.content.records.loadContract(p, id)));
    const quest = (await read()).value;
    const replay = await c.content.executeContentCommand(original.opened.request);
    const again = await c.content.act({ kind: 'open-chest', chestId: original.target.room.chestId! });
    const claim = await c.content.act({ kind: 'claim-quest', questId: id });
    await c.content.executeContentCommand(claim.request);
    await c.content.act({ kind: 'claim-quest', questId: id });
    return { quest, final: (await read()).value, roster: (await c.roster.read()).value, replay, again: again.outcome.receipt.result };
  }, JSON.stringify(original));
  expect(result.quest?.quest.status).toBe('complete');
  expect(result.quest?.award?.chestId).toBe(original.target.room.chestId);
  expect(result.final?.quest.status).toBe('claimed');
  expect(result.roster.state.inventory.gold).toBe(original.before.gold + original.target.contract!.contract.rewardGold);
  expect(result.roster.state.inventory.items.filter(i => i.questId === original.target.room.contractId)).toHaveLength(1);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(original.opened.outcome.receipt);
  expect(result.again).toMatchObject({ outcome: 'unchanged', lootIds: [] });
});

test('wrong room, wrong tile, town and defeated party cannot open a chest', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    const command = { kind: 'open-chest' as const, chestId: t.room.chestId! }, outcomes = [];
    outcomes.push((await c.content.act(command)).outcome.receipt.result);
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, row: 0, column: 0 } });
    outcomes.push((await c.content.act(command)).outcome.receipt.result);
    const position = { level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } };
    await c.content.place(position, 'town'); outcomes.push((await c.content.act(command)).outcome.receipt.result);
    await c.content.place(position); await c.roster.edit(s => ({ ...s, party: s.party.map(a => ({ ...a, hp: 0 })) }));
    outcomes.push((await c.content.act(command)).outcome.receipt.result);
    return { outcomes, targets: await c.content.targets() };
  });
  expect(result.outcomes.every(o => (o as { outcome: string }).outcome === 'unchanged')).toBe(true);
  expect(result.targets.filter(t => t.chest).every(t => !t.chest?.chest.opened)).toBe(true);
});

test('opening before accepting gives only ordinary loot and withdraws the unfulfillable fetch offer', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! });
    const accept = await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    return { accept: accept.outcome.receipt.result, items: (await c.roster.read()).value.state.inventory.items,
      contract: (await c.readCanonical(p => c.content.records.loadContract(p, t.room.contractId!))).value };
  });
  expect(result.accept).toMatchObject({ outcome: 'unchanged' }); expect(result.contract.accepted).toBe(false);
  expect(result.items.some(i => i.category === 'quest')).toBe(false);
});

test('room visits progress only the already accepted local scout or locate quest', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, targets = await c.content.seed();
    const t = targets.find(t => t.contract?.contract.objective === 'scout')!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, row: 0, column: 0 } });
    await c.content.step('east');
    const read = await c.readCanonical(async p => c.content.records.loadAcceptedQuest(p, await c.content.records.loadContract(p, t.room.contractId!)));
    return { quest: read.value, others: (await c.content.targets()).filter(other => other.room.contractId !== t.room.contractId) };
  });
  expect(result.quest?.quest.status).toBe('complete'); expect(result.others.every(t => !t.contract?.accepted)).toBe(true);
});

test('stash custody keeps the quest collectible and claim does not sell or duplicate it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    const position = { level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } };
    await c.content.place(position); await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! });
    const item = (await c.roster.read()).value.state.inventory.items.find(i => i.questId === t.room.contractId)!;
    await c.content.place(position, 'town'); await c.roster.act({ kind: 'stash', itemId: item.id });
    await c.roster.act({ kind: 'sell', itemId: item.id, amount: 1 }); await c.roster.act({ kind: 'sell-junk' });
    await c.content.act({ kind: 'claim-quest', questId: t.room.contractId! });
    return { item, roster: (await c.roster.read()).value };
  });
  expect(result.roster.state.stash.items.filter(i => i.id === result.item.id)).toEqual([result.item]);
  expect(result.roster.state.inventory.items.some(i => i.id === result.item.id)).toBe(false);
});
