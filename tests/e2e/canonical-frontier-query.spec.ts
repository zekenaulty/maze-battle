import { test, expect } from './canonical-frontier.test';

test('cold frontier page is current-sight sourced, publicly ordered and read-only', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), before = await c.dump();
    const first = await c.query(), second = await c.query(), membership = [];
    for (const selection of first.value) membership.push((await c.current(selection)).value);
    const expected = seeded.sight.cells.flatMap((cell, index) => c.same(cell.at, seeded.sight.header.actor) ? []
      : c.DIRECTIONS.filter(d => !Object.hasOwn(cell.edges, d)).map(direction => ({ at: cell.at, direction,
        source: { sequence: seeded.sight.header.sequence, id: c.gameCheckpoint(first.snapshot.checkpoint).knowledge!.id, index } })));
    expected.sort((a, b) => {
      const left = seeded.sight.cells[a.source.index].world, right = seeded.sight.cells[b.source.index].world;
      return left.row - right.row || left.column - right.column || c.DIRECTIONS.indexOf(a.direction) - c.DIRECTIONS.indexOf(b.direction);
    });
    return { before, after: await c.dump(), seeded, first, second, expected, membership };
  });
  expect(result.seeded.beforeLook.checkpoint.knowledge).toBeNull();
  expect(result.seeded.sight.header).toMatchObject({ sequence: 1, previous: null });
  expect(result.first.value.length).toBeGreaterThan(0);
  expect(result.first.value).toEqual(result.expected); expect(result.second.value).toEqual(result.first.value);
  expect(result.membership.every(Boolean)).toBe(true); expect(result.after).toBe(result.before);
  expect(result.first.stats.writes).toBe(0); expect(result.first.accesses.every(key => key.startsWith('perception/'))).toBe(true);
  await info.attach('cold-frontiers.json', { body: JSON.stringify({ sight: result.seeded.sight, page: result.first }, null, 2), contentType: 'application/json' });
});

test('hidden chest state cannot change a source-bound page or trigger hidden reads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), original = await c.query();
    // Privileged test mutation is never returned to the selector or used to choose its frontier.
    const hidden = (await c.content.targets()).find(t => t.chest && !seeded.sight.cells.some(cell => cell.at.cell.spaceId === t.room.spaceId));
    if (!hidden?.chest) throw Error('Fixture requires a genuinely unseen chest');
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.hidden-chest'), async tx => {
      await c.content.records.saveChest(tx.pages, { ...hidden.chest!, chest: { ...hidden.chest!.chest, opened: true,
        loot: c.rollChestLoot(hidden.chest!.chest, () => 0.5).map(c.encodeItem) } });
      return null;
    });
    const before = await c.dump(), changed = await c.query(), pinned = await c.query(original.snapshot);
    return { original, changed, pinned, before, after: await c.dump() };
  });
  expect(result.changed.head.roots.world).not.toEqual(result.original.head.roots.world);
  expect(result.changed.head.roots.knowledge).toEqual(result.original.head.roots.knowledge);
  expect(result.changed.value).toEqual(result.original.value); expect(result.pinned.value).toEqual(result.original.value);
  expect(result.changed.accesses).toEqual(result.original.accesses); expect(result.after).toBe(result.before);
});

test('a cropped edge with a previously earned physical neighbor is not a new frontier', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), chosen = seeded.page.value[0];
    const anchor = seeded.sight.cells[chosen.source.index], adjacent = c.movePosition(anchor.world, chosen.direction);
    const outward = await c.admit(chosen); await c.finish(outward.id);
    const settled = await c.settle(outward.id); await c.acknowledge(outward.id, settled.request.attemptId);
    const back = await c.admitBinding(c.json(c.createDestinationBinding(seeded.sight.header.actor)));
    const returned = await c.finish(back.id), backTerminal = await c.settle(back.id);
    await c.acknowledge(back.id, backTerminal.request.attemptId);
    const sight = (await c.knowledge.current()).value, index = sight.cells.findIndex(cell => c.same(cell.at, chosen.at));
    if (index < 0) throw Error('Return must expose the original boundary cell again');
    const selection = { ...chosen, source: { sequence: sight.header.sequence, id: c.gameCheckpoint(returned.head.checkpoint).knowledge!.id, index } };
    const neighbor = await c.readCanonical((pages, snapshot) => c.readKnowledgeRegion(pages, c.gameCheckpoint(snapshot.checkpoint),
      { floor: chosen.at.level, ...adjacent, rows: 1, columns: 1 }), { limits: { ...c.REGION_WORK_LIMITS } });
    const before = await c.dump(), membership = await c.current(selection), list = await c.query();
    const admission = await c.refusal(() => c.admit(selection));
    return { selection, returned, start: seeded.sight.header.actor, cropped: !Object.hasOwn(sight.cells[index].edges, chosen.direction),
      neighbor: neighbor.value, membership: membership.value, listed: list.value.some(s => c.same(s.at, chosen.at) && s.direction === chosen.direction),
      admission, before, after: await c.dump() };
  });
  expect(result.returned.value.status).toBe('arrived'); expect(result.returned.head.checkpoint.position).toEqual(result.start);
  expect(result.cropped).toBe(true); expect(result.neighbor.cells).toHaveLength(1);
  expect(result.neighbor.cells[0].state).toBe('remembered'); expect(result.membership).toBe(false); expect(result.listed).toBe(false);
  expect(result.admission.rejected).toBe(true); expect(result.after).toBe(result.before);
});

for (const damage of ['observation', 'chunk', 'spatial'] as const) test(`corrupt ${damage} evidence throws instead of returning an empty page`, async ({ page }) => {
  const result = await page.evaluate(async damage => {
    const c = window.canonicalFrontier, seeded = await c.seed(), chosen = seeded.page.value[0], db = await c.openCanonicalDatabase();
    try {
      const id = damage === 'observation' ? c.gameCheckpoint(seeded.page.head.checkpoint).knowledge!.id
        : damage === 'chunk' ? seeded.sight.header.chunks[Math.floor(chosen.source.index / 16)]
          : (await c.readCanonical(p => p.get('knowledge', c.worldBlockKey(chosen.at.level, seeded.sight.cells[chosen.source.index].world)))).value!.id;
      await db.delete('records', [seeded.page.head.gameId, id]);
    } finally { db.close(); }
    const before = await c.dump(), query = await c.refusal(() => c.query()), membership = await c.refusal(() => c.current(chosen));
    const admission = await c.refusal(() => c.admit(chosen));
    return { query, membership, admission, before, after: await c.dump() };
  }, damage);
  expect(result.query.rejected).toBe(true); expect(result.membership.rejected).toBe(true); expect(result.admission.rejected).toBe(true);
  expect(result.after).toBe(result.before);
});
