import { test, expect } from '@playwright/test';
import { attach, audit, isolated, ready, state } from './canonical-generated-endurance.support';
import { command, key } from './canonical-revisit.support';
import { GeneratedScout } from './canonical-generated-endurance.journey';
import type { connections } from './canonical-generated-endurance.recall';

test('generated seed 42: second-page room recall and paged connections precede two walked surface returns', async ({ page, context }, info) => {
  const scout = new GeneratedScout(), evidence: Record<string, unknown> = { seed: 42, setup: 'real generated birth only; no fixture positioning' };
  evidence.moves = scout.moves;
  try {
    const boot = await isolated(context, page, 42); evidence.boot = boot;
    const initial = await scout.observe(page), entrance = initial.checkpoint.position;
    expect(initial.observation!.cells.find(c => key(c.at) === key(entrance))!.stairs).toContain('town');
    evidence.outbound = await scout.reach(page); expect(scout.rooms.size).toBeGreaterThanOrEqual(5);
    const beforeRecall = await audit(page);
    const first = await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.recall')).rooms());
    expect(first.value.next).toBeTruthy(); expect(first.value.items).toHaveLength(4);
    const second = await page.evaluate(async cursor =>
      (await import('../../tests/e2e/canonical-generated-endurance.recall')).rooms(cursor), first.value.next);
    expect(second.value.items.length).toBeGreaterThan(0);
    const current = await state(page);
    const selected = second.value.items.find(node => node.spaceId !== current.checkpoint.position.cell.spaceId);
    if (!selected) throw Error('Second room page has no noncurrent earned selection');
    const viewport = await page.locator('canvas').evaluate(canvas => ({ row: Number(canvas.getAttribute('data-row-start')),
      column: Number(canvas.getAttribute('data-column-start')), rows: Number(canvas.getAttribute('data-rows')),
      columns: Number(canvas.getAttribute('data-columns')) }));
    expect(viewport.rows).toBeGreaterThan(0); expect(viewport.columns).toBeGreaterThan(0);
    const anchor = selected.anchor.world;
    expect(anchor.row < viewport.row || anchor.row >= viewport.row + viewport.rows
      || anchor.column < viewport.column || anchor.column >= viewport.column + viewport.columns).toBe(true);
    evidence.viewportBeforeRecall = viewport;
    evidence.pages = [first, second]; evidence.selected = selected;
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next room page' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next room page' }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Recall room at ${selected.anchor.world.row}, ${selected.anchor.world.column}`, exact: true }).click();
    await expect(page.getByText(`Room anchor ${selected.anchor.world.row}, ${selected.anchor.world.column}`, { exact: true })).toBeVisible();
    await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: info.outputPath('generated-room-recall.png') });
    await page.getByRole('button', { name: 'Map', exact: true }).focus(); await page.keyboard.press('m');
    await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'false'); await ready(page);
    expect((await audit(page)).head).toEqual(beforeRecall.head);
    const connectionPages: Awaited<ReturnType<typeof connections>>[] = []; evidence.connectionPages = connectionPages;
    for (const node of [...first.value.items, ...second.value.items]) {
      const found = await page.evaluate(async id =>
        (await import('../../tests/e2e/canonical-generated-endurance.recall')).connections(id), node.spaceId);
      connectionPages.push(found);
      if (found.value.next) {
        const next = await page.evaluate(async ({ id, cursor }) =>
          (await import('../../tests/e2e/canonical-generated-endurance.recall')).connections(id, cursor),
        { id: node.spaceId, cursor: found.value.next });
        connectionPages.push(next);
        expect(found.value.items).toHaveLength(1); expect(next.value.items).toHaveLength(1);
        expect(next.value.items[0].room.spaceId).not.toBe(found.value.items[0].room.spaceId);
        break;
      }
    }
    expect(connectionPages.some(result => !!result.value.next)).toBe(true);
    expect((await audit(page)).head).toEqual(beforeRecall.head);
    const cycles: { outward: number; returned: number; surface: Awaited<ReturnType<typeof state>> }[] = [];
    evidence.cycles = cycles;
    for (let cycle = 0; cycle < 2; cycle++) {
      const outward = await scout.reach(page, selected.anchor.at);
      expect(outward).toBeGreaterThan(0);
      expect(key((await state(page)).checkpoint.position)).toBe(key(selected.anchor.at));
      const returned = await scout.reach(page, entrance); expect(returned).toBeGreaterThan(0);
      await page.evaluate(async () =>
        (await import('../../tests/e2e/canonical-revisit.fixture')).command('exploration', { kind: 'stairs', direction: 'up' }));
      await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
      expect((await state(page)).checkpoint.mode).toBe('town');
      cycles.push({ outward, returned, surface: await state(page) });
      await command(page, 'roster', { kind: 'leave-town' });
      expect((await state(page)).checkpoint.position).toEqual(entrance);
    }
    expect(cycles).toHaveLength(2); expect(cycles[1].outward).toBeGreaterThan(0);
    const final = await state(page);
    expect(final.inventory).toEqual(initial.inventory); expect(final.stash).toEqual(initial.stash);
    expect(final.quests).toEqual(initial.quests);
    expect(boot.unexpected).toEqual([]); expect(boot.errors).toEqual([]);
    evidence.final = await audit(page);
  } finally { await attach(info, 'generated-journey.json', evidence); }
});
