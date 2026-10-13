import { test, expect } from './canonical-test';

test('doorway traversal preserves reciprocal local addresses and earns only nearby rooms', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.knowledge.seed();
    const entry = (await c.readCanonical(p => c.world.loadWorldRoom(p, 1, 'entry'))).value;
    const link = entry.connections[0], forward = link.from.spaceId === 'entry';
    const start = forward ? link.from : link.to, target = forward ? link.to : link.from;
    const reverse = { north: 'south', south: 'north', west: 'east', east: 'west' } as const;
    const direction = forward ? link.direction : reverse[link.direction];
    await c.content.place({ level: 1, cell: start }); await c.knowledge.act({ kind: 'look' });
    const out = await c.knowledge.act({ kind: 'move', direction, triggerStairs: false });
    const sight = (await c.knowledge.current()).value;
    const rooms = (await c.readCanonical((p, s) => c.knowledge.listKnownRooms(p, c.roster.gameCheckpoint(s.checkpoint), 1))).value;
    const back = await c.knowledge.act({ kind: 'move', direction: reverse[direction], triggerStairs: false });
    return { out: out.outcome.receipt.result, back: back.outcome.receipt.result, start, target, sight, rooms };
  });
  expect(result.out).toMatchObject({ moved: true, crossed: true, position: { level: 1, cell: result.target } });
  expect(result.back).toMatchObject({ moved: true, crossed: true, position: { level: 1, cell: result.start } });
  expect(result.sight.cells.every(c => Math.abs(c.world.row - result.sight.cells[0].world.row) + Math.abs(c.world.column - result.sight.cells[0].world.column) <= 7)).toBe(true);
  expect(result.rooms.rooms.length).toBeLessThan(8);
});

test('stairs revisit existing floors, request missing next floor, and return to town', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.knowledge.seed();
    const upper = (await c.readCanonical(p => c.world.loadFloor(p, 1))).value;
    await c.content.place({ level: 1, cell: upper.exit! }); await c.knowledge.act({ kind: 'look' });
    const prepare = await c.knowledge.act({ kind: 'stairs', direction: 'down' });
    await c.world.nextFloor(2); await c.content.prepare(2);
    const down = await c.knowledge.act({ kind: 'stairs', direction: 'down' });
    const lower = (await c.readCanonical(p => c.world.loadFloor(p, 2))).value;
    const up = await c.knowledge.act({ kind: 'stairs', direction: 'up' });
    await c.content.place({ level: 1, cell: upper.entry }); await c.knowledge.act({ kind: 'look' });
    const town = await c.knowledge.act({ kind: 'stairs', direction: 'up' });
    const townView = (await c.knowledge.read([{ level: 1, cell: upper.entry }])).value;
    await c.roster.act({ kind: 'leave-town' });
    return { prepare: prepare.outcome.receipt.result, down: down.outcome.receipt.result, up: up.outcome.receipt.result,
      town: town.outcome.receipt.result, lower, upper, townView, returned: (await c.knowledge.current()).value };
  });
  expect(result.prepare).toMatchObject({ needsFloor: 2, position: { level: 1, cell: result.upper.exit } });
  expect(result.down).toMatchObject({ needsFloor: null, position: { level: 2, cell: result.lower.entry } });
  expect(result.up).toMatchObject({ position: { level: 1, cell: result.upper.exit } });
  expect(result.town).toMatchObject({ mode: 'town' }); expect(result.townView[0].state).toBe('remembered');
  expect(result.returned.header.actor).toEqual({ level: 1, cell: result.upper.entry });
});

test('a move records only a previously accepted local visit quest, never arbitrary target completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, targets = await c.knowledge.seed(), target = targets.find(t => t.contract?.contract.objective === 'scout')!;
    await c.content.act({ kind: 'accept-quest', contractId: target.room.contractId! });
    await c.content.place({ level: 1, cell: { spaceId: target.room.spaceId, row: 0, column: 0 } }); await c.knowledge.act({ kind: 'look' });
    const read = () => c.readCanonical(async p => c.content.records.loadAcceptedQuest(p, await c.content.records.loadContract(p, target.room.contractId!)));
    const before = (await read()).value;
    await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    return { before, after: (await read()).value, others: (await c.content.targets()).filter(t => t.room.contractId !== target.room.contractId) };
  });
  expect(result.before?.quest.status).toBe('active'); expect(result.after?.quest.status).toBe('complete');
  expect(result.others.every(t => !t.contract?.accepted)).toBe(true);
});

test('failure after staging observation and memory leaves position, sources and receipt untouched', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.knowledge.seed();
    const head = (await c.readCanonicalHead()).head, before = (await c.dump()).content;
    const request = c.command(head, 'exploration.command', { kind: 'move', direction: 'east', triggerStairs: false });
    const abort = new AbortController(); let error = '';
    try {
      await c.executeCanonical(request, async tx => {
        const result = await c.knowledge.commitExplorationCommand(tx, request.input); abort.abort(); return result;
      }, { signal: abort.signal });
    } catch (e) { error = String(e); }
    const after = (await c.dump()).content;
    const retry = await c.knowledge.executeExplorationCommand(request);
    return { before, after, error, retry };
  });
  expect(result.error).not.toBe(''); expect(result.after).toBe(result.before); expect(result.retry.replayed).toBe(false);
});

test('takeover rejects a new stale move but preserves its original committed replay and observation', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const c = window.canonical; await c.knowledge.seed();
    const action = await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    const head = (await c.readCanonicalHead()).head;
    const pending = c.command(head, 'exploration.command', { kind: 'move', direction: 'east', triggerStairs: false });
    await c.controlCanonical(c.command(head, 'control.takeover', { owner: 'new-owner' }), 'takeover');
    return { action, pending };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const result = await page.evaluate(async serialized => {
    const s = JSON.parse(serialized), c = window.canonical; let stale = '';
    try { await c.knowledge.executeExplorationCommand(s.pending); } catch (e) { stale = String(e); }
    const replay = await c.knowledge.executeExplorationCommand(s.action.request);
    const head = (await c.readCanonicalHead()).head;
    await c.controlCanonical(c.command(head, 'control.resume', { owner: head.owner }), 'resume');
    await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false });
    return { stale, replay, latest: (await c.knowledge.current()).value };
  }, JSON.stringify(saved));
  expect(result.stale).toContain('stale owner'); expect(result.replay.receipt).toEqual(saved.action.outcome.receipt);
  expect(result.latest.header.owner).toBe('new-owner'); expect(result.latest.header.sequence).toBe(3);
});

test('quota refusal rolls back observation, memory, position and receipt together', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical;
    await c.roster.seed('manual', [], { limitBytes: 3 * 1024 * 1024, reserveBytes: 128 * 1024 });
    await c.content.prepare(); await c.knowledge.act({ kind: 'look' });
    for (const size of [60_000, 8192, 1024]) for (let n = 0; n < 100; n++) {
      const head = (await c.readCanonicalHead()).head;
      try { await c.executeCanonical(c.command(head, 'fixture.fill'), async tx => {
        await tx.pages.set('world', 'fixture-padding', 'x'.repeat(size)); return null;
      }); } catch (e) { if (String(e).includes('storage quota exhausted')) break; throw e; }
    }
    const before = (await c.dump()).content; let error = '';
    try { await c.knowledge.act({ kind: 'move', direction: 'east', triggerStairs: false }); } catch (e) { error = String(e); }
    return { before, after: (await c.dump()).content, error };
  });
  expect(result.error).toContain('storage quota exhausted'); expect(result.after).toBe(result.before);
});
