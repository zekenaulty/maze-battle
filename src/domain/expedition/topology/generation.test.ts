import { describe, expect, it } from 'vitest';
import { movePosition, opposite } from '../../maze/movement';
import { materializeSpace } from '../schematic';
import { createTopology, expandTopology } from './generation';
import { overlaps, world } from './geometry';
import { MemoryTopology } from './memoryTopology';
import { PLACEMENT_ATTEMPTS, choosePlacement } from './placement';
import { materializeTopologySpace, resolvedSpaceSpec } from './projection';
import type { TopologyDelta, TopologyRecipe } from './types';

const recipe = (seed = 1, level = 1): TopologyRecipe => ({ version: 'spaces-v2', worldId: 'test', floorId: 'one', seed, level });
function grow(store: MemoryTopology): TopologyDelta[] {
  const commits: TopologyDelta[] = [];
  for (let step = 0; step < store.header().roomBudget; step++) {
    const proposal = expandTopology(store, store.header().revision, `expand-${step}`);
    if (proposal.status === 'sealed') return commits;
    if (proposal.status !== 'ready') throw new Error('Unexpected conflict');
    expect(proposal.delta.work.candidates).toBeLessThanOrEqual(PLACEMENT_ATTEMPTS);
    expect(proposal.delta.work.occupancyQueries).toBeLessThanOrEqual(20);
    expect(proposal.delta.spaces.length).toBe(2);
    store.commit(proposal.delta);
    commits.push(proposal.delta);
  }
  throw new Error('Scope did not seal within its room quota');
}

