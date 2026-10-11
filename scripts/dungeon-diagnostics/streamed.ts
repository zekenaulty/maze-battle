import { movePosition, opposite } from '../../src/domain/maze/movement';
import type { Direction, GridPosition, MazeCellState } from '../../src/domain/types';
import { materializeSpace } from '../../src/domain/expedition/schematic';
import type { CellAddress, SpaceSpec } from '../../src/domain/expedition/types';
import { expandTopology } from '../../src/domain/expedition/topology/generation';
import { overlaps, spaceBounds, world } from '../../src/domain/expedition/topology/geometry';
import { MemoryTopology } from '../../src/domain/expedition/topology/memoryTopology';
import { resolvedSpaceSpec } from '../../src/domain/expedition/topology/projection';
import type {
  Bounds, TopologyConnection, TopologyDelta, TopologySpace,
} from '../../src/domain/expedition/topology/types';

export const STREAMED_LIMITS = Object.freeze({ rooms: 512, iterations: 512, cells: 512 * 1023 });

type IndexWork = { queries: number; bucketReads: number; entryChecks: number };
type ProposalWork = {
  generationCalls: number;
  candidates: number | null;
  occupancyQueryBudget: number | null;
  emptyReaderQueries: number;
  index: IndexWork;
};
type GenerationWork = {
  canonicalProposal: ProposalWork;
  commitRevalidation: ProposalWork;
  commitInsertion: IndexWork;
  totalIndex: IndexWork;
  localReservationOverlapComparisons: null;
};
export type StreamedGeometry = {
  rooms: (Bounds & { id: string; kind: 'room' | 'passage' })[];
  passages: (Bounds & { id: string; kind: 'room' | 'passage' })[];
  connections: { from: string; to: string; fromDoor: GridPosition; toDoor: GridPosition }[];
};

const indexWork = (): IndexWork => ({ queries: 0, bucketReads: 0, entryChecks: 0 });
const proposalWork = (): ProposalWork => ({
  generationCalls: 0, candidates: 0, occupancyQueryBudget: 0, emptyReaderQueries: 0, index: indexWork(),
});
function difference(after: IndexWork, before: IndexWork): IndexWork {
  return { queries: after.queries - before.queries, bucketReads: after.bucketReads - before.bucketReads,
    entryChecks: after.entryChecks - before.entryChecks };
}
function addIndex(target: IndexWork, source: IndexWork) {
  target.queries += source.queries;
  target.bucketReads += source.bucketReads;
  target.entryChecks += source.entryChecks;
}
function addProposal(target: ProposalWork, source: TopologyDelta['work']) {
  if (target.candidates !== null) target.candidates += source.candidates;
  if (target.occupancyQueryBudget !== null) target.occupancyQueryBudget += source.occupancyQueries;
}

/** Observe public reads without patching the generator or bypassing commit validation. */
class MeasuredTopology extends MemoryTopology {
  // The base constructor calls commit before subclass field initializers run.
  declare initialWork: TopologyDelta['work'];
  phase: 'canonicalProposal' | 'commitRevalidation' = 'canonicalProposal';
  readonly reads = { canonicalProposal: indexWork(), commitRevalidation: indexWork() };

  override commit(delta: TopologyDelta) {
    if (delta.expectedRevision === -1) this.initialWork = { ...delta.work };
    return super.commit(delta);
  }

  override occupied(bounds: Bounds, except?: string) {
    const before = this.occupancy.work;
    try {
      return super.occupied(bounds, except);
    } finally {
      addIndex(this.reads[this.phase], difference(this.occupancy.work, before));
    }
  }
}

function enclosingBounds(rectangles: Bounds[]): Bounds | null {
  if (!rectangles.length) return null;
  const row = Math.min(...rectangles.map(value => value.row));
  const column = Math.min(...rectangles.map(value => value.column));
  return { row, column, rows: Math.max(...rectangles.map(value => value.row + value.rows)) - row,
    columns: Math.max(...rectangles.map(value => value.column + value.columns)) - column };
}

