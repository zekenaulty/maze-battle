import { describe, expect, it } from 'vitest';
import { readTownReturn } from './townReturn';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { observationKey } from './keys';
import { awayCell, returnFixture, townCell } from './townReturn.test-support';

describe('earned town return candidate', () => {
  it('prefers the current unique town stair without reading the initial observation', async () => {
    const f = knowledgeFixture(); await f.observe([awayCell()]); await f.observe([townCell()]);
    const checkpoint = f.checkpoint(), before = structuredClone(f.records); f.reads.length = 0;
    expect(await readTownReturn(f.pages, checkpoint)).toEqual({
      at: townCell().at, source: { sequence: 2, id: checkpoint.knowledge!.id, index: 0 },
    });
    expect(f.reads).not.toContain(observationKey(1)); expect(f.records).toEqual(before);
  });

  it('selects initial earned stairs after leaving sight without reading intervening history or map indexes', async () => {
    const f = await returnFixture();
    for (let i = 0; i < 24; i++) await f.observe([awayCell()]);
    const checkpoint = f.checkpoint(), before = structuredClone(f.records), writes = f.writes.length;
    f.reads.length = 0;
    expect(await readTownReturn(f.pages, checkpoint)).toEqual({
      at: f.town.at, source: { sequence: 1, id: f.original.id, index: 0 },
    });
    const allowed = [observationKey(1), observationKey(checkpoint.knowledge!.sequence)];
    expect(f.reads.filter(key => key.includes('/observation/')).every(key =>
      allowed.some(prefix => key === prefix || key.startsWith(`${prefix}/`)))).toBe(true);
    expect(f.reads.some(key => /^perception\/(?:world|room)\//.test(key))).toBe(false);
    expect(f.reads.length).toBe(20); // Four observation loads now include their manifests.
    expect(f.records).toEqual(before); expect(f.writes).toHaveLength(writes);
  });

  it('returns the original candidate source while revalidating newer compatible memory', async () => {
    const f = await returnFixture(false);
    await f.observe([{ ...f.town, chests: [{ id: 'chest', opened: true }] }]);
    await f.observe([awayCell()]);
    expect(await readTownReturn(f.pages, f.checkpoint())).toEqual({
      at: f.town.at, source: { sequence: 1, id: f.original.id, index: 0 },
    });
  });

  it('can select floor-1 remembered stairs from another current floor without selecting that floor', async () => {
    const f = await returnFixture(false), elsewhere = awayCell(); elsewhere.at.level = 2;
    await f.observe([elsewhere]);
    expect(await readTownReturn(f.pages, f.checkpoint())).toEqual({
      at: f.town.at, source: { sequence: 1, id: f.original.id, index: 0 },
    });
  });

  it('accepts the exact 113-cell limit and retains the selected cell index', async () => {
    const f = knowledgeFixture(), cells = Array.from({ length: 113 }, (_, column) =>
      earnedCell(0, column, 'wide', 0, column));
    cells[112].stairs = ['town']; await f.observe(cells);
    const checkpoint = f.checkpoint();
    expect(await readTownReturn(f.pages, checkpoint)).toEqual({
      at: cells[112].at, source: { sequence: 1, id: checkpoint.knowledge!.id, index: 112 },
    });
  });

  it('snapshots caller checkpoint and read methods before the first await, and owns its returned value', async () => {
    const f = await returnFixture(), checkpoint = f.checkpoint(), original = structuredClone(checkpoint);
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const pages = { get: f.pages.get.bind(f.pages), scan: f.pages.scan.bind(f.pages),
      witness: async (...args: Parameters<typeof f.pages.witness>) => { await paused; return f.pages.witness(...args); } };
    const pending = readTownReturn(pages, checkpoint);
    checkpoint.position.level = 2; checkpoint.knowledge!.id = 'changed'; checkpoint.activityLog.push('changed');
    pages.get = async () => { throw Error('changed reader'); };
    release();
    const result = await pending;
    expect(result).toEqual({ at: f.town.at, source: { sequence: 1, id: f.original.id, index: 0 } });
    result.at.cell.spaceId = 'changed'; result.source.index = 112;
    expect(await readTownReturn(f.pages, original)).toEqual({
      at: f.town.at, source: { sequence: 1, id: f.original.id, index: 0 },
    });
  });
});
