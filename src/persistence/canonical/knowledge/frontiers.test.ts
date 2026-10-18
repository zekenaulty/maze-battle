// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { movePosition } from '../../../domain/maze/movement';
import { frontierSelection, isCurrentFrontier, readFrontiers } from './frontiers';
import { MAX_FRONTIER_READS } from './frontiers.read';
import { blockKey, localKey, observationKey } from './keys';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { worldBlockKey, worldCellKey } from './worldIndex';
import { DIRECTIONS, type MemoryBlock, type ObservedCell } from './types';
import type { WorldIndexBlock } from './worldIndex';

const open = (row: number, column: number, spaceId = 'room', localRow = row + 8, localColumn = column + 8): ObservedCell =>
  ({ ...earnedCell(row, column, spaceId, localRow, localColumn), edges: {} });
async function fixture(cells = [open(0, 0), open(-1, 0), open(1, 0)]) {
  const f = knowledgeFixture(); await f.observe(cells); f.reads.length = f.writes.length = 0; return f;
}
const memory = (f: Awaited<ReturnType<typeof fixture>>, cell: ObservedCell) =>
  (f.records.get(blockKey(cell.at))!.value as unknown as MemoryBlock).cells[localKey(cell.at)];
const spatial = (f: Awaited<ReturnType<typeof fixture>>, cell: ObservedCell) =>
  (f.records.get(worldBlockKey(cell.at.level, cell.world))!.value as unknown as WorldIndexBlock).cells[worldCellKey(cell.world)];

