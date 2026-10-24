import { expect, test } from '@playwright/test';
import type {} from './canonical-agentica-perception.fixture';
import type { InspectArgs } from '../../src/services/agentica/game/types';
import type { KnownNode } from '../../src/persistence/canonical/knowledge/graph';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5241' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-agentica-perception.html'); await page.waitForFunction(() => !!window.agenticaPerception);
});

test('real earned actor context and all manifests fit start; cell result fits the SDK budget without writes', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed(), initial = await c.project(f.ref);
    const args: InspectArgs = { scope: 'cell', level: f.checkpoint.position.level, ...f.checkpoint.position.cell };
    const cell = await c.project(f.ref, args), start = c.launchStart({ ...c.launchStartFixture(initial.value.observation.revision),
      observation: initial.value.observation, capabilities: c.mazeCapabilities() });
    return { initial, cell, start, head: (await c.readCanonicalHead()).head, at: f.checkpoint.position };
  });
  expect(r.initial.value.observation.data).not.toHaveProperty('cells'); expect(r.initial.value.observation.data).not.toHaveProperty('rooms');
  expect(r.cell.value.observation.data.cell).toMatchObject({ at: { level: r.at.level, ...r.at.cell }, state: 'visible' });
  expect(new TextEncoder().encode(JSON.stringify(r.start)).length).toBeLessThanOrEqual(3072);
  expect(new TextEncoder().encode(JSON.stringify(r.cell.value.observation)).length).toBeLessThanOrEqual(2800);
  expect(r.head).toEqual(r.initial.head); expect(r.cell.stats.writes).toBe(0); expect(r.cell.value.reads.length).toBeLessThanOrEqual(256);
});

test('map contains only known room identities and room detail is opt-in and paginated', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed(), map = await c.project(f.ref, { scope: 'map' });
    const pages = []; let cursor: string | undefined;
    for (let i = 0; i < 128; i++) {
      const page = await c.project(f.ref, { scope: 'room', ...(cursor ? { cursor } : {}) }); pages.push(page.value.observation);
      cursor = page.value.observation.data.next as string | undefined; if (!cursor) break;
    }
    return { map: map.value.observation, pages, cursor, known: await c.knowledge.current(), anchor: f.checkpoint.knowledge! };
  });
  expect(r.map.data).not.toHaveProperty('cells');
  const observed = r.known.value;
  const expected: KnownNode[] = observed.header.spaces!.filter(space => space.kind === 'room').slice(0, 2).map(space => {
    const cell = observed.cells[space.index];
    return { level: cell.at.level, spaceId: space.spaceId, kind: 'room', anchor: {
      at: cell.at, world: cell.world, source: { sequence: observed.header.sequence, id: r.anchor.id, index: space.index },
    } };
  });
  expect(expected.length).toBeGreaterThan(0);
  expect(r.map.data.rooms).toEqual(expected);
  expect((r.map.data.rooms as object[]).every(room => Object.keys(room).sort().join() === 'anchor,kind,level,spaceId')).toBe(true);
  expect(r.cursor).toBeUndefined();
  const cells = r.pages.flatMap(p => p.data.cells as { at: unknown }[]);
  expect(cells.length).toBeGreaterThan(0); expect(new Set(cells.map(c => JSON.stringify(c.at))).size).toBe(cells.length);
  for (const value of r.pages) expect(new TextEncoder().encode(JSON.stringify(value)).length).toBeLessThanOrEqual(2800);
});