// Sweep rectangle boundaries, not the potentially sparse world-coordinate grid.
function unionArea(rectangles: Bounds[]) {
  const rows = [...new Set(rectangles.flatMap(value => [value.row, value.row + value.rows]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 1; index < rows.length; index++) {
    const intervals = rectangles.filter(value => value.row < rows[index] && value.row + value.rows > rows[index - 1])
      .map(value => [value.column, value.column + value.columns]).sort((a, b) => a[0] - b[0]);
    let end = -Infinity;
    let width = 0;
    for (const [left, right] of intervals) {
      width += Math.max(0, right - Math.max(left, end));
      end = Math.max(end, right);
    }
    area += width * (rows[index] - rows[index - 1]);
  }
  return area;
}

function footprint(rectangles: Bounds[]) {
  const bounds = enclosingBounds(rectangles);
  const area = unionArea(rectangles);
  const boundingArea = bounds ? bounds.rows * bounds.columns : 0;
  return { bounds, summedArea: rectangles.reduce((sum, value) => sum + value.rows * value.columns, 0),
    unionArea: area, boundingArea, coverage: boundingArea ? area / boundingArea : null };
}

function distances(adjacency: Map<string, string[]>, root: string) {
  const result = new Map<string, number>();
  if (!adjacency.has(root)) return result;
  const queue = [root];
  result.set(root, 0);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const target of adjacency.get(id)!) {
      if (!result.has(target)) {
        result.set(target, result.get(id)! + 1);
        queue.push(target);
      }
    }
  }
  return result;
}

function roomGraph(spaces: TopologySpace[], links: TopologyConnection[], start: CellAddress) {
  const byId = new Map(spaces.map(value => [value.spec.id, value.spec]));
  const incident = new Map(spaces.map(value => [value.spec.id, [] as TopologyConnection[]]));
  const edges: [string, string][] = [];
  for (const link of links) {
    const from = byId.get(link.from.spaceId);
    const to = byId.get(link.to.spaceId);
    if (!from || !to) return null;
    incident.get(from.id)!.push(link);
    incident.get(to.id)!.push(link);
    if (from.kind === 'room' && to.kind === 'room') edges.push([from.id, to.id]);
  }
  const seenPassages = new Set<string>();
  for (const { spec } of spaces) {
    if (spec.kind !== 'passage' || seenPassages.has(spec.id)) continue;
    const queue = [spec.id];
    const endpoints: string[] = [];
    seenPassages.add(spec.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      // A branching, dangling or closed passage component has no unambiguous room edge.
      if (incident.get(id)!.length !== 2) return null;
      for (const link of incident.get(id)!) {
        const target = link.from.spaceId === id ? link.to.spaceId : link.from.spaceId;
        if (byId.get(target)!.kind === 'room') endpoints.push(target);
        else if (!seenPassages.has(target)) { seenPassages.add(target); queue.push(target); }
      }
    }
    if (endpoints.length !== 2) return null;
    edges.push([endpoints[0], endpoints[1]]);
  }
  const rooms = spaces.filter(value => value.spec.kind === 'room').map(value => value.spec.id);
  if (!rooms.length) return null;
  const adjacency = new Map(rooms.map(id => [id, [] as string[]]));
  for (const [from, to] of edges) {
    adjacency.get(from)!.push(to);
    adjacency.get(to)!.push(from);
  }
  const degrees = Object.fromEntries(rooms.map(id => [id, adjacency.get(id)!.length]));
  const degreeHistogram: Record<string, number> = {};
  for (const degree of Object.values(degrees)) degreeHistogram[degree] = (degreeHistogram[degree] ?? 0) + 1;
  const visited = new Set<string>();
  const componentDiameters: number[] = [];
  for (const id of rooms) {
    if (visited.has(id)) continue;
    const component = [...distances(adjacency, id).keys()];
    let diameter = 0;
    for (const root of component) {
      visited.add(root);
      diameter = Math.max(diameter, ...distances(adjacency, root).values());
    }
    componentDiameters.push(diameter);
  }
  const depths = distances(adjacency, start.spaceId);
  const branchDepths = Object.fromEntries(rooms.filter(id => id !== start.spaceId && degrees[id] === 1)
    .map(id => [id, depths.get(id) ?? null]));
  const reachableBranches = Object.values(branchDepths).filter((value): value is number => value !== null);
  return {
    nodes: rooms.length, edges: edges.length, degrees, degreeHistogram,
    forks: Object.values(degrees).filter(degree => degree >= 3).length,
    endpoints: Object.values(degrees).filter(degree => degree === 1).length,
    isolated: Object.values(degrees).filter(degree => degree === 0).length,
    loops: edges.length - rooms.length + componentDiameters.length,
    components: componentDiameters.length, componentDiameters,
    diameter: componentDiameters.length === 1 ? componentDiameters[0] : null,
    depthsFromEntry: Object.fromEntries(rooms.map(id => [id, depths.get(id) ?? null])),
    branchDepths, maxBranchDepth: reachableBranches.length ? Math.max(...reachableBranches) : null,
  };
}

