import { test, expect, openExploration, attachEvidence } from './canonical-frontier-exploration.test';
import type { Page } from '@playwright/test';
import { EXPLORATION_PAIR_ORACLE, EXPLORATION_MARKER, type ExplorationVariant } from './canonical-frontier-exploration.layout';

function disclose(page: Page, variant: ExplorationVariant) {
  return page.evaluate(async variant => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed(variant), effects = await c.effects();
    const selection = seeded.page.value[0], admission = await c.admit(selection), rows = await c.capture(admission.id, 3);
    const captured = rows.map(({ frame, snapshot }) => ({ frame, snapshot }));
    const comparison = await c.compare(captured), first = captured[0], before = await c.dump();
    const wrong = structuredClone(first); wrong.frame.sight.header.chunksDigest = rows[1].frame.sight.header.chunksDigest;
    const commitment = await c.refusal(() => c.compare([wrong]));
    const tampered = structuredClone(comparison[0].evidence.source), body = tampered.chunks[0].value;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.cells)) throw Error('Expected chunk cells');
    const cell = body.cells[0];
    if (!cell || typeof cell !== 'object' || Array.isArray(cell) || !cell.world || typeof cell.world !== 'object'
      || Array.isArray(cell.world) || typeof cell.world.row !== 'number') throw Error('Expected observed world coordinate');
    cell.world.row++;
    const rawSource = await c.refusal(() => c.compare([first], [tampered]));
    const changed = structuredClone(first);
    changed.frame.frontiers[0].direction = changed.frame.frontiers[0].direction === 'north' ? 'east' : 'north';
    const direction = (await c.compare([changed]))[0].value;
    const unknown = structuredClone(first); Object.assign(unknown.frame.frontiers[0], { fixtureUnknown: 'must remain' });
    const unknownField = (await c.compare([unknown]))[0].value;
    const controls = { inputs: { wrong, tampered, changed, unknown }, commitment, rawSource, direction, unknownField, unchanged: before === await c.dump() };
    return { seeded, effects, selection, admission, rows, comparison, controls, afterEffects: await c.effects() };
  }, variant);
}

