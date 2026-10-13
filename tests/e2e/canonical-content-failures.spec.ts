import { test, expect } from './canonical-test';

test('failed chest commit rolls back inventory, quest, chest, receipt and head together', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    const head = (await c.readCanonicalHead()).head;
    const request = c.command(head, 'content.command', { kind: 'open-chest', chestId: t.room.chestId! });
    const before = (await c.dump()).content;
    let error = '';
    try { await c.executeCanonical(request, async tx => { await c.content.commitContentCommand(tx, request.input); throw Error('crash-before-publish'); }); }
    catch (e) { error = String(e); }
    const after = (await c.dump()).content, settled = await c.content.executeContentCommand(request);
    return { before, after, error, settled: settled.receipt.result, replayed: settled.replayed };
  });
  expect(result.error).toContain('crash-before-publish'); expect(result.after).toEqual(result.before);
  expect(result.settled).toMatchObject({ outcome: 'applied' }); expect(result.replayed).toBe(false);
});

test('hard item-record limit leaves an unopened cache and active quest intact', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    for (let batch = 0; batch < 8; batch++) await c.roster.edit(s => ({ ...s, inventory: { ...s.inventory,
      items: [...(batch ? s.inventory.items : []), ...Array.from({ length: 32 }, (_, i) =>
        ({ ...c.roster.createItemInstance('rusty-sword', 1), id: `stock-${batch * 32 + i}` }))] } }));
    const before = (await c.dump()).content;
    let error = '';
    try { await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! }); } catch (e) { error = String(e); }
    return { error, before, after: (await c.dump()).content };
  });
  expect(result.error).toContain('invalid bounded item container'); expect(result.after).toEqual(result.before);
});

test('missing accepted quest is not re-created by accept or chest collection', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.act({ kind: 'accept-quest', contractId: t.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    await c.content.work(async tx => { await tx.pages.delete('world', c.content.records.contentKey('quest', t.room.contractId!)); return {}; });
    const before = (await c.dump()).content, errors = [];
    for (const command of [{ kind: 'accept-quest' as const, contractId: t.room.contractId! }, { kind: 'open-chest' as const, chestId: t.room.chestId! }]) {
      try { await c.content.act(command); } catch (e) { errors.push(String(e)); }
    }
    return { errors, before, after: (await c.dump()).content };
  });
  expect(result.errors).toHaveLength(2); expect(result.errors.every(e => e.includes('accepted quest record missing'))).toBe(true);
  expect(result.after).toEqual(result.before);
});

test('missing prepared chest and deleted content cursor fail without regenerating content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.work(async tx => { await tx.pages.delete('world', c.content.records.chestKey(1, t.room.chestId!)); return {}; });
    const before = (await c.dump()).content;
    let error = '';
    try { await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! }); } catch (e) { error = String(e); }
    const after = (await c.dump()).content;
    await c.content.work(async tx => { await tx.pages.delete('world', 'dungeon/1/content'); return {}; });
    const missingCursor = (await c.dump()).content; let cursorError = '';
    try { await c.content.work(async tx => c.world.json(await c.content.content.beginWorldContent(tx.pages, 1))); } catch (e) { cursorError = String(e); }
    return { error, before, after, cursorError, missingCursor, final: (await c.dump()).content };
  });
  expect(result.error).toContain('missing established world record'); expect(result.after).toEqual(result.before);
  expect(result.cursorError).toContain('missing established content preparation'); expect(result.final).toEqual(result.missingCursor);
});

test('original collect receipt reconciles after takeover but new stale requests are rejected', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, t = (await c.content.seed()).find(t => t.chest)!;
    await c.content.place({ level: 1, cell: { spaceId: t.room.spaceId, ...t.chest!.chest.position } });
    const original = await c.content.act({ kind: 'open-chest', chestId: t.room.chestId! });
    const h = (await c.readCanonicalHead()).head;
    const stale = c.command(h, 'content.command', { kind: 'open-chest', chestId: t.room.chestId! });
    await c.controlCanonical(c.command(h, 'control.takeover', { owner: 'new-owner' }), 'takeover');
    const before = (await c.dump()).content, retry = await c.content.executeContentCommand(original.request); let error = '';
    try { await c.content.executeContentCommand(stale); } catch (e) { error = String(e); }
    return { before, after: (await c.dump()).content, retry, receipt: original.outcome.receipt, error };
  });
  expect(result.retry.replayed).toBe(true); expect(result.retry.receipt).toEqual(result.receipt);
  expect(result.error).toContain('stale owner or revision'); expect(result.after).toEqual(result.before);
});

test('strict command dispatch rejects extra target fields and accessor-bearing inputs before effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.content.seed(); const head = (await c.readCanonicalHead()).head;
    const before = (await c.dump()).content, errors = []; let calls = 0;
    const malicious = c.command(head, 'content.command');
    Object.defineProperty(malicious, 'input', { enumerable: true, get: () => { calls++; return { kind: 'claim-quest', questId: 'x' }; } });
    for (const request of [malicious, c.command(head, 'wrong.operation', {}),
      c.command(head, 'content.command', { kind: 'open-chest', chestId: 'x', questId: 'y' })]) {
      try { await c.content.executeContentCommand(request); } catch (e) { errors.push(String(e)); }
    }
    return { before, after: (await c.dump()).content, calls, errors };
  });
  expect(result.calls).toBe(0); expect(result.errors).toHaveLength(3); expect(result.after).toEqual(result.before);
});

test('unqualified geometry cannot be promoted to prepared content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.roster.seed(); await c.world.finishFloor();
    const before = (await c.dump()).content; let error = '';
    try { await c.content.work(async tx => c.world.json(await c.content.content.beginWorldContent(tx.pages, 1))); } catch (e) { error = String(e); }
    return { before, after: (await c.dump()).content, error };
  });
  expect(result.error).toContain('floor quality has not begun'); expect(result.after).toEqual(result.before);
});