test('unknown targets are opaque; hidden world changes cannot refresh a captured publication', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed(), a = await c.project(f.ref, { scope: 'cell', level: 1, spaceId: 'undiscovered', row: 0, column: 0 });
    const b = await c.project(f.ref, { scope: 'cell', level: 1, spaceId: 'absent', row: 0, column: 0 });
    const before = await c.project(f.ref, { scope: 'room' }, f.snapshot);
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.hidden'), async tx => { await tx.pages.set('world', 'fixture/hidden', { secret: 'changed' }); return true; });
    const after = await c.project(f.ref, { scope: 'room' }, f.snapshot), current = await c.project(f.ref, { scope: 'room' }).catch(String);
    return { a: a.value.observation, b: b.value.observation, before: before.value.observation, after: after.value.observation, current };
  });
  expect(r.a).toEqual(r.b); expect(r.a.data).toEqual({ scope: 'cell', state: 'unknown' });
  expect(r.before).toEqual(r.after); expect(String(r.current)).toContain('snapshot differs');
});

test('new sight rejects old cursors and leaves old source history readable at its snapshot', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed(), original = await c.project(f.ref, { scope: 'room' }), cursor = original.value.observation.data.next as string;
    await c.knowledge.act({ kind: 'look' }); const ref = await c.publish();
    const stale = await c.project(ref, { scope: 'room', cursor }).catch(String), old = await c.project(f.ref, { scope: 'room' }, f.snapshot);
    return { stale, original: original.value.observation, old: old.value.observation };
  });
  expect(String(r.stale)).toContain('cursor'); expect(r.old).toEqual(r.original);
});

test('malformed referenced publication cannot become an empty or unknown view', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed(), db = await c.openCanonicalDatabase();
    await db.delete('records', [f.snapshot.gameId, f.ref.id]); db.close();
    return c.project(f.ref).then(() => 'unexpected success', String);
  });
  expect(r).toMatch(/^Error:/);
});

test('projection arguments and source identity are captured inside the transaction before awaiting', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed();
    return c.readCanonical(async (pages, snapshot) => {
      const ref = { ...f.ref }, args: InspectArgs = { scope: 'cell', level: f.checkpoint.position.level, ...f.checkpoint.position.cell };
      const result = c.inspectMaze(c.guard(pages).pages, snapshot, ref, args);
      args.row = 511; ref.id = 'changed'; snapshot.checkpoint.mode = 'town'; return result;
    });
  });
  expect(r.value.data.cell).toMatchObject({ state: 'visible' }); expect(r.value.observationId).not.toBe('changed'); expect(r.stats.writes).toBe(0);
});

test('earned negative-world coordinates stay signed and old room cells remain remembered with original sources', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed(), target: InspectArgs = { scope: 'cell', level: 1, ...f.checkpoint.position.cell };
    const old = (await c.project(f.ref, target)).value.observation, at = await c.visitNegativeRoom(), ref = await c.publish();
    return { old, remembered: (await c.project(ref, target)).value.observation,
      here: (await c.project(ref, { scope: 'cell', level: at.level, ...at.cell })).value.observation,
      map: (await c.project(ref, { scope: 'map' })).value.observation };
  });
  const old = r.old.data.cell as { source: unknown }, remembered = r.remembered.data.cell as { source: unknown; state: string };
  expect(remembered.state).toBe('remembered'); expect(remembered.source).toEqual(old.source);
  const here = r.here.data.cell as { world: { row: number; column: number } };
  expect(here.world.row < 0 || here.world.column < 0).toBe(true);
  expect((r.map.data.rooms as unknown[]).length).toBeGreaterThanOrEqual(2); expect(r.map.data).not.toHaveProperty('cells');
});

test('missing original evidence after newer unchanged sight rejects inspect instead of substituting fresh sources', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaPerception, f = await c.seed(); await c.knowledge.act({ kind: 'look' }); const ref = await c.publish();
    const db = await c.openCanonicalDatabase(); await db.delete('records', [f.snapshot.gameId, f.checkpoint.knowledge!.id]); db.close();
    const actor = await c.project(ref);
    const inspect = await c.project(ref, { scope: 'cell', level: 1, ...f.checkpoint.position.cell }).then(() => 'unexpected success', String);
    return { actor: actor.value.observation, inspect };
  });
  expect(r.actor.data.scope).toBe('actor'); expect(r.inspect).toContain('missing referenced record');
});
