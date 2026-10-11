import { expandTopology } from '../../src/domain/expedition/topology/generation';
import type { TopologyConnection } from '../../src/domain/expedition/topology/types';
import { inspectStreamedSnapshot } from './streamed-inspection';
import { STREAMED_LIMITS } from './streamed-types';
import type { GenerationWork, StreamedMeasurement } from './streamed-types';
import { addIndex, addProposal, difference, indexWork, MeasuredTopology, proposalWork } from './streamed-work';

export { inspectStreamedSnapshot } from './streamed-inspection';
export { STREAMED_LIMITS } from './streamed-types';
export type { StreamedGeometry, StreamedMeasurement } from './streamed-types';

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