test('A/B earn the same prefix then opposite public choices; unopened chest stops before collection', async ({ page, browser }, info) => {
  const a = await disclose(page, 'A'); await attachEvidence(info, 'A-public-and-native-state.json', a);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let audit: (() => void) | undefined;
  try {
    const other = await context.newPage(); audit = await openExploration(other);
    const b = await disclose(other, 'B'); await attachEvidence(info, 'B-public-and-native-state.json', b);
    for (const result of [a, b]) {
      expect(result.rows).toHaveLength(4);
      expect(result.rows.map(row => row.state.value.progress.status)).toEqual(['running', 'running', 'running', 'decision']);
      expect(result.rows.map(row => row.state.value.progress.steps)).toEqual([0, 1, 2, 3]);
      expect(result.rows.map(row => row.frame.sight.header.count)).toEqual(EXPLORATION_PAIR_ORACLE.visibleCounts);
      expect(result.rows[0].state.head.checkpoint).toEqual(result.seeded.page.head.checkpoint);
      const last = result.rows[3];
      expect(last.state.value.progress).toMatchObject({ reason: 'new-object', route: [],
        binding: { kind: 'frontier-exploration', target: result.selection.at, frontier: result.selection },
        position: { level: 1, cell: { spaceId: result.selection.at.cell.spaceId, row: 11, column: 0 } } });
      expect(last.state.value.progress.position).not.toEqual(result.selection.at);
      expect(last.state.head.roots.world).toEqual(result.seeded.page.head.roots.world);
      expect(result.afterEffects).toEqual(result.effects);
      expect(result.rows.slice(0, 3).every(row => row.frame.sight.cells.every(cell => !cell.chests.length && !cell.stairs.length))).toBe(true);
      expect(last.frame.sight.cells.find(cell => cell.chests.length)?.chests).toEqual([{ id: 'chest-1-socket-6:room', opened: false }]);
      const index = last.frame.sight.cells.findIndex(cell => cell.chests.length);
      const source = last.state.head.checkpoint.knowledge as { sequence: number; id: string };
      expect(last.state.value.progress.notice).toEqual({ kind: 'unopened-chest', at: last.frame.sight.cells[index].at,
        previousSource: null, source: { sequence: source.sequence, id: source.id, index } });
      expect(last.frame.sight.header.sequence).toBe(result.seeded.sight.header.sequence + 3);
      expect(last.state.head.roots.knowledge).not.toEqual(result.seeded.page.head.roots.knowledge);
    }
    expect(a.comparison.slice(0, 3).map(row => row.value)).toEqual(b.comparison.slice(0, 3).map(row => row.value));
    expect(a.comparison[3].value.sight.cells).not.toEqual(b.comparison[3].value.sight.cells);
    expect(a.comparison[3].value.sight.header.chunksDigest).not.toBe(b.comparison[3].value.sight.header.chunksDigest);
    for (const result of [a, b]) for (const row of result.comparison) {
      expect(row.evidence.stats.writes).toBe(0); expect(row.evidence.stats.writeBytes).toBe(0);
      expect(row.evidence.stats.reads).toBeLessThanOrEqual(row.evidence.limits.reads);
      expect(row.evidence.stats.readBytes).toBeLessThanOrEqual(row.evidence.limits.bytes);
      expect(row.evidence.witness).toBe(row.evidence.anchor.witness);
      const key = row.evidence.source.parent.key;
      expect(row.evidence.accesses).toEqual(['perception/', key, `${key}/integrity`,
        ...row.evidence.source.chunks.map((_, index) => `${key}/${index}`)]);
    }
    for (const { controls, comparison } of [a, b]) {
      expect(controls.commitment).toEqual({ rejected: true, message: 'Error: Captured observation differs from retained source' });
      expect(controls.rawSource).toEqual({ rejected: true, message: 'Error: Canonical storage: observation chunk integrity changed' });
      expect(controls.direction.frontiers).not.toEqual(comparison[0].value.frontiers);
      expect(controls.direction.sight).toEqual(comparison[0].value.sight); expect(controls.unchanged).toBe(true);
      expect(controls.unknownField.frontiers[0]).toHaveProperty('fixtureUnknown', 'must remain');
      expect(controls.unknownField).not.toEqual(comparison[0].value);
    }
    const selected = [];
    for (const target of [page, other]) selected.push(await target.evaluate(async () => {
      const c = window.canonicalFrontierExploration; return c.selectUnopenedObjectFrontier(await c.frame());
    }));
    expect(selected.map(selection => selection.direction)).toEqual(['east', 'north']);
    expect(selected.map(selection => selection.source)).toEqual([a.rows[3].state.value.progress.notice!.source, b.rows[3].state.value.progress.notice!.source]);
    expect(selected.map(selection => ({ row: selection.at.cell.row, column: selection.at.cell.column })))
      .toEqual([EXPLORATION_MARKER, EXPLORATION_MARKER]);
    await attachEvidence(info, 'opposite-earned-selections.json', selected);
    for (const [target, result] of [[page, a], [other, b]] as const) {
      const terminal = await target.evaluate(async id => {
        const c = window.canonicalFrontierExploration, before = await c.dump(), extra = await c.refusal(() => c.advance(id));
        const after = await c.dump(), settled = await c.settle(id); await c.acknowledge(id, settled.request.attemptId);
        return { before, after, extra, settled, final: await c.readDestination(id) };
      }, result.admission.id);
      expect(terminal.extra.rejected).toBe(true); expect(terminal.after).toBe(terminal.before);
      expect(terminal.final.value.operation.terminal?.disposition).toBe('completed');
      expect(terminal.final.value.operation.state).toBe('acknowledged');
      expect(terminal.final.head.quota.reservations).toBe(0);
    }
    for (const [index, target] of [page, other].entries()) {
      const continued = await target.evaluate(async () => {
        const c = window.canonicalFrontierExploration, selection = c.selectUnopenedObjectFrontier(await c.frame());
        const admission = await c.admit(selection), rows = await c.capture(admission.id, 8);
        return { selection, admission, rows, effects: await c.effects() };
      });
      await attachEvidence(info, `${index === 0 ? 'A' : 'B'}-explicit-opposite-crossing.json`, continued);
      expect(continued.selection).toEqual(selected[index]); expect(continued.rows).toHaveLength(9);
      expect(continued.rows.every(row => row.state.value.status === 'running')).toBe(true);
      expect(continued.rows[7].state.value.progress.position).toEqual(continued.selection.at);
      const last = continued.rows[8];
      expect(last.state.value.progress).toMatchObject({ steps: 8, exploration: { phase: 'cross-frontier' },
        binding: { kind: 'frontier-exploration', frontier: selected[index], target: selected[index].at },
        position: { level: 1, cell: { spaceId: selected[index].at.cell.spaceId,
          row: index === 0 ? 9 : 8, column: index === 0 ? 6 : 5 } } });
      expect(continued.effects).toEqual(index === 0 ? a.effects : b.effects);
      expect(last.state.head.roots.world).toEqual((index === 0 ? a : b).seeded.page.head.roots.world);
    }
  } finally {
    await context.close(); audit?.();
  }
});

