import { expect, type Page, type BrowserContext } from '@playwright/test';
import type { Direction } from '../../src/domain/types';
import type { ObservedCell } from '../../src/persistence/canonical/knowledge/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import type { CommandKind } from '../../src/services/game/GameSession';
import type { Json } from '../../src/persistence/canonical/types';
import type * as fixture from './canonical-revisit.fixture';
import type * as probe from './canonical-revisit.probe';

export const key = (at: WorldPosition) => `${at.level}/${at.cell.spaceId}/${at.cell.row}:${at.cell.column}`;
export async function state(page: Page) {
  return page.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.fixture.ts')).state()) as Promise<ReturnType<typeof fixture.state>>;
}
export async function ready(page: Page, controlled = true) {
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => {
    const s = await state(page); return s.controlled === controlled && !s.busy && !!s.observation;
  }, { timeout: 60_000 }).toBe(true);
  const { snapshot } = await state(page);
  const frame = `${snapshot.generation}:${snapshot.gameId}:${snapshot.revision}:${snapshot.roots.knowledge}:`;
  await expect.poll(async () => (await page.locator('canvas').getAttribute('data-frame'))?.startsWith(frame)).toBe(true);
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
  await page.evaluate(async () => {
    await globalThis.__revisitAppSession!.flush();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Map evidence unavailable')).toHaveCount(0);
}
export async function boot(page: Page, depth = 1) {
  await page.route('**/revisit-setup', route => route.fulfill({ contentType: 'text/html', body: '<title>Fresh revisit setup</title>' }));
  await page.goto('/revisit-setup');
  const initialized = await page.evaluate(async depth => (await import('../../tests/e2e/canonical-revisit.initialize.ts')).initialize(depth), depth);
  expect(initialized.knowledgeRoot).toBeNull();
  await page.goto('/'); await ready(page);
  return initialized;
}
export async function command(page: Page, kind: CommandKind, input: Json) {
  const receipt = await page.evaluate(async ({ kind, input }) =>
    (await import('../../tests/e2e/canonical-revisit.fixture.ts')).command(kind, JSON.parse(input)), { kind, input: JSON.stringify(input) });
  await ready(page); return receipt;
}
export async function move(page: Page, direction: Direction) {
  const receipt = await page.evaluate(async direction =>
    (await import('../../tests/e2e/canonical-revisit.fixture.ts')).move(direction), direction);
  await ready(page); return receipt;
}
export type Sample = Awaited<ReturnType<typeof probe.finishProbe>>;
export async function measured(pages: Page[], action: () => Promise<unknown>) {
  const samples: Sample[] = [];
  for (const page of pages) await page.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.probe.ts')).startProbe());
  try {
    await action();
    // No auditing in this window. Include ordinary App polling and wait for native completion.
    for (const page of pages) await page.evaluate(async () => {
      await globalThis.__revisitAppSession?.flush();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  } finally {
    for (const page of pages) samples.push(await page.evaluate(async () =>
      (await import('../../tests/e2e/canonical-revisit.probe.ts')).finishProbe()));
  }
  for (const sample of samples) {
    expect(sample.forbidden).toEqual([]);
    expect(sample.native.operations.every(o => o.status === 'success')).toBe(true);
    expect(sample.native.transactions.every(t => t.outcome === 'complete')).toBe(true);
    expect(sample.native.operations.filter(o => ['getAll', 'getAllKeys', 'delete', 'clear'].includes(o.method))).toEqual([]);
  }
  return samples;
}
export function offline(context: BrowserContext) {
  const unexpected: string[] = [];
  context.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:5277/')) unexpected.push(request.url());
  });
  context.on('page', page => page.on('websocket', socket => {
    if (!socket.url().startsWith('ws://127.0.0.1:5277/')) unexpected.push(socket.url());
  }));
  return unexpected;
}

/** Test driver remembers only actual App observations; no layout/world lookup feeds routing. */
export class EarnedRoute {
  private cells = new Map<string, ObservedCell>();
  async reach(page: Page, matches: (cell: ObservedCell) => boolean, explore = false) {
    for (let steps = 0; steps <= 160; steps++) {
      const view = await state(page);
      for (const cell of view.observation!.cells) {
        const old = this.cells.get(key(cell.at));
        this.cells.set(key(cell.at), { ...cell, edges: { ...old?.edges, ...cell.edges } });
      }
      const start = key(view.checkpoint.position), queue: { id: string; path: Direction[] }[] = [{ id: start, path: [] }];
      const visited = new Set([start]); let path: Direction[] | undefined, frontier: Direction[] | undefined;
      for (let index = 0; index < queue.length; index++) {
        const current = queue[index], cell = this.cells.get(current.id)!;
        if (matches(cell)) { path = current.path; break; }
        if (current.path.length && Object.keys(cell.edges).length < 4) frontier ??= current.path;
        for (const direction of ['north', 'east', 'south', 'west'] as const) {
          const at = cell.edges[direction]; if (!at || at.level !== view.checkpoint.position.level || visited.has(key(at))) continue;
          visited.add(key(at));
          const next = [...current.path, direction];
          if (this.cells.has(key(at))) queue.push({ id: key(at), path: next });
          else frontier ??= next;
        }
      }
      path ??= explore ? frontier : undefined;
      if (!path) throw Error('No route supported by earned cells');
      if (!path.length) return view.checkpoint.position;
      if (steps === 160) throw Error('Earned route exceeded fixture step bound');
      await move(page, path[0]);
    }
    throw Error('Unreachable route');
  }
}
