import { describe, expect, it } from 'vitest';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { readKnowledgeRoom } from './roomView';
import { blockKey, localKey } from './keys';
import type { MemoryBlock } from './types';

describe('earned room source', () => {
  it('retains cropped facts, identifies missing coverage and follows only reciprocal earned exits', async () => {
    const f = knowledgeFixture(), a = earnedCell(), b = earnedCell(-5, -1, 'room', 0, 1), c = earnedCell(-5, 0, 'child');
    a.edges.east = b.at; b.edges.west = a.at; b.edges.east = c.at; c.edges.west = b.at;
    delete b.edges.north;
    await f.observe([a, b, c]); await f.observe([{ ...a, edges: {} }]);
    const before = f.writes.length, view = await readKnowledgeRoom(f.pages, f.checkpoint());
    expect(view.cells).toHaveLength(2); expect(view.region.cells).toHaveLength(3);
    expect(view.exits).toEqual([{ from: b.at, to: c.at, direction: 'east' }]);
    expect(view.frontiers.map(c => c.at)).toEqual([b.at]);
    expect(f.writes).toHaveLength(before);
    expect(f.reads.every(k => k.startsWith('perception/'))).toBe(true);
  });
  it('rejects forged remembered edges and uncovered cells rather than inventing a passage', async () => {
    const f = knowledgeFixture(), a = earnedCell(); await f.observe([a]);
    const row = f.records.get(blockKey(a.at))!, block = row.value as unknown as MemoryBlock;
    block.cells[localKey(a.at)].edges.east!.target = { level: 1, cell: { spaceId: 'hidden', row: 0, column: 0 } };
    await expect(readKnowledgeRoom(f.pages, f.checkpoint())).rejects.toThrow('memory integrity');
  });
  it('fails closed when current sight exceeds its finite local query window', async () => {
    const f = knowledgeFixture(), a = earnedCell(), outside = earnedCell(-5, -1, 'room', 0, 16);
    a.edges.east = outside.at; outside.edges.west = a.at; await f.observe([a, outside]);
    await expect(readKnowledgeRoom(f.pages, f.checkpoint())).rejects.toThrow('current sight');
  });
});