const cellKey = (cell: GridPosition) => `${cell.row},${cell.column}`;
const addressKey = (cell: CellAddress) => JSON.stringify([cell.spaceId, cell.row, cell.column]);
const sameCell = (a: GridPosition, b: GridPosition) => a.row === b.row && a.column === b.column;
function onBoundary(spec: SpaceSpec, cell: GridPosition, direction: Direction) {
  if (!Number.isInteger(cell.row) || !Number.isInteger(cell.column) || cell.row < 0 || cell.column < 0
    || cell.row >= spec.rows || cell.column >= spec.columns) return false;
  return direction === 'north' ? cell.row === 0 : direction === 'south' ? cell.row === spec.rows - 1
    : direction === 'west' ? cell.column === 0 : cell.column === spec.columns - 1;
}

/** Bounded snapshot inspection, also used for deterministic tiny-topology tests. */
export function inspectStreamedSnapshot(spaces: TopologySpace[], links: TopologyConnection[], start: CellAddress) {
  if (spaces.length > 2 * STREAMED_LIMITS.rooms - 1 || links.length > 4 * STREAMED_LIMITS.rooms
    || spaces.filter(value => value.spec.kind === 'room').length > STREAMED_LIMITS.rooms) {
    throw new Error('Snapshot exceeds diagnostic limits');
  }
  const byId = new Map(spaces.map(value => [value.spec.id, value.spec]));
  if (byId.size !== spaces.length || new Set(links.map(value => value.id)).size !== links.length) {
    throw new Error('Duplicate snapshot identity');
  }
  const incident = new Map(spaces.map(value => [value.spec.id, [] as TopologyConnection[]]));
  for (const link of links) {
    incident.get(link.from.spaceId)?.push(link);
    incident.get(link.to.spaceId)?.push(link);
  }
  const geometry: StreamedGeometry = { rooms: [], passages: [], connections: [] };
  const floors = new Map<string, Map<string, MazeCellState>>();
  const schematicErrors: { id: string; error: string }[] = [];
  let walkableCells = 0;
  for (const value of spaces) {
    const spec = value.spec;
    const bounds = spaceBounds(spec);
    if (![bounds.row, bounds.column, bounds.rows, bounds.columns, bounds.row + bounds.rows, bounds.column + bounds.columns]
      .every(Number.isSafeInteger) || bounds.rows < 1 || bounds.columns < 1 || bounds.rows * bounds.columns > 512) {
      throw new Error('Invalid or unbounded snapshot footprint');
    }
    geometry[spec.kind === 'room' ? 'rooms' : 'passages'].push({ id: spec.id, kind: spec.kind, ...bounds });
    try {
      if (value.schematic !== 'stone-room-v1') throw new Error('Unsupported schematic');
      const materialized = materializeSpace(resolvedSpaceSpec(value, incident.get(spec.id)!));
      floors.set(spec.id, new Map(materialized.cells.map(cell => [cellKey(cell), cell])));
      walkableCells += materialized.cells.length;
      if (walkableCells > STREAMED_LIMITS.cells) throw new Error('Physical traversal cell limit');
    } catch (error) {
      schematicErrors.push({ id: spec.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  let overlapPairs = 0;
  let overlapComparisons = 0;
  const bounds = [...geometry.rooms, ...geometry.passages];
  for (let first = 0; first < bounds.length; first++) {
    for (let second = first + 1; second < bounds.length; second++) {
      overlapComparisons++;
      if (overlaps(bounds[first], bounds[second])) overlapPairs++;
    }
  }
  let invalidConnectors = 0;
  const doors = new Map<string, CellAddress[]>();
  const usedPorts = new Set<string>();
  const addDoor = (from: CellAddress, to: CellAddress) => {
    const key = addressKey(from);
    doors.set(key, [...(doors.get(key) ?? []), to]);
  };
  for (const link of links) {
    const from = byId.get(link.from.spaceId);
    const to = byId.get(link.to.spaceId);
    if (!from || !to) { invalidConnectors++; continue; }
    const fromDoor = world(from, link.from);
    const toDoor = world(to, link.to);
    geometry.connections.push({ from: from.id, to: to.id, fromDoor, toDoor });
    const fromPort = `${addressKey(link.from)}:${link.direction}`;
    const toPort = `${addressKey(link.to)}:${opposite(link.direction)}`;
    const valid = from.id !== to.id && onBoundary(from, link.from, link.direction)
      && onBoundary(to, link.to, opposite(link.direction)) && sameCell(movePosition(fromDoor, link.direction), toDoor)
      && floors.get(from.id)?.has(cellKey(link.from)) && floors.get(to.id)?.has(cellKey(link.to))
      && !usedPorts.has(fromPort) && !usedPorts.has(toPort);
    usedPorts.add(fromPort);
    usedPorts.add(toPort);
    if (!valid) { invalidConnectors++; continue; }
    addDoor(link.from, link.to);
    addDoor(link.to, link.from);
  }
  let invalidLocalLinks = 0;
  for (const floor of floors.values()) {
    for (const cell of floor.values()) {
      for (const direction of cell.links) {
        if (!floor.get(cellKey(movePosition(cell, direction)))?.links.includes(opposite(direction))) invalidLocalLinks++;
      }
    }
  }
  let physicalTraversal: {
    walkableCells: number; reachedCells: number; unreachableCells: number; reachableRooms: number;
    allRoomsReachable: boolean; allCellsReachable: boolean; valid: boolean;
  } | null = null;
  if (!schematicErrors.length) {
    const queue: CellAddress[] = [];
    const seen = new Set<string>();
    const reachedSpaces = new Set<string>();
    const enqueue = (cell: CellAddress) => {
      const key = addressKey(cell);
      if (seen.has(key) || !floors.get(cell.spaceId)?.has(cellKey(cell))) return;
      seen.add(key);
      reachedSpaces.add(cell.spaceId);
      queue.push(cell);
    };
    enqueue(start);
    for (let index = 0; index < queue.length && index < STREAMED_LIMITS.cells; index++) {
      const address = queue[index];
      const floor = floors.get(address.spaceId)!;
      for (const direction of floor.get(cellKey(address))!.links) {
        const target = movePosition(address, direction);
        if (floor.get(cellKey(target))?.links.includes(opposite(direction))) enqueue({ spaceId: address.spaceId, ...target });
      }
      for (const target of doors.get(addressKey(address)) ?? []) enqueue(target);
    }
    const reachableRooms = geometry.rooms.filter(room => reachedSpaces.has(room.id)).length;
    physicalTraversal = { walkableCells, reachedCells: seen.size, unreachableCells: walkableCells - seen.size,
      reachableRooms, allRoomsReachable: reachableRooms === geometry.rooms.length,
      allCellsReachable: seen.size === walkableCells,
      valid: seen.size > 0 && seen.size === walkableCells && invalidConnectors === 0 && invalidLocalLinks === 0 && overlapPairs === 0 };
  }
  const straightPassages = geometry.passages.every(value => Math.min(value.rows, value.columns) === 1);
  return {
    geometry,
    roomGraph: roomGraph(spaces, links, start),
    roomFootprint: footprint(geometry.rooms),
    passageFootprint: { ...footprint(geometry.passages),
      lengthCells: straightPassages ? geometry.passages.reduce((sum, value) => sum + Math.max(value.rows, value.columns), 0) : null,
      internalSteps: straightPassages ? geometry.passages.reduce((sum, value) => sum + Math.max(value.rows, value.columns) - 1, 0) : null },
    spaceBounds: enclosingBounds(bounds),
    validation: { overlapPairs, overlapComparisons, nonOverlapping: overlapPairs === 0,
      invalidConnectors, connectorsValid: invalidConnectors === 0, invalidLocalLinks,
      schematicErrorCount: schematicErrors.length, schematicErrors: schematicErrors.slice(0, 16) },
    physicalTraversal,
  };
}

type Inspection = ReturnType<typeof inspectStreamedSnapshot>;
export type StreamedMeasurement = {
  seed: number | null;
  level: number | null;
  version: 'spaces-v2';
  status: 'complete' | 'limited' | 'error';
  metrics: {
    requestedRooms: number | null;
    materializedRooms: number | null;
    materializedPassages: number | null;
    sealReason: 'budget' | 'spatial-limit' | null;
    limitReason: 'room-cap' | 'iteration-cap' | null;
    limits: { requestedMaxRooms: number | null; effectiveMaxRooms: number | null; maxIterations: number; maxCells: number };
    iterations: number;
    revision: number | null;
    sockets: { total: number; linked: number; pending: number; utilization: number | null } | null;
    roomGraph: Inspection['roomGraph'];
    roomFootprint: Inspection['roomFootprint'] | null;
    passageFootprint: Inspection['passageFootprint'] | null;
    spaceBounds: Bounds | null;
    validation: Inspection['validation'] | null;
    physicalTraversal: Inspection['physicalTraversal'];
    work: GenerationWork | null;
    error: string | null;
    notes: string[];
  };
  geometry: StreamedGeometry;
};

/** D0 only: generates an isolated in-memory sample, never opens persistent stores or providers.
 * Complete means the real generator sealed, not that it met a quality target or was repaired.
 */
export function measureStreamed(seed: number, level: number, maxRooms = 512): StreamedMeasurement {
  const result: StreamedMeasurement = {
    seed: Number.isFinite(seed) ? seed : null, level: Number.isFinite(level) ? level : null,
    version: 'spaces-v2', status: 'error', geometry: { rooms: [], passages: [], connections: [] },
    metrics: {
      requestedRooms: null, materializedRooms: null, materializedPassages: null, sealReason: null, limitReason: null,
      limits: { requestedMaxRooms: Number.isFinite(maxRooms) ? maxRooms : null, effectiveMaxRooms: null,
        maxIterations: STREAMED_LIMITS.iterations, maxCells: STREAMED_LIMITS.cells },
      iterations: 0, revision: null, sockets: null, roomGraph: null, roomFootprint: null,
      passageFootprint: null, spaceBounds: null, validation: null, physicalTraversal: null, work: null, error: null,
      notes: [
        'Metrics describe only the committed prefix; pending sockets are not doorways.',
        'Room graph collapses degree-two passage chains; loops = E - V + components, retaining parallel edges.',
        'Diameter is null for disconnected graphs; branch depths are entry shortest-path distances to non-entry degree-one rooms.',
        'Footprint coverage uses rectangle union area, including schematic solids, divided by its bounding rectangle area.',
        'Passage lengthCells counts straight one-cell-wide floor cells; internalSteps excludes the two doorway crossings.',
        'occupancyQueryBudget is the generator work field, including short-circuited reads; index.queries counts actual index calls.',
        'Commit revalidation candidates/budgets are taken from successfully validated identical replay deltas; index reads are observed separately.',
        'Initialization runs createTopology once for the proposal and once for validation; emptyReaderQueries never touch the index.',
        'Index entryChecks exclude uninstrumented added.some reservation comparisons, reported as null; validation overlapComparisons are separate.',
        'Physical traversal follows reciprocal schematic links and valid committed doors, not mere neighboring world cells.',
        'Non-finite input echoes are null on error so JSON remains lossless; no timings, provider, persistence or live-runtime qualification.',
      ],
    },
  };
  let store: MeasuredTopology | undefined;
  let work: GenerationWork | undefined;
  try {
    if (!Number.isSafeInteger(maxRooms) || maxRooms < 1) throw new Error('maxRooms must be a positive safe integer');
    const cap = Math.min(maxRooms, STREAMED_LIMITS.rooms);
    result.metrics.limits.effectiveMaxRooms = cap;
    store = new MeasuredTopology({ version: 'spaces-v2', worldId: 'd0-diagnostics', floorId: 'one', seed, level }, cap + 1);
    work = { canonicalProposal: proposalWork(), commitRevalidation: proposalWork(),
      commitInsertion: store.occupancy.work, totalIndex: indexWork(), localReservationOverlapComparisons: null };
    for (const phase of [work.canonicalProposal, work.commitRevalidation]) {
      phase.generationCalls = 1;
      addProposal(phase, store.initialWork);
      phase.emptyReaderQueries = store.initialWork.occupancyQueries;
    }
    while (!store.header().seal && store.header().rooms < cap && result.metrics.iterations < STREAMED_LIMITS.iterations) {
      const before = store.header();
      result.metrics.iterations++;
      store.phase = 'canonicalProposal';
      work.canonicalProposal.generationCalls++;
      let proposal;
      try {
        proposal = expandTopology(store, before.revision, `d0-${before.revision}`);
      } catch (error) {
        work.canonicalProposal.candidates = null;
        work.canonicalProposal.occupancyQueryBudget = null;
        throw error;
      }
      if (proposal.status !== 'ready') throw new Error(`Unexpected proposal status: ${proposal.status}`);
      addProposal(work.canonicalProposal, proposal.delta.work);
      const beforeCommit = store.occupancy.work;
      const beforeRevalidation = { ...store.reads.commitRevalidation };
      store.phase = 'commitRevalidation';
      work.commitRevalidation.generationCalls++;
      try {
        const committed = store.commit(proposal.delta);
        if (committed.status !== 'applied') throw new Error(`Unexpected commit status: ${committed.status}`);
        addProposal(work.commitRevalidation, proposal.delta.work);
      } catch (error) {
        work.commitRevalidation.candidates = null;
        work.commitRevalidation.occupancyQueryBudget = null;
        throw error;
      } finally {
        const revalidation = difference(store.reads.commitRevalidation, beforeRevalidation);
        addIndex(work.commitInsertion, difference(difference(store.occupancy.work, beforeCommit), revalidation));
      }
      if (store.header().rooms !== before.rooms + 1 || store.header().revision !== before.revision + 1) {
        throw new Error('Expansion did not make bounded room/revision progress');
      }
    }
    const header = store.header();
    result.status = header.seal ? 'complete' : 'limited';
    result.metrics.limitReason = header.seal ? null : header.rooms >= cap ? 'room-cap' : 'iteration-cap';
  } catch (error) {
    result.metrics.error = error instanceof Error ? error.message : String(error);
  }
  if (!store) return result;
  const header = store.header();
  result.metrics.requestedRooms = header.roomBudget;
  result.metrics.revision = header.revision;
  result.metrics.sealReason = header.seal?.reason ?? null;
  let linked = 0;
  let pending = 0;
  for (let sequence = 0; sequence < header.socketCount; sequence++) {
    const socket = store.socket(sequence);
    if (socket?.status === 'linked') linked++;
    if (socket?.status === 'pending') pending++;
  }
  result.metrics.sockets = { total: header.socketCount, linked, pending,
    utilization: header.socketCount ? linked / header.socketCount : null };
  if (work) {
    work.canonicalProposal.index = { ...store.reads.canonicalProposal };
    work.commitRevalidation.index = { ...store.reads.commitRevalidation };
    work.totalIndex = store.occupancy.work;
    result.metrics.work = work;
  }
  try {
    const spaces = store.spaceIds().map(id => store!.space(id)!);
    const links = new Map<string, TopologyConnection>();
    for (const { spec } of spaces) for (const link of store.connections(spec.id)) links.set(link.id, link);
    result.metrics.materializedRooms = spaces.filter(value => value.spec.kind === 'room').length;
    result.metrics.materializedPassages = spaces.filter(value => value.spec.kind === 'passage').length;
    const { geometry, ...inspection } = inspectStreamedSnapshot(spaces, [...links.values()], header.start);
    result.geometry = geometry;
    Object.assign(result.metrics, inspection);
    if (!inspection.roomGraph) result.metrics.notes.push('Room graph is unmeasured: missing endpoints or a passage component is not a two-ended chain.');
  } catch (error) {
    result.status = 'error';
    result.metrics.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}
