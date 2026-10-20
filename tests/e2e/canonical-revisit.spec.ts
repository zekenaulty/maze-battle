import { test, expect, type Page } from '@playwright/test';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { boot, command, EarnedRoute, key, measured, offline, ready, state } from './canonical-revisit.support';

const capture = (page: Page, positions: WorldPosition[]) => page.evaluate(async positions =>
  (await import('../../tests/e2e/canonical-revisit.audit.ts')).capture(positions), positions);

test('actual App revisits two floors twice across reload and takeover without changing prior content or evidence', async ({ page, context }, info) => {
  const network = offline(context), errors: string[] = [], samples = [], route = new EarnedRoute();
  context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  const entrance = (await state(page)).checkpoint.position;
  await page.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.fixture.ts')).acceptSurvey());
  await ready(page);
  const chest = await route.reach(page, cell => cell.chests.some(c => !c.opened), true);
  const collected = await page.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.fixture.ts')).collect());
  await ready(page);
  const complete = await state(page);
  expect(complete.quests.find(q => q.task.item?.baseId === 'survey-seal')).toMatchObject({ status: 'complete', task: { progress: 1 } });
  expect(complete.inventory.items.filter(i => i.baseId === 'survey-seal')).toHaveLength(1);
  expect(complete.stash.items.filter(i => i.baseId === 'survey-seal')).toHaveLength(0);
  const exit = await route.reach(page, cell => cell.stairs.includes('down'), true);
  // First descent prepares the next ordinary generated floor through GameSession.
  await command(page, 'exploration', { kind: 'stairs', direction: 'down' });
  expect((await state(page)).checkpoint.position.level).toBe(2);
  const witness = await capture(page, [entrance, chest]), originalGame = witness.snapshot.gameId;
  expect(witness.receipts.some(r => r.attemptId === collected.attemptId)).toBe(true);
  expect(witness.memory.map(m => m.state)).toEqual(['remembered', 'remembered']);

  async function unchanged(owner: Page) {
    const retained = await owner.evaluate(async witness =>
      (await import('../../tests/e2e/canonical-revisit.audit.ts')).retained(JSON.parse(witness)), JSON.stringify(witness));
    expect(retained).toEqual({ missing: [], changed: [] });
    const current = await capture(owner, [entrance, chest]);
    expect(current.snapshot.gameId).toBe(originalGame);
    expect(current.selected).toEqual(witness.selected);
    expect(current.roster.inventory).toEqual(witness.roster.inventory);
    expect(current.roster.stash).toEqual(witness.roster.stash);
    for (const old of witness.known) expect(current.known.find(cell => key(cell.at) === key(old.at))).toMatchObject(old);
    for (let i = 0; i < witness.memory.length; i++) {
      const old = witness.memory[i].cell, next = current.memory[i].cell;
      expect(old).toBeDefined(); expect(next).toBeDefined();
      expect(next).toMatchObject({ ...old! });
    }
    return { counts: current.counts, position: current.checkpoint.position, knowledge: current.checkpoint.knowledge };
  }
  const checks: Awaited<ReturnType<typeof unchanged>>[] = [];
  samples.push({ action: 'first-ascent', tabs: await measured([page], () => command(page, 'exploration', { kind: 'stairs', direction: 'up' })) });
  expect(key((await state(page)).checkpoint.position)).toBe(key(exit));
  await route.reach(page, cell => key(cell.at) === key(entrance));
  checks.push(await unchanged(page));
  await route.reach(page, cell => key(cell.at) === key(exit));
  samples.push({ action: 'second-descent', tabs: await measured([page], () => command(page, 'exploration', { kind: 'stairs', direction: 'down' })) });
  expect((await state(page)).checkpoint.position.level).toBe(2);

  const other = await context.newPage(); await other.goto('/'); await ready(other, false);
  const before = await state(page);
  samples.push({ action: 'takeover', tabs: await measured([page, other], async () => {
    await other.getByRole('button', { name: 'Take control', exact: true }).click();
    await ready(other); await ready(page, false);
  }) });
  const owned = await state(other);
  expect(owned.checkpoint.position).toEqual(before.checkpoint.position);
  expect(owned.snapshot.roots.world).toBe(before.snapshot.roots.world);
  expect(owned.snapshot.roots.knowledge).toBe(before.snapshot.roots.knowledge);
  samples.push({ action: 'stale-owner-move', tabs: await measured([page, other], async () => {
    await page.keyboard.press('ArrowRight');
    const refusal = await page.evaluate(async () => {
      try { await (await import('../../tests/e2e/canonical-revisit.fixture.ts')).move('east'); return null; }
      catch (error) { return String(error); }
    });
    expect(refusal).toMatch(/control|Inactive|aborted/i);
    await page.waitForTimeout(800); await ready(other);
  }) });
  expect((await state(other)).snapshot).toEqual(owned.snapshot);
  expect(samples.at(-1)!.tabs.every(s => s.writes === 0)).toBe(true);
  await other.reload(); await ready(other);
  expect((await state(other)).checkpoint.mode).toBe('manual');
  checks.push(await unchanged(other));
  samples.push({ action: 'second-ascent', tabs: await measured([page, other], () => command(other, 'exploration', { kind: 'stairs', direction: 'up' })) });
  expect(key((await state(other)).checkpoint.position)).toBe(key(exit));
  await route.reach(other, cell => key(cell.at) === key(chest));
  const repeated = await other.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.fixture.ts')).collect());
  expect(repeated.result).toMatchObject({ outcome: 'unchanged' });
  await ready(other);
  await route.reach(other, cell => key(cell.at) === key(entrance));
  checks.push(await unchanged(other));
  expect(checks.at(-1)!.counts.observations).toBeGreaterThan(witness.counts.observations);
  expect(checks.at(-1)!.knowledge!.id).not.toBe(witness.checkpoint.knowledge!.id);
  for (const sample of samples) for (const tab of sample.tabs) {
    expect(tab.readKeys.filter(k => /^dungeon\/(?![12](?:\/|$))\d/.test(k))).toEqual([]);
    expect(tab.writeKeys.filter(k => k.startsWith('dungeon/'))).toEqual([]);
  }
  expect(network).toEqual([]); expect(errors).toEqual([]);
  await info.attach('revisit-evidence.json', { body: JSON.stringify({ base: 'ee7744b', baseline: witness.counts,
    immutableRecords: witness.immutable.length, exactCurrentRecords: witness.selected.length,
    earnedCells: witness.known.length, exactReceipts: witness.receipts.length, collected, checks, samples }, null, 2), contentType: 'application/json' });
  await other.close();
});