test('opened chest is not a new-object stop; one operation crosses its original anchor and surveys past grid junctions', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed('A', 'opened-chest'), effects = await c.effects();
    const selection = seeded.page.value[0], admission = await c.admit(selection), rows = await c.capture(admission.id, 9);
    return { seeded, effects, selection, admission, rows, afterEffects: await c.effects() };
  });
  await attachEvidence(info, 'anchor-crossing-and-opened-chest.json', result);
  expect(result.rows).toHaveLength(10);
  expect(result.rows.every(row => row.state.value.status === 'running' && row.state.value.progress.reason === null)).toBe(true);
  expect(result.rows.map(row => row.state.value.progress.steps)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(result.rows[3].frame.sight.cells.flatMap(cell => cell.chests)).toEqual([{ id: 'chest-1-socket-6:room', opened: true }]);
  expect(result.rows[7].state.value.progress.position).toEqual(result.selection.at);
  expect(result.rows[8].state.value.progress).toMatchObject({ exploration: { phase: 'cross-frontier' },
    position: { level: 1, cell: { spaceId: result.selection.at.cell.spaceId, row: 6, column: 0 } } });
  expect(result.rows[9].state.value.progress.exploration?.phase).toBe('survey');
  expect(result.rows[9].state.value.progress.exploration?.target).not.toEqual(result.selection.at);
  for (const row of result.rows) expect(row.state.value.progress.binding).toEqual(result.rows[0].state.value.progress.binding);
  expect(result.rows.every(row => row.state.value.progress.position.cell.spaceId === result.selection.at.cell.spaceId)).toBe(true);
  const junctions = result.rows.filter(row => {
    const actor = row.frame.sight.header.actor;
    const cell = row.frame.sight.cells.find(cell => cell.at.level === actor.level && cell.at.cell.spaceId === actor.cell.spaceId
      && cell.at.cell.row === actor.cell.row && cell.at.cell.column === actor.cell.column)!;
    return Object.values(cell.edges).filter(Boolean).length >= 3;
  });
  expect(junctions.length).toBeGreaterThan(2);
  expect(result.afterEffects).toEqual(result.effects);
  expect(result.rows[9].state.head.roots.world).toEqual(result.seeded.page.head.roots.world);
});

test('newly seen downstairs yields a decision without entering stairs or generating another floor', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed('A', 'stairs'), effects = await c.effects();
    const admission = await c.admit(seeded.page.value[0]), rows = await c.capture(admission.id, 7);
    return { seeded, admission, rows, effects, afterEffects: await c.effects() };
  });
  await attachEvidence(info, 'delayed-stairs.json', result);
  expect(result.rows).toHaveLength(8);
  expect(result.rows.slice(0, 7).every(row => row.state.value.status === 'running' && row.frame.sight.cells.every(cell => !cell.stairs.length))).toBe(true);
  const last = result.rows[7], stair = last.frame.sight.cells.find(cell => cell.stairs.includes('down'));
  expect(stair).toBeDefined(); expect(last.state.value.progress).toMatchObject({ steps: 7, status: 'decision', reason: 'new-object' });
  const source = last.state.head.checkpoint.knowledge as { sequence: number; id: string };
  expect(last.state.value.progress.notice).toEqual({ kind: 'stairs-discovered', at: stair!.at, previousSource: null,
    source: { sequence: source.sequence, id: source.id, index: last.frame.sight.cells.indexOf(stair!) } });
  expect(last.state.value.progress.position).not.toEqual(stair!.at);
  expect(last.state.head.checkpoint).toMatchObject({ mode: 'manual', position: { level: 1 } });
  expect(last.state.head.roots.world).toEqual(result.seeded.page.head.roots.world);
  expect(result.afterEffects).toEqual(result.effects);
});
