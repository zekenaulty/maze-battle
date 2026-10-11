// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Direction } from '../../src/domain/types';
import { createTopology, expandTopology } from '../../src/domain/expedition/topology/generation';
import { connection } from '../../src/domain/expedition/topology/geometry';
import { MemoryTopology } from '../../src/domain/expedition/topology/memoryTopology';
import type { TopologyConnection, TopologyRecipe, TopologySpace } from '../../src/domain/expedition/topology/types';
import { inspectStreamedSnapshot, measureStreamed, STREAMED_LIMITS } from './streamed';

function room(id: string, row = 0, column = 0): TopologySpace {
  return { schematic: 'stone-room-v1', spec: { id, kind: 'room', name: id, seed: 0,
    origin: { row, column }, rows: 3, columns: 3, openings: [], chests: [] } };
}
function passage(id: string, row: number, column: number, rows = 1, columns = 1): TopologySpace {
  const result = room(id, row, column);
  Object.assign(result.spec, { kind: 'passage', rows, columns });
  return result;
}
const start = { spaceId: 'a', row: 1, column: 1 };
function join(from: TopologySpace, to: TopologySpace, direction: Direction, id = `${from.spec.id}:${to.spec.id}`) {
  return connection(id, from.spec, to.spec, direction);
}
function chain() {
  const a = room('a');
  const p = passage('p', 1, 3);
  const b = room('b', 0, 4);
  const q = passage('q', 1, 7, 1, 2);
  const c = room('c', 0, 9);
  return { spaces: [a, p, b, q, c], links: [join(a, p, 'east'), join(p, b, 'east'), join(b, q, 'east'), join(q, c, 'east')] };
}