describe('incremental reserved room topology', () => {
  it.each([1, 19, 80].flatMap(level => Array.from({ length: 12 }, (_, seed) => ({ level, seed }))))
    ('keeps seed $seed / level $level connected, bounded and spatially disjoint', ({ level, seed }) => {
      const store = new MemoryTopology(recipe(seed, level));
      const initial = structuredClone(store.space('entry'));
      grow(store);
      const header = store.header();
      expect(header.seal?.revision).toBe(header.revision);
      expect(header.rooms).toBeLessThanOrEqual(header.roomBudget);
      expect(header.rooms).toBeGreaterThanOrEqual(5);
      expect(header.nextSocket).toBe(header.socketCount);
      expect(store.space('entry')).toEqual(initial);
      const occupancy = store.occupancy.values();
      expect(occupancy.every(value => value.kind === 'space')).toBe(true);
      for (let i = 0; i < occupancy.length; i++) for (let j = i + 1; j < occupancy.length; j++) expect(overlaps(occupancy[i].bounds, occupancy[j].bounds)).toBe(false);
      const seen = new Set(['entry']);
      const queue = ['entry'];
      for (const id of queue) {
        const value = store.space(id)!;
        const spec = resolvedSpaceSpec(value, store.connections(id));
        expect(spec.rows * spec.columns).toBeLessThanOrEqual(512);
        const geometry = materializeTopologySpace(value);
        expect(materializeSpace(spec)).toEqual(geometry);
        expect(spec.kind === 'passage' || id === 'entry' || spec.chests.length === 1).toBe(true);
        for (const port of spec.openings) {
          const target = resolvedSpaceSpec(store.space(port.destination.spaceId)!, store.connections(port.destination.spaceId));
          expect(movePosition(world(spec, port.cell), port.direction)).toEqual(world(target, port.destination));
          expect(target.openings.some(other => other.direction === opposite(port.direction) && other.destination.spaceId === id
            && other.cell.row === port.destination.row && other.cell.column === port.destination.column
            && other.destination.row === port.cell.row && other.destination.column === port.cell.column)).toBe(true);
          if (!seen.has(target.id)) { seen.add(target.id); queue.push(target.id); }
        }
      }
      expect(seen.size).toBe(store.spaceIds().length);
    });

  it('has no open doorway to a merely reserved room', () => {
    const store = new MemoryTopology(recipe());
    expect(store.header().socketCount).toBeGreaterThan(0);
    expect(resolvedSpaceSpec(store.space('entry')!, store.connections('entry')).openings).toEqual([]);
    expect(store.spaceIds()).toEqual(['entry']);
  });

  it('uses its guaranteed connected fallback when every larger candidate is rejected', () => {
    const store = new MemoryTopology(recipe());
    const socket = store.socket(0)!;
    const work = { candidates: 0, occupancyQueries: 0 };
    const result = choosePlacement({ header: () => store.header(), space: id => store.space(id), socket: n => store.socket(n), occupied: () => true }, store.space('entry')!.spec, socket, work);
    expect(result).toEqual(socket.fallback);
    expect(work.candidates).toBe(PLACEMENT_ATTEMPTS);
    expect(store.occupied(result, socket.id)).toBe(false);
  });

  it('does not let visibility/prefetch order choose placement or random content', () => {
    const first = new MemoryTopology(recipe(440, 19));
    const second = new MemoryTopology(recipe(440, 19));
    const commits = grow(first);
    for (const commit of commits) {
      for (const id of second.spaceIds().reverse()) materializeTopologySpace(second.space(id)!);
      const proposal = expandTopology(second, second.header().revision, commit.requestId);
      expect(proposal).toEqual({ status: 'ready', delta: commit });
      second.commit(commit);
    }
    expect(second.header()).toEqual(first.header());
    expect(second.occupancy.values()).toEqual(first.occupancy.values());
  });

  it('reconciles duplicate commits, rejects changed reuse and races without partial writes', () => {
    const store = new MemoryTopology(recipe());
    const proposal = expandTopology(store, 0, 'one');
    if (proposal.status !== 'ready') throw new Error('Expected proposal');
    expect(store.header().revision).toBe(0);
    const raced = { ...proposal.delta, requestId: 'two' };
    expect(store.commit(proposal.delta)).toEqual({ status: 'applied', revision: 1 });
    expect(store.commit(proposal.delta)).toEqual({ status: 'duplicate', revision: 1 });
    expect(store.commit(raced)).toEqual({ status: 'conflict', revision: 1 });
    expect(() => store.commit({ ...proposal.delta, connections: [] })).toThrow('reused');
    expect(store.header().revision).toBe(1);
    expect(store.spaceIds()).toHaveLength(3);
  });

  it('replays committed transactions after a simulated restart exactly', () => {
    const source = new MemoryTopology(recipe(55, 19));
    const commits = grow(source);
    const resumed = new MemoryTopology(recipe(55, 19));
    for (const commit of JSON.parse(JSON.stringify(commits)) as TopologyDelta[]) resumed.commit(commit);
    expect(resumed.header()).toEqual(source.header());
    expect(resumed.occupancy.values()).toEqual(source.occupancy.values());
  });

  it('stops at a host receipt quota without losing pending reservations', () => {
    const store = new MemoryTopology(recipe(), 1);
    const before = store.occupancy.values();
    const proposal = expandTopology(store, 0, 'one');
    if (proposal.status !== 'ready') throw new Error('Expected proposal');
    expect(() => store.commit(proposal.delta)).toThrow('budget');
    expect(store.occupancy.values()).toEqual(before);
    expect(store.header().revision).toBe(0);
  });

  it('rejects partial commits and unsupported recipes', () => {
    const store = new MemoryTopology(recipe());
    const proposal = expandTopology(store, 0, 'one');
    if (proposal.status !== 'ready') throw new Error('Expected proposal');
    expect(() => store.commit({ ...proposal.delta, connections: proposal.delta.connections.slice(0, 1) })).toThrow('Invalid topology');
    expect(store.header().revision).toBe(0);
    expect(() => createTopology({ ...recipe(), version: 'future' } as unknown as TopologyRecipe)).toThrow('Unsupported');
    expect(() => createTopology(recipe(1, Number.MAX_SAFE_INTEGER))).toThrow('arithmetic');
  });
});
