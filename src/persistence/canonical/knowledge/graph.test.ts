// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KnownGraphUnavailableError, listKnownLinks, listKnownNodes, readKnownAnchor } from './graph';
import { connected, earnedCell, graphFixture } from './graph.test-support';
import { blockKey, localKey, observationKey } from './keys';
import { graphLinks, linksKey, nodeKey } from './graph.records';
import { knowledgeFixture } from './region.test-support';
import { graphPages } from './graph.read';
import type { KnowledgeRead, MemoryBlock, ObservedSpace } from './types';

describe('earned graph pages and anchors', () => {
  it('classifies only from original sight, retains sources, and pages rooms across three pages', async () => {
    const f = graphFixture(), cells = Array.from({ length: 9 }, (_, n) => earnedCell(0, n, `space-${n}`));
    const spaces: ObservedSpace[] = cells.map((c, n) => ({ spaceId: c.at.cell.spaceId, kind: n % 2 ? 'passage' : 'room', index: n }));
    const first = await f.observe(cells, spaces); const before = structuredClone(f.records);
    const ids: string[] = []; let cursor: string | undefined;
    for (const count of [2, 2, 1]) {
      const page = await listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'room', limit: 2, ...(cursor ? { cursor } : {}) });
      expect(page.items).toHaveLength(count); expect(page.items.every(n => n.kind === 'room' && n.anchor.source.id === first.reference.id)).toBe(true);
      ids.push(...page.items.map(n => n.spaceId)); cursor = page.next;
    }
    expect(cursor).toBeUndefined(); expect(ids).toEqual(['space-0', 'space-2', 'space-4', 'space-6', 'space-8']);
    expect(f.records).toEqual(before);
    expect((await listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'passage' })).items).toHaveLength(4);
  });
  it('reads distant anchors from current memory without scanning history, and preserves unchanged first sources', async () => {
    const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
    const original = await readKnownAnchor(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[0].spaceId });
    await f.observe(pair.cells, pair.spaces);
    for (let n = 0; n < 20; n++) await f.observe([earnedCell(30, 30, 'away')]);
    f.reads.length = 0;
    expect(await readKnownAnchor(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[0].spaceId })).toEqual(original);
    expect(f.reads.filter(k => k.includes('/observation/')).every(k => k.startsWith(`${observationKey(1)}/`)
      || k === observationKey(1) || k.startsWith(`${observationKey(22)}/`) || k === observationKey(22))).toBe(true);
    expect(f.reads.length).toBeLessThan(30);
    expect(await readKnownAnchor(f.pages, f.checkpoint(), { level: 1, spaceId: 'unknown' })).toBeNull();
  });
  it('keeps full metadata, state and methods detached from caller mutation across awaits', async () => {
    const f = graphFixture(); await f.observe([earnedCell()]);
    const checkpoint = f.checkpoint(), input = { level: 1, kind: 'room' as const, limit: 1 };
    let release!: () => void; const wait = new Promise<void>(r => { release = r; });
    const pages: KnowledgeRead = { get: f.pages.get.bind(f.pages), scan: f.pages.scan.bind(f.pages),
      witness: async (...args) => { await wait; return f.pages.witness(...args); } };
    const result = listKnownNodes(pages, checkpoint, input);
    checkpoint.position.level = 9; checkpoint.knowledge!.id = 'changed'; input.level = 9;
    pages.get = async () => { throw Error('mutated reader'); }; release();
    const value = await result; expect(value.items[0].level).toBe(1);
    value.items[0].anchor.at.level = 9;
    expect((await listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'room' })).items[0].level).toBe(1);
  });
});