describe('D0 streamed snapshot measurements', () => {
  it('measures a singleton without inventing branches or socket utilization', () => {
    const value = inspectStreamedSnapshot([room('a')], [], start);
    expect(value.roomGraph).toMatchObject({ nodes: 1, edges: 0, degrees: { a: 0 }, isolated: 1,
      endpoints: 0, forks: 0, loops: 0, components: 1, diameter: 0, branchDepths: {}, maxBranchDepth: null });
    expect(value.roomFootprint).toMatchObject({ unionArea: 9, boundingArea: 9, coverage: 1 });
    expect(value.passageFootprint).toMatchObject({ bounds: null, unionArea: 0, coverage: null, lengthCells: 0, internalSteps: 0 });
    expect(value.physicalTraversal).toMatchObject({ walkableCells: 9, reachedCells: 9, valid: true });
  });

  it('collapses passages only for the graph and exports every global doorway once', () => {
    const fixture = chain();
    const before = structuredClone(fixture);
    const value = inspectStreamedSnapshot(fixture.spaces, fixture.links, start);
    expect(fixture).toEqual(before);
    expect(value.roomGraph).toMatchObject({ nodes: 3, edges: 2, degrees: { a: 1, b: 2, c: 1 },
      degreeHistogram: { 1: 2, 2: 1 }, endpoints: 2, forks: 0, loops: 0, components: 1, diameter: 2,
      depthsFromEntry: { a: 0, b: 1, c: 2 }, branchDepths: { c: 2 }, maxBranchDepth: 2 });
    expect(value.geometry.connections).toEqual([
      { from: 'a', to: 'p', fromDoor: { row: 1, column: 2 }, toDoor: { row: 1, column: 3 } },
      { from: 'p', to: 'b', fromDoor: { row: 1, column: 3 }, toDoor: { row: 1, column: 4 } },
      { from: 'b', to: 'q', fromDoor: { row: 1, column: 6 }, toDoor: { row: 1, column: 7 } },
      { from: 'q', to: 'c', fromDoor: { row: 1, column: 8 }, toDoor: { row: 1, column: 9 } },
    ]);
    expect(value.roomFootprint).toEqual({ bounds: { row: 0, column: 0, rows: 3, columns: 12 },
      summedArea: 27, unionArea: 27, boundingArea: 36, coverage: 0.75 });
    expect(value.passageFootprint).toMatchObject({ summedArea: 3, unionArea: 3, lengthCells: 3, internalSteps: 1 });
    expect(value.validation).toMatchObject({ overlapComparisons: 10, overlapPairs: 0, connectorsValid: true, invalidLocalLinks: 0 });
    expect(value.physicalTraversal).toEqual({ walkableCells: 30, reachedCells: 30, unreachableCells: 0,
      reachableRooms: 3, allRoomsReachable: true, allCellsReachable: true, valid: true });
  });

  it('contracts an entire degree-two passage chain into one room edge', () => {
    const a = room('a');
    const p = passage('p', 1, 3);
    const q = passage('q', 1, 4);
    const b = room('b', 0, 5);
    const value = inspectStreamedSnapshot([a, p, q, b], [join(a, p, 'east'), join(p, q, 'east'), join(q, b, 'east')], start);
    expect(value.roomGraph).toMatchObject({ nodes: 2, edges: 1, diameter: 1, loops: 0 });
    expect(value.geometry.connections).toHaveLength(3);
    expect(value.physicalTraversal?.valid).toBe(true);
  });

  it('measures a real T fork and entry-rooted endpoint depths', () => {
    const a = room('a', 4, 4);
    const b = room('b', 0, 4);
    const c = room('c', 4, 8);
    const d = room('d', 8, 4);
    const p = passage('p', 3, 5);
    const q = passage('q', 5, 7);
    const r = passage('r', 7, 5);
    const links = [join(a, p, 'north'), join(p, b, 'north'), join(a, q, 'east'), join(q, c, 'east'), join(a, r, 'south'), join(r, d, 'south')];
    const value = inspectStreamedSnapshot([a, b, c, d, p, q, r], links, start);
    expect(value.roomGraph).toMatchObject({ degrees: { a: 3, b: 1, c: 1, d: 1 }, forks: 1, endpoints: 3,
      diameter: 2, loops: 0, branchDepths: { b: 1, c: 1, d: 1 } });
    expect(value.physicalTraversal?.valid).toBe(true);
  });

  it('measures one cycle without confusing passage nodes with rooms', () => {
    const a = room('a');
    const b = room('b', 0, 4);
    const c = room('c', 4, 4);
    const d = room('d', 4, 0);
    const p = passage('p', 1, 3);
    const q = passage('q', 3, 5);
    const r = passage('r', 5, 3);
    const s = passage('s', 3, 1);
    const links = [join(a, p, 'east'), join(p, b, 'east'), join(b, q, 'south'), join(q, c, 'south'),
      join(c, r, 'west'), join(r, d, 'west'), join(d, s, 'north'), join(s, a, 'north')];
    const value = inspectStreamedSnapshot([a, b, c, d, p, q, r, s], links, start);
    expect(value.roomGraph).toMatchObject({ nodes: 4, edges: 4, degrees: { a: 2, b: 2, c: 2, d: 2 },
      forks: 0, endpoints: 0, loops: 1, components: 1, diameter: 2 });
    expect(value.physicalTraversal?.valid).toBe(true);
  });

  it('reports disconnected diameter and unreachable depths as null, with physical failure', () => {
    const fixture = chain();
    fixture.spaces.push(room('isolated', -10, -10));
    const value = inspectStreamedSnapshot(fixture.spaces, fixture.links, start);
    expect(value.roomGraph).toMatchObject({ nodes: 4, edges: 2, components: 2, componentDiameters: [2, 0],
      diameter: null, loops: 0, depthsFromEntry: { a: 0, b: 1, c: 2, isolated: null } });
    expect(value.physicalTraversal).toMatchObject({ allRoomsReachable: false, unreachableCells: 9, valid: false });
  });

  it('retains parallel logical edges when computing cycle rank', () => {
    const a = room('a');
    const b = room('b', 0, 3);
    const first = join(a, b, 'east', 'first');
    const second = join(a, b, 'east', 'second');
    // Deliberately duplicate physical ports: graph multiplicity must not hide the invalid connectors.
    const value = inspectStreamedSnapshot([a, b], [first, second], start);
    expect(value.roomGraph).toMatchObject({ nodes: 2, edges: 2, degrees: { a: 2, b: 2 }, loops: 1, diameter: 1 });
    expect(value.validation.connectorsValid).toBe(false);
    expect(value.physicalTraversal).toBeNull();
  });

  it('leaves passage length null when a footprint is not a straight one-cell-wide corridor', () => {
    const value = inspectStreamedSnapshot([room('a'), passage('wide', 10, 10, 2, 2)], [], start);
    expect(value.passageFootprint).toMatchObject({ unionArea: 4, lengthCells: null, internalSteps: null });
  });

  it('does not treat adjacent floor cells as an uncommitted doorway', () => {
    const value = inspectStreamedSnapshot([room('a'), room('b', 0, 3)], [], start);
    expect(value.validation.nonOverlapping).toBe(true);
    expect(value.geometry.connections).toEqual([]);
    expect(value.physicalTraversal).toMatchObject({ reachedCells: 9, unreachableCells: 9, valid: false });
  });

  it('counts rectangle union coverage correctly even for invalid overlapping spaces', () => {
    const value = inspectStreamedSnapshot([room('a'), room('b', 1, 1)], [], start);
    expect(value.roomFootprint).toMatchObject({ summedArea: 18, unionArea: 14, boundingArea: 16, coverage: 14 / 16 });
    expect(value.validation).toMatchObject({ overlapPairs: 1, overlapComparisons: 1, nonOverlapping: false });
    expect(value.physicalTraversal?.valid).toBe(false);
  });

  it('detects nonadjacent connectors rather than traversing the abstract graph', () => {
    const fixture = chain();
    fixture.spaces.find(value => value.spec.id === 'c')!.spec.origin.column++;
    const value = inspectStreamedSnapshot(fixture.spaces, fixture.links, start);
    expect(value.roomGraph?.components).toBe(1);
    expect(value.validation).toMatchObject({ invalidConnectors: 1, connectorsValid: false });
    expect(value.physicalTraversal).toMatchObject({ reachableRooms: 2, unreachableCells: 9, valid: false });
  });

  it('leaves an ambiguous passage graph and invalid schematic traversal unmeasured', () => {
    const a = room('a');
    const b = room('b', 0, 4);
    const p = passage('p', 1, 3);
    const links: TopologyConnection[] = [join(a, p, 'east')];
    const value = inspectStreamedSnapshot([a, b, p], links, start);
    expect(value.roomGraph).toBeNull();
    links[0].from.row = 8;
    const invalid = inspectStreamedSnapshot([a, b, p], links, start);
    expect(invalid.validation.schematicErrorCount).toBeGreaterThan(0);
    expect(invalid.physicalTraversal).toBeNull();
  });
});

