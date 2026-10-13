import { test, expect } from './canonical-test';

test('earned sight and local movement commit atomically without copying remote geometry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, targets = await c.knowledge.seed(), before = (await c.knowledge.current()).value;
    const action = await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    const current = (await c.knowledge.current()).value, checkpoint = (await c.readCanonicalHead()).head.checkpoint;
    const query = await c.knowledge.read([current.header.actor, { level: 1, cell: { spaceId: targets.at(-1)!.room.spaceId, row: 0, column: 0 } }]);
    return { before, current, action, checkpoint, query };
  });
  expect(result.current.header.sequence).toBe(2);
  expect(result.current.header.actor.cell.column).toBe(result.before.header.actor.cell.column + 1);
  expect(result.current.header.revision).toBe(result.action.outcome.receipt.afterRevision);
  expect(result.query.value[0].state).toBe('visible'); expect(result.query.value[1].state).toBe('unknown');
  expect(JSON.stringify(result.current)).not.toMatch(/roomBudget|questRelevant|seed|loot|contract|farthest|socket-\d+:room.*origin/);
});

for (const mode of ['manual', 'auto-play'] as const) test(`${mode} step across a chest observes it but does not loot or accept`, async ({ page }) => {
  const result = await page.evaluate(async mode => {
    const c = window.canonical, target = (await c.knowledge.seed()).find(t => t.chest)!;
    const at = { level: 1, cell: { spaceId: target.room.spaceId, ...target.chest!.chest.position } };
    await c.content.place({ ...at, cell: { ...at.cell, column: at.cell.column - 1 } }, mode);
    await c.knowledge.act({ kind: 'look' });
    const before = (await c.roster.read()).value.state.inventory;
    await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    const sight = (await c.knowledge.read([at])).value;
    return { before, after: (await c.roster.read()).value.state.inventory, sight, target: (await c.content.targets()).find(t => t.room.spaceId === at.cell.spaceId) };
  }, mode);
  expect(result.after).toEqual(result.before);
  expect(result.sight[0].cell?.chests).toEqual([{ id: result.target!.room.chestId, opened: false }]);
  expect(result.target?.chest?.chest.opened).toBe(false); expect(result.target?.contract?.accepted).toBe(false);
});

test('explicit chest interaction supersedes current sight while old receipt remains exact through reload', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const c = window.canonical, target = (await c.knowledge.seed()).find(t => t.chest)!;
    const at = { level: 1, cell: { spaceId: target.room.spaceId, ...target.chest!.chest.position } };
    await c.content.place(at); await c.knowledge.act({ kind: 'look' });
    const head = (await c.readCanonicalHead()).head, checkpoint = c.roster.gameCheckpoint(head.checkpoint);
    const old = { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id };
    const evidence = (await c.readCanonical(p => c.knowledge.loadObservation(p, old))).value;
    const action = await c.content.act({ kind: 'open-chest', chestId: target.room.chestId! });
    return { at, old, evidence, action };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const result = await page.evaluate(async serialized => {
    const saved = JSON.parse(serialized) as { at: import('../../src/persistence/canonical/world/types').WorldPosition;
      old: { sequence: number; id: string }; action: { request: import('../../src/persistence/canonical/types').CanonicalRequest } };
    const c = window.canonical;
    return { current: (await c.knowledge.read([saved.at])).value,
      old: (await c.readCanonical(p => c.knowledge.loadObservation(p, saved.old))).value,
      replay: await c.content.executeContentCommand(saved.action.request) };
  }, JSON.stringify(saved));
  expect(result.current[0].cell?.chests[0].opened).toBe(true);
  expect(result.old).toEqual(saved.evidence);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(saved.action.outcome.receipt);
});

test('knowledge queries cannot read world truth and unseen changes do not refresh remembered facts', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, target = (await c.knowledge.seed()).find(t => t.chest)!;
    const at = { level: 1, cell: { spaceId: target.room.spaceId, ...target.chest!.chest.position } };
    await c.content.place(at); await c.knowledge.act({ kind: 'look' });
    await c.content.place({ level: 1, cell: { spaceId: 'entry', row: 0, column: 0 } }); await c.knowledge.act({ kind: 'look' });
    const before = (await c.knowledge.read([at])).value;
    const loot = (await c.roster.read()).value.state.inventory.items.slice(0, 2);
    await c.content.work(async tx => {
      const chest = await c.content.records.loadChest(tx.pages, 1, target.room.chestId!);
      await c.content.records.saveChest(tx.pages, { ...chest, chest: { ...chest.chest, opened: true, loot } }); return {};
    });
    const queried = await c.readCanonical(async (p, s) => {
      const guard = { get: ((area, key) => { if (area !== 'knowledge') throw Error('Hidden world read'); return p.get(area, key); }) as typeof p.get,
        scan: p.scan, witness: p.witness };
      return c.knowledge.readKnownCells(guard, c.roster.gameCheckpoint(s.checkpoint), [at]);
    });
    return { before, after: queried.value };
  });
  expect(result.before[0].state).toBe('remembered'); expect(result.after).toEqual(result.before);
});

test('a replaced memory page fails closed and cannot be silently overwritten by movement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.knowledge.seed();
    const at = (await c.knowledge.current()).value.header.actor;
    await c.content.work(async tx => {
      const key = c.knowledge.blockKey(at), row = await tx.pages.get('knowledge', key);
      await tx.pages.set('knowledge', key, row!.value); return {};
    });
    const before = (await c.dump()).content, errors = [];
    try { await c.knowledge.read([at]); } catch (e) { errors.push(String(e)); }
    try { await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false }); } catch (e) { errors.push(String(e)); }
    return { before, after: (await c.dump()).content, errors };
  });
  expect(result.errors).toHaveLength(2); expect(result.errors.every(e => e.includes('knowledge namespace'))).toBe(true);
  expect(result.after).toBe(result.before);
});