describe('earned reciprocal connections', () => {
  it('retains original link evidence through renewed sight and returns opposite indexed endpoints', async () => {
    const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
    const scope = { level: 1, spaceId: pair.spaces[0].spaceId, limit: 1 };
    const first = await listKnownLinks(f.pages, f.checkpoint(), scope); await f.observe(pair.cells, pair.spaces);
    expect((await listKnownLinks(f.pages, f.checkpoint(), scope)).items).toEqual(first.items);
    const reverse = (await listKnownLinks(f.pages, f.checkpoint(), { ...scope, spaceId: pair.spaces[1].spaceId })).items[0];
    expect(reverse).toEqual({ id: first.items[0].id, from: first.items[0].to, to: first.items[0].from, direction: 'west' });
    expect(first.items[0].from.source.sequence).toBe(1);
  });
  it('does not infer an edge from a partially observed doorway', async () => {
    const f = graphFixture(), pair = connected(), a = structuredClone(pair.cells[0]); delete a.edges.east;
    await f.observe([a]);
    expect((await listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: a.at.cell.spaceId })).items).toEqual([]);
    expect(await readKnownAnchor(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[1].spaceId })).toBeNull();
  });
  it('removes reciprocal adjacency after one observed closure without refreshing the unseen endpoint memory', async () => {
    const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
    const unseenKey = blockKey(pair.cells[1].at), unseen = structuredClone(f.records.get(unseenKey));
    const closed = structuredClone(pair.cells[0]); closed.edges.east = null; await f.observe([closed]);
    expect(f.records.get(unseenKey)).toEqual(unseen);
    for (const space of pair.spaces) expect((await listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: space.spaceId })).items).toEqual([]);
    await f.observe([earnedCell(30, 30, 'away')]);
    expect((await listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[0].spaceId })).items).toEqual([]);
  });
  it('rejects retained traversability when current out-of-sight memory changes without its graph update', async () => {
    const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
    const old = new Map([...f.records].filter(([k]) => k.startsWith('perception/graph/links/')));
    const closed = structuredClone(pair.cells[0]); closed.edges.east = null; await f.observe([closed]);
    for (const [key, value] of old) f.records.set(key, value);
    await f.observe([earnedCell(30, 30, 'away')]);
    await expect(listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[0].spaceId })).rejects.toThrow('current memory');
  });
  it('pages one selected space at one link per page without hiding other known links', async () => {
    const f = graphFixture(), center = earnedCell(0, 0, 'center'), east = earnedCell(0, 1, 'east'), south = earnedCell(1, 0, 'south');
    center.edges.east = east.at; east.edges.west = center.at; center.edges.south = south.at; south.edges.north = center.at;
    await f.observe([center, east, south]);
    const first = await listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: 'center', limit: 1 });
    expect(first.items).toHaveLength(1); expect(first.next).toBeDefined();
    const second = await listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: 'center', limit: 1, cursor: first.next });
    expect(second.items).toHaveLength(1); expect(second.next).toBeUndefined(); expect(second.items[0].id).not.toBe(first.items[0].id);
  });
});

describe('availability and read budgets', () => {
  it('explicitly refuses null and old unmarked history without writes or a fallback map', async () => {
    const f = knowledgeFixture();
    await expect(listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'room' })).rejects.toBeInstanceOf(KnownGraphUnavailableError);
    await f.observe([earnedCell()]); const before = structuredClone(f.records);
    await expect(readKnownAnchor(f.pages, f.checkpoint(), { level: 1, spaceId: 'room' })).rejects.toMatchObject({ name: 'KnownGraphUnavailableError', code: 'known-graph-unavailable' });
    expect(f.records).toEqual(before);
  });
  it('reports an unmarked fixture unavailable without inventing a graph', async () => {
    const f = graphFixture(); await f.observe([earnedCell()], undefined, false);
    await expect(listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'all' })).rejects.toBeInstanceOf(KnownGraphUnavailableError);
  });
  it('enforces knowledge-only, no scan, 256 point-read and 1MiB byte limits', async () => {
    const empty: KnowledgeRead = { get: async () => undefined, witness: async () => null, scan: async () => { throw Error('scan'); } };
    const pages = graphPages(empty);
    for (let n = 0; n < 256; n++) await pages.get('knowledge', `point/${n}`);
    await expect(pages.get('knowledge', 'overflow')).rejects.toThrow('read budget');
    await expect(graphPages(empty).get('world', 'hidden')).rejects.toThrow('knowledge only');
    await expect(graphPages(empty).scan('knowledge', 'history')).rejects.toThrow('cannot scan');
    const large = { ...empty, get: async () => ({ value: 'x'.repeat(1024 * 1024) }) as never };
    await expect(graphPages(large).get('knowledge', 'big')).rejects.toThrow();
  });
  it('refuses changed current memory even when the original anchor source remains valid', async () => {
    const f = graphFixture(); await f.observe([earnedCell()]); await f.observe([earnedCell(30, 30, 'away')]);
    const memory = f.records.get(blockKey(earnedCell().at))!.value as unknown as MemoryBlock;
    memory.cells[localKey(earnedCell().at)].world.row++;
    await expect(readKnownAnchor(f.pages, f.checkpoint(), { level: 1, spaceId: 'room' })).rejects.toThrow('memory integrity');
  });
  it('does not repair a deleted old node on the next observation', async () => {
    const f = graphFixture(); await f.observe([earnedCell()]);
    f.records.delete(nodeKey(1, 'room')); f.records.delete(`${nodeKey(1, 'room')}/integrity`);
    await expect(f.observe([earnedCell()])).rejects.toThrow('backfilled');
  });
  it('keeps adjacency records bounded independently of page size', async () => {
    const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
    const value = graphLinks(f.records.get(linksKey(1, pair.spaces[0].spaceId))!.value);
    expect(() => graphLinks({ ...value, links: Array(5).fill(value.links[0]) })).toThrow('bound');
  });
});