describe('D0 real spaces-v2 generation', () => {
  it('materializes more than eight rooms with real sockets, passages and schematics', () => {
    const value = measureStreamed(0, 2);
    expect(value.status).toBe('complete');
    expect(value.metrics).toMatchObject({ requestedRooms: 10, materializedRooms: 10, materializedPassages: 9,
      sealReason: 'budget', limitReason: null, iterations: 9, revision: 9,
      sockets: { total: 9, linked: 9, pending: 0, utilization: 1 } });
    expect(value.metrics.roomGraph).toMatchObject({ nodes: 10, edges: 9, components: 1, loops: 0 });
    expect(value.geometry.connections).toHaveLength(18);
    expect(value.geometry.rooms.some(room => room.row < 0 || room.column < 0)).toBe(true);
    expect(value.metrics.validation).toMatchObject({ overlapPairs: 0, connectorsValid: true, schematicErrorCount: 0 });
    expect(value.metrics.physicalTraversal?.valid).toBe(true);
    expect(value.metrics.physicalTraversal!.walkableCells)
      .toBeLessThan(value.metrics.roomFootprint!.summedArea + value.metrics.passageFootprint!.summedArea);
    expect(value.metrics.work!.canonicalProposal).toEqual({ generationCalls: 10, candidates: 19,
      occupancyQueryBudget: 47, emptyReaderQueries: 4, index: { queries: 32, bucketReads: 55, entryChecks: 73 } });
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  it('is deterministic across repeated multiroom samples', () => {
    expect(measureStreamed(440, 19, 24)).toEqual(measureStreamed(440, 19, 24));
  });

  it('stops at the room cap without inventing a seal or linking pending sockets', () => {
    const value = measureStreamed(0, 19, 4);
    expect(value.status).toBe('limited');
    expect(value.metrics).toMatchObject({ requestedRooms: 44, materializedRooms: 4, materializedPassages: 3,
      sealReason: null, limitReason: 'room-cap', iterations: 3 });
    expect(value.geometry.rooms).toHaveLength(4);
    expect(value.geometry.passages).toHaveLength(3);
    expect(value.geometry.connections).toHaveLength(6);
    expect(value.metrics.sockets!.pending).toBeGreaterThan(0);
    expect(value.metrics.sockets!.linked).toBe(3);
    expect(value.metrics.sockets!.utilization).toBe(3 / value.metrics.sockets!.total);
    expect(value.metrics.physicalTraversal?.valid).toBe(true);
  });

  it('reports a natural seal at the exact cap as complete', () => {
    expect(measureStreamed(0, 1, 8)).toMatchObject({ status: 'complete', metrics: { materializedRooms: 8,
      sealReason: 'budget', limitReason: null } });
  });

  it('counts initialization, canonical proposal, revalidation, and insertion separately', () => {
    const recipe: TopologyRecipe = { version: 'spaces-v2', worldId: 'd0-diagnostics', floorId: 'one', seed: 0, level: 19 };
    const initial = createTopology(recipe);
    const host = new MemoryTopology(recipe);
    const initialIndex = host.occupancy.work;
    const proposal = expandTopology(host, 0, 'd0-0');
    if (proposal.status !== 'ready') throw new Error('Fixture must expand');
    const afterProposal = host.occupancy.work;
    host.commit(proposal.delta);
    const totalIndex = host.occupancy.work;
    const value = measureStreamed(0, 19, 2);
    const work = value.metrics.work!;
    expect(work.canonicalProposal).toMatchObject({ generationCalls: 2, candidates: proposal.delta.work.candidates,
      occupancyQueryBudget: initial.work.occupancyQueries + proposal.delta.work.occupancyQueries,
      emptyReaderQueries: initial.work.occupancyQueries });
    expect(work.commitRevalidation).toEqual(work.canonicalProposal);
    expect(work.totalIndex).toEqual(totalIndex);
    for (const key of ['queries', 'bucketReads', 'entryChecks'] as const) {
      expect(work.canonicalProposal.index[key]).toBe(afterProposal[key] - initialIndex[key]);
      expect(work.totalIndex[key]).toBe(work.canonicalProposal.index[key] + work.commitRevalidation.index[key] + work.commitInsertion[key]);
    }
    expect(work.canonicalProposal.index.queries).toBeLessThanOrEqual(proposal.delta.work.occupancyQueries);
    expect(work.localReservationOverlapComparisons).toBeNull();
    const rootOnly = measureStreamed(0, 19, 1);
    expect(rootOnly.metrics.work!.canonicalProposal.index).toEqual({ queries: 0, bucketReads: 0, entryChecks: 0 });
    expect(rootOnly.metrics.work!.commitInsertion).toEqual(initialIndex);
    expect(rootOnly.metrics.iterations).toBe(0);
  });

  it('enforces its hard room cap even for a much larger requested sample', () => {
    const value = measureStreamed(0, 1000, 100000);
    expect(value.status).toBe('limited');
    expect(value.metrics).toMatchObject({ materializedRooms: STREAMED_LIMITS.rooms, limitReason: 'room-cap',
      limits: { requestedMaxRooms: 100000, effectiveMaxRooms: STREAMED_LIMITS.rooms } });
    expect(value.metrics.iterations).toBeLessThanOrEqual(STREAMED_LIMITS.iterations);
    expect(value.metrics.physicalTraversal?.valid).toBe(true);
  }, 15000);

  it.each([
    [-1, 1, 4], [0, 0, 4], [0, Number.MAX_SAFE_INTEGER, 4], [0, 1, 0], [0, 1, 1.5],
    [NaN, 1, 4], [0, Infinity, 4], [0, 1, Infinity],
  ])('returns serializable errors for invalid seed/level/cap %s/%s/%s', (seed, level, cap) => {
    const value = measureStreamed(seed, level, cap);
    expect(value.status).toBe('error');
    expect(value.metrics.error).toBeTruthy();
    expect(value.metrics.materializedRooms).toBeNull();
    expect(value.metrics.roomGraph).toBeNull();
    expect(value.metrics.work).toBeNull();
    expect(value.geometry).toEqual({ rooms: [], passages: [], connections: [] });
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
});