describe('current earned frontier selection', () => {
  it('orders public coordinates then cardinal directions, excludes actor/known neighbors and never writes', async () => {
    const f = await fixture(), selections = await readFrontiers(f.pages, f.checkpoint());
    expect(selections.map(s => [s.at.cell.row, s.direction])).toEqual([
      [7, 'north'], [7, 'east'], [7, 'west'], [9, 'east'], [9, 'south'], [9, 'west'],
    ]);
    expect(selections[0].source).toEqual({ sequence: 1, id: f.checkpoint().knowledge!.id, index: 1 });
    expect(f.writes).toEqual([]); expect(f.reads.every(key => key.startsWith('perception/'))).toBe(true);
    expect(f.reads.length).toBeLessThanOrEqual(MAX_FRONTIER_READS);
  });
  it('cites exact current sight even when unchanged memory retains older evidence', async () => {
    const f = await fixture(), before = await readFrontiers(f.pages, f.checkpoint());
    await f.observe([open(0, 0), open(-1, 0), open(1, 0)]);
    const after = await readFrontiers(f.pages, f.checkpoint());
    expect(after[0].source.sequence).toBe(2); expect(memory(f, open(-1, 0)).source.sequence).toBe(1);
    expect(await isCurrentFrontier(f.pages, f.checkpoint(), after[0])).toBe(true);
    expect(await isCurrentFrontier(f.pages, f.checkpoint(), before[0])).toBe(false);
    for (const changed of [{ ...after[0], direction: 'south' as const },
      { ...after[0], source: { ...after[0].source, index: 0 } },
      { ...after[0], source: { ...after[0].source, id: 'foreign' } },
      { ...after[0], at: { ...after[0].at, level: 2 } }])
      expect(await isCurrentFrontier(f.pages, f.checkpoint(), changed)).toBe(false);
  });
  it('excludes current and retained walls and links, even when sight omits a remembered edge', async () => {
    const actor = open(0, 0), anchor = open(-1, 0), neighbor = open(-2, 0);
    anchor.edges = { north: neighbor.at, west: null }; neighbor.edges = { south: anchor.at };
    const f = await fixture([actor, anchor, neighbor]);
    const cropped = { ...anchor, edges: { east: null } };
    await f.observe([actor, cropped]);
    expect(await readFrontiers(f.pages, f.checkpoint())).toEqual([]);
  });
  it('excludes a remembered physical neighbor across room boundaries, without revealing or scanning the room', async () => {
    const actor = open(0, 0), anchor = open(-1, 0), neighbor = open(-2, 0, 'other-room', 0, 0);
    anchor.edges = { east: null, west: null };
    const f = await fixture([actor, anchor, neighbor]); await f.observe([actor, anchor]); f.reads.length = 0;
    expect(await readFrontiers(f.pages, f.checkpoint())).toEqual([]);
    expect(f.reads).toContain(blockKey(neighbor.at));
    expect(f.reads.every(key => !key.startsWith('perception/room/'))).toBe(true);
  });
  it.each([-1, 0])('rejects an omitted cross-room neighbor from anchor row %s even when its remembered block is unloaded', async row => {
    const actor = open(row + 1, 0), anchor = open(row, 0), neighbor = open(row - 1, 0, 'other-room', 0, 0);
    anchor.edges = { east: null, west: null };
    const f = await fixture([actor, anchor, neighbor]); await f.observe([actor, anchor]);
    const source = f.checkpoint().knowledge!, selection = { at: anchor.at, direction: 'north' as const,
      source: { sequence: source.sequence, id: source.id, index: 1 } };
    expect(await readFrontiers(f.pages, f.checkpoint())).toEqual([]);
    const retained = structuredClone(f.records.get(blockKey(neighbor.at)));
    delete (f.records.get(worldBlockKey(1, neighbor.world))!.value as unknown as WorldIndexBlock).cells[worldCellKey(neighbor.world)];
    f.reads.length = f.writes.length = 0;
    await expect(readFrontiers(f.pages, f.checkpoint())).rejects.toThrow();
    await expect(isCurrentFrontier(f.pages, f.checkpoint(), selection)).rejects.toThrow();
    expect(f.records.get(blockKey(neighbor.at))).toEqual(retained); expect(f.writes).toEqual([]);
    expect(f.reads).not.toContain(blockKey(neighbor.at));
  });
  it('ignores old frontiers outside current sight and returns empty only for valid bounded none', async () => {
    const f = await fixture(); await f.observe([open(0, 0)]);
    expect(await readFrontiers(f.pages, f.checkpoint())).toEqual([]);
    const walls = await fixture([earnedCell()]); expect(await readFrontiers(walls.pages, walls.checkpoint())).toEqual([]);
  });
  it('refuses unavailable/stale sight and changed namespace rather than reporting none', async () => {
    const empty = knowledgeFixture(); await expect(readFrontiers(empty.pages, empty.checkpoint())).rejects.toThrow('unavailable');
    const f = await fixture(), checkpoint = f.checkpoint();
    await expect(readFrontiers(f.pages, { ...checkpoint, mode: 'town' })).rejects.toThrow('unavailable');
    await expect(readFrontiers(f.pages, { ...checkpoint, position: open(0, 1).at })).rejects.toThrow('stale');
    await expect(readFrontiers(f.pages, { ...checkpoint, knowledge: { ...checkpoint.knowledge!, witness: 'foreign' } })).rejects.toThrow('namespace');
  });
  it.each(['spatial-source', 'memory-facts', 'memory-source', 'observation-chunk', 'missing-visible-index', 'missing-neighbor-index',
    'neighbor-source', 'neighbor-memory', 'future-source'] as const)('fails closed on %s corruption, including membership reads', async kind => {
    const cells = [open(0, 0), open(-1, 0), kind === 'missing-neighbor-index' ? open(-2, 0) : open(-2, 0, 'neighbor', 0, 0)];
    const f = await fixture(cells), selection = (await readFrontiers(f.pages, f.checkpoint()))[0];
    await f.observe(cells.slice(0, 2));
    if (kind === 'spatial-source') spatial(f, cells[1]).source.id = 'forged';
    if (kind === 'memory-facts') memory(f, cells[1]).chests[0].opened = true;
    if (kind === 'memory-source') memory(f, cells[1]).source.index = 0;
    if (kind === 'observation-chunk') f.records.get(`${observationKey(2)}/0`)!.id = 'replaced';
    if (kind === 'missing-visible-index') delete (f.records.get(worldBlockKey(1, cells[1].world))!.value as unknown as WorldIndexBlock).cells[worldCellKey(cells[1].world)];
    if (kind === 'missing-neighbor-index') {
      // A known local memory block cannot silently lose its spatial entry.
      delete (f.records.get(worldBlockKey(1, cells[2].world))!.value as unknown as WorldIndexBlock).cells[worldCellKey(cells[2].world)];
    }
    if (kind === 'neighbor-source') spatial(f, cells[2]).source.id = 'forged';
    if (kind === 'neighbor-memory') memory(f, cells[2]).stairs = ['down'];
    if (kind === 'future-source') {
      memory(f, cells[1]).source.sequence = 3; spatial(f, cells[1]).source.sequence = 3;
    }
    await expect(readFrontiers(f.pages, f.checkpoint())).rejects.toThrow();
    await expect(isCurrentFrontier(f.pages, f.checkpoint(), selection)).rejects.toThrow();
  });
  it('does not grow reads with unrelated retained history', async () => {
    const f = await fixture();
    for (let i = 0; i < 64; i++) await f.observe([open(100 + i, 100 + i, `unrelated-${i}`, 0, 0)]);
    await f.observe([open(0, 0), open(-1, 0), open(1, 0)]); f.reads.length = f.writes.length = 0;
    expect(await readFrontiers(f.pages, f.checkpoint())).toHaveLength(6);
    expect(f.reads.length).toBeLessThan(32);
    expect(f.reads.some(key => key.includes('unrelated') || /observations\/(?:[2-9]|[1-5][0-9]|6[0-5])(?:\/|$)/.test(key))).toBe(false);
    expect(new Set(f.reads).size).toBe(f.reads.length); expect(f.writes).toEqual([]);
  });
  it('throws on logical read or byte exhaustion instead of truncating candidates to an empty result', async () => {
    const f = await fixture(Array.from({ length: 113 }, (_, i) => open(i * 16, i * 16, `room-${i}`, 0, 0)));
    await expect(readFrontiers(f.pages, f.checkpoint())).rejects.toThrow('read budget');
    expect(f.reads.length).toBeLessThanOrEqual(MAX_FRONTIER_READS);
    const small = await fixture(), get = small.pages.get.bind(small.pages);
    await expect(readFrontiers({ witness: small.pages.witness.bind(small.pages), scan: small.pages.scan.bind(small.pages), async get(area, key) {
      const row = await get(area, key); return row ? { ...row, padding: 'x'.repeat(1024 * 1024) } : row;
    } }, small.checkpoint())).rejects.toThrow();
  });
  it('handles a full 113-cell connected radius-seven sight with only bounded local reads', async () => {
    const cells = [open(0, 0)];
    for (let row = -7; row <= 7; row++) for (let column = -7; column <= 7; column++)
      if (Math.abs(row) + Math.abs(column) <= 7 && (row || column)) cells.push(open(row, column));
    const byWorld = new Map(cells.map(c => [worldCellKey(c.world), c]));
    for (const cell of cells) for (const direction of DIRECTIONS) {
      const neighbor = byWorld.get(worldCellKey(movePosition(cell.world, direction)));
      if (neighbor) cell.edges[direction] = neighbor.at;
    }
    const f = await fixture(cells), selections = await readFrontiers(f.pages, f.checkpoint());
    expect(cells).toHaveLength(113); expect(selections).toHaveLength(60);
    expect(f.reads.length).toBeLessThanOrEqual(64); expect(new Set(f.reads).size).toBe(f.reads.length);
  });
  it('retains old pinned reads while current membership changes and captures caller inputs before awaiting', async () => {
    const f = await fixture(), checkpoint = f.checkpoint(), pinned = f.snapshot();
    const first = await readFrontiers(f.pages, checkpoint), selection = structuredClone(first[0]);
    const pending = isCurrentFrontier(f.pages, checkpoint, selection);
    selection.source.id = 'changed'; checkpoint.position = open(0, 1).at;
    expect(await pending).toBe(true);
    await f.observe([open(0, 0)]);
    expect(await readFrontiers(pinned.pages, pinned.checkpoint())).toEqual(first);
    expect(await isCurrentFrontier(f.pages, f.checkpoint(), first[0])).toBe(false);
  });
  it.each([null, {}, { extra: true }, { direction: 'up' }, { at: { level: 1, cell: { spaceId: 'room', row: -1, column: 0 } } },
    { source: { sequence: 1, id: 'source', index: 113 } }, { source: { sequence: 1, id: 'source', index: 1, extra: true } }])('validates strict selection shape %j', mutation => {
    const value = { at: open(1, 0).at, direction: 'north', source: { sequence: 1, id: 'source', index: 1 } };
    const input = mutation === null || Object.keys(mutation).length === 0 ? mutation : { ...value, ...mutation };
    expect(() => frontierSelection(input)).toThrow();
  });
});
