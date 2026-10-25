// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { perceptionFixture } from './observation.test-support';
import { inspectMaze, observeMaze } from './observation';
import type { CellAddress } from './types';

interface ObjectCell { at: CellAddress; chests: { id: string; opened: boolean }[]; stairs: string[]; source: { sequence: number; id: string; index: number } }
describe('on-demand visible objects', () => {
  it('projects only committed visible chests/stairs without interaction authority or world reads', async () => {
    const a = earnedCell(), b = earnedCell(-4, -2, 'neighbor');
    a.stairs = ['town']; b.chests[0] = { id: 'cache-neighbor', opened: false };
    const f = await perceptionFixture([a, b]);
    expect(JSON.stringify(await observeMaze(f.pages, f.snapshot, f.ref))).not.toContain('cache-neighbor');
    const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects' });
    expect(result.data).toEqual({ scope: 'objects', state: 'visible', objects: [a, b].map((cell, index) => ({
      at: { level: cell.at.level, ...cell.at.cell }, chests: cell.chests, stairs: cell.stairs,
      ...(index === 0 ? { stairways: [{ direction: 'town', at: { level: 1, ...a.at.cell }, targetLevel: 'town', destinationKind: 'town',
        source: { sequence: 1, id: f.knowledge.checkpoint().knowledge!.id, index } }] } : {}),
      source: { sequence: 1, id: f.knowledge.checkpoint().knowledge!.id, index },
    })) });
    expect(JSON.stringify(result)).not.toMatch(/"target":|contents|reward|"world"/);
    expect(f.knowledge.reads.every(key => key.startsWith('perception/'))).toBe(true);
    expect(jsonBytes(result)).toBeLessThanOrEqual(2800);
  });
  it('does not return remembered out-of-sight objects or refresh their state', async () => {
    const old = earnedCell(); old.stairs = ['down'];
    const f = await perceptionFixture([old]), fresh = earnedCell(-3, -2, 'elsewhere');
    fresh.chests = []; fresh.stairs = [];
    await f.knowledge.observe([fresh]); f.republish();
    expect((await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects' })).data)
      .toEqual({ scope: 'objects', state: 'visible', objects: [] });
    expect((await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'cell', level: 1, ...old.at.cell })).data)
      .toMatchObject({ cell: { state: 'remembered', chests: old.chests } });
  });
  it('uses the current receipt for unchanged objects, not the older fact source', async () => {
    const f = await perceptionFixture(); await f.knowledge.observe([earnedCell()]); f.republish();
    const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects' });
    const { sequence, id } = f.knowledge.checkpoint().knowledge!;
    expect((result.data.objects as unknown as ObjectCell[])[0].source)
      .toEqual({ sequence, id, index: 0 });
  });
  it('adds landing-room destination hints with the exact current stair receipt without changing stairs arrays', async () => {
    const cell = earnedCell(); cell.at.level = 2; cell.stairs = ['up', 'down'];
    const f = await perceptionFixture([cell]), oldSource = f.knowledge.checkpoint().knowledge!;
    await f.knowledge.observe([cell]); f.republish();
    const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects' }), { sequence, id } = f.knowledge.checkpoint().knowledge!;
    expect((result.data.objects as any[])[0]).toMatchObject({ stairs: ['up', 'down'], stairways: [
      { direction: 'up', at: { level: 2, ...cell.at.cell }, targetLevel: 1, destinationKind: 'landing-room', source: { sequence, id, index: 0 } },
      { direction: 'down', at: { level: 2, ...cell.at.cell }, targetLevel: 3, destinationKind: 'landing-room', source: { sequence, id, index: 0 } },
    ] });
    expect(id).not.toBe(oldSource.id);
    expect(JSON.stringify(result)).not.toMatch(/"target":|contents|reward|"world"/);
    expect(f.knowledge.reads.every(key => key.startsWith('perception/'))).toBe(true);
  });
  it('returns unavailable in town without disclosing stale dungeon sight', async () => {
    const f = await perceptionFixture(); f.snapshot.checkpoint.mode = 'town'; f.publication.snapshot.checkpoint.mode = 'town';
    expect((await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects' })).data)
      .toEqual({ scope: 'objects', state: 'unavailable', objects: [] });
  });
  it('paginates visible object cells exactly once under the byte and item limits', async () => {
    const cells = Array.from({ length: 30 }, (_, column) => {
      const cell = earnedCell(0, column, 'room', 0, column); cell.chests[0].id = 'x'.repeat(120) + column;
      return cell;
    });
    const f = await perceptionFixture(cells), found: ObjectCell[] = []; let cursor: string | undefined;
    for (let i = 0; i < 30; i++) {
      const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects', ...(cursor ? { cursor } : {}) });
      const objects = result.data.objects as unknown as ObjectCell[];
      expect(objects.length).toBeLessThanOrEqual(4); expect(jsonBytes(result)).toBeLessThanOrEqual(2800);
      found.push(...objects); cursor = result.data.next as string | undefined; if (!cursor) break;
    }
    expect(cursor).toBeUndefined(); expect(found.map(c => c.at.column)).toEqual(cells.map(c => c.at.cell.column));
    expect(found.map(c => c.source.index)).toEqual(cells.map((_, index) => index));
  });
  it('paginates synthetic surplus stairways rather than granting access to their destinations', async () => {
    const cells = Array.from({ length: 12 }, (_, column) => {
      const cell = earnedCell(0, column, 'room', 0, column); cell.chests = []; cell.stairs = ['down']; return cell;
    });
    const f = await perceptionFixture(cells), found: any[] = []; let cursor: string | undefined;
    for (let page = 0; page < 12; page++) {
      const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects', ...(cursor ? { cursor } : {}) });
      expect(jsonBytes(result)).toBeLessThanOrEqual(2800); found.push(...result.data.objects as any[]);
      cursor = result.data.next as string | undefined; if (!cursor) break;
    }
    expect(cursor).toBeUndefined(); expect(found).toHaveLength(cells.length);
    expect(found.map(cell => cell.stairways[0].source.index)).toEqual(cells.map((_, index) => index));
    expect(found.every(cell => cell.stairs[0] === 'down' && cell.stairways[0].targetLevel === 2 && cell.stairways[0].destinationKind === 'landing-room')).toBe(true);
    expect(JSON.stringify(found)).not.toMatch(/destinationRoomId|"target":|contents/);
  });
  it('rejects stale, foreign and out-of-range cursors', async () => {
    const f = await perceptionFixture(Array.from({ length: 8 }, (_, column) => earnedCell(0, column, 'room', 0, column)));
    const first = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects' }), cursor = first.data.next as string;
    for (const change of [(v: any) => { v.after = 999; }, (v: any) => { v.publication.id = 'foreign'; },
      (v: any) => { v.query.scope = 'frontiers'; }]) {
      const token = JSON.parse(cursor); change(token);
      await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects', cursor: JSON.stringify(token) })).rejects.toThrow();
    }
    await f.knowledge.observe([earnedCell()]); f.republish();
    await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects', cursor })).rejects.toThrow(/stale|foreign/);
  });
  it.each([{ level: 1 }, { spaceId: 'elsewhere' }, { row: 0, column: 0 }, { target: 'hidden' }])
  ('refuses extra scope authority %j', async extra => {
    const f = await perceptionFixture();
    await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects', ...extra })).rejects.toThrow();
  });
});
