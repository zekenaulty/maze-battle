import { test, expect } from './canonical-frontier.test';

for (const invalid of ['wall', 'neighbor', 'zero-distance'] as const) test(`${invalid} is not frontier approach authority`, async ({ page }) => {
  const result = await page.evaluate(async invalid => {
    const c = window.canonicalFrontier, seeded = await c.seed(), sight = seeded.sight;
    const index = sight.cells.findIndex(cell => invalid === 'zero-distance' ? c.same(cell.at, sight.header.actor)
      : !c.same(cell.at, sight.header.actor) && c.DIRECTIONS.some(d => invalid === 'wall' ? cell.edges[d] === null : !!cell.edges[d]));
    if (index < 0) throw Error('Fixture does not supply the requested negative');
    const cell = sight.cells[index], direction = invalid === 'zero-distance' ? 'north' as const
      : c.DIRECTIONS.find(d => invalid === 'wall' ? cell.edges[d] === null : !!cell.edges[d])!;
    const selection = { at: cell.at, direction, source: { sequence: sight.header.sequence,
      id: c.gameCheckpoint(seeded.page.head.checkpoint).knowledge!.id, index } };
    const before = await c.dump(), member = await c.current(selection), rejected = await c.refusal(() => c.admit(selection));
    return { invalid, selection, actor: sight.header.actor, edge: cell.edges[direction], member: member.value, rejected, before, after: await c.dump() };
  }, invalid);
  if (invalid === 'zero-distance') expect(result.selection.at).toEqual(result.actor);
  else if (invalid === 'wall') expect(result.edge).toBeNull();
  else expect(result.edge).toBeTruthy();
  expect(result.member).toBe(false); expect(result.rejected.rejected).toBe(true); expect(result.after).toBe(result.before);
});

for (const invalid of ['foreign-source', 'wrong-source-index', 'foreign-floor', 'unknown-anchor', 'direction', 'extra-selection', 'changed-target', 'smuggled-known-kind'] as const) {
  test(`canonical admission refuses ${invalid} without publishing a reservation`, async ({ page }) => {
    const result = await page.evaluate(async invalid => {
      const c = window.canonicalFrontier, seeded = await c.seed(), selection = structuredClone(seeded.page.value[0]);
      const binding = c.createFrontierBinding(selection) as unknown as Record<string, any>;
      if (invalid === 'foreign-source') binding.frontier.source.id = 'foreign-source';
      if (invalid === 'wrong-source-index') binding.frontier.source.index = seeded.sight.cells.findIndex(cell => c.same(cell.at, seeded.sight.header.actor));
      if (invalid === 'foreign-floor') { binding.frontier.at.level = 2; binding.target.level = 2; }
      if (invalid === 'unknown-anchor') { binding.frontier.at.cell.spaceId = 'unearned'; binding.target.cell.spaceId = 'unearned'; }
      if (invalid === 'direction') binding.frontier.direction = 'up';
      if (invalid === 'extra-selection') binding.frontier.route = [];
      if (invalid === 'changed-target') binding.target = seeded.sight.header.actor;
      if (invalid === 'smuggled-known-kind') binding.kind = 'known-destination';
      const before = await c.dump(), rejected = await c.refusal(() => c.admitBinding(c.json(binding)));
      return { rejected, before, after: await c.dump() };
    }, invalid);
    expect(result.rejected.rejected).toBe(true); expect(result.after).toBe(result.before);
  });
}

test('fresh request fences cannot authorize a selection from an earlier sight publication', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), selection = seeded.page.value[0];
    const binding = c.createFrontierBinding(selection);
    await c.knowledge.act({ kind: 'look' });
    const fresh = await c.query(), before = await c.dump();
    // admitBinding obtains the NEW command fence; only the selected evidence is stale.
    const rejected = await c.refusal(() => c.admitBinding(c.json(binding)));
    return { original: seeded.page, fresh, rejected, before, after: await c.dump() };
  });
  expect(result.fresh.head.revision).toBeGreaterThan(result.original.head.revision);
  expect(result.rejected.rejected).toBe(true); expect(result.after).toBe(result.before);
});

test('binding snapshots selection and source shape validation rejects extra nested authority', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), original = seeded.page.value[0];
    const input = structuredClone(original), binding = c.createFrontierBinding(input);
    input.at.cell.column++; input.source.index++;
    const bad = [null, { ...original, extra: true }, { ...original, source: { ...original.source, extra: true } },
      { ...original, at: { ...original.at, cell: { ...original.at.cell, extra: true } } }];
    const before = await c.dump(), failures = bad.map(value => {
      try { c.frontierSelection(value); return false; } catch { return true; }
    });
    return { original, binding, failures, before, after: await c.dump() };
  });
  expect(result.binding).toMatchObject({ frontier: result.original, target: result.original.at });
  expect(result.failures).toEqual([true, true, true, true]);
  expect(result.after).toBe(result.before);
});
