import { expect, it } from 'vitest';
import { assertModuleQuality, moduleQuality } from '../../../domain/expedition/topology/modules/quality';
import { advanceWorldFloorQuality, beginWorldFloorQuality, requireWorldFloorQuality, reduceQualityTreeNode } from './quality';
import { chainRecords } from './qualityChain.test-support';
import { qualityMemory, finishQuality, qualityFixture } from './quality.test-support';
import { qualityRoomId } from './qualityRecords';

it('keeps bounded reverse batches on a lazy 100,003-room floor without scanning or a manifest', async () => {
  const m = qualityMemory(), count = 100_003; m.fallback(chainRecords(count).read);
  await beginWorldFloorQuality(m.pages, 1);
  for (let i = 0; i < 32; i++) {
    m.clear(); const state = await advanceWorldFloorQuality(m.pages, 1);
    expect(state.nextRoom).toBe(count - 1 - (i + 1) * 4); expect(state.status).toBe('running');
    expect(m.reads.length).toBeLessThanOrEqual(80); expect(m.writes.length).toBe(5);
    expect(JSON.stringify(state).length).toBeLessThan(2048);
    expect(m.rows.size).toBe(2 + (i + 1) * 4);
    for (const key of m.writes) expect(JSON.stringify(m.rows.get(key)!.value).length).toBeLessThan(2048);
  }
});

it('durably fails the exact D1 chain criteria, never regenerates or resets failed work', async () => {
  const m = qualityMemory(), chain = chainRecords(13); m.fallback(chain.read);
  const state = await finishQuality(m), d1 = moduleQuality(chain.assembly());
  expect(state.metrics).toEqual({ rooms: d1.rooms, reachable: d1.reachable, joins: 12, forks: d1.forks, longestChain: d1.longestChain });
  expect(state.metrics).toMatchObject({ rooms: 13, forks: 0, longestChain: 12 }); expect(state.status).toBe('failed');
  expect(() => assertModuleQuality(chain.assembly())).toThrow('structural qualification');
  m.clear();
  await expect(beginWorldFloorQuality(m.pages, 1)).rejects.toThrow('failed structural');
  await expect(advanceWorldFloorQuality(m.pages, 1)).rejects.toThrow('failed structural');
  await expect(requireWorldFloorQuality(m.pages, 1)).rejects.toThrow('not structurally qualified');
  expect(m.writes).toEqual([]);
});

it('matches independent full-graph D1 chains over 100 deterministic ordered trees', () => {
  const base = qualityFixture(42, 25).assembly;
  for (let seed = 1; seed <= 100; seed++) {
    let random = seed;
    const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
    const children: number[][] = Array.from({ length: 25 }, () => []), joins = [];
    for (let child = 1; child < 25; child++) {
      const candidates = children.slice(0, child).map((_, i) => i).filter(i => children[i].length < (i === 0 ? 4 : 3));
      const parent = candidates[next() % candidates.length]; children[parent].push(child);
      joins.push({ id: `socket-${child - 1}`, fromRoomId: qualityRoomId(parent), toRoomId: qualityRoomId(child), direction: 'east' as const });
    }
    const nodes = new Map<number, ReturnType<typeof reduceQualityTreeNode>>();
    for (let ordinal = 24; ordinal >= 0; ordinal--) nodes.set(ordinal,
      reduceQualityTreeNode(ordinal, children[ordinal].length + Number(ordinal !== 0), children[ordinal].map(child => nodes.get(child)!)));
    const d1 = moduleQuality({ ...base, joins });
    expect(nodes.get(0)!.metrics).toEqual({ rooms: d1.rooms, reachable: d1.reachable, joins: 24, forks: d1.forks, longestChain: d1.longestChain });
  }
});
