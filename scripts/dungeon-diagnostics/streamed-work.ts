import { MemoryTopology } from '../../src/domain/expedition/topology/memoryTopology';
import type { Bounds, TopologyDelta } from '../../src/domain/expedition/topology/types';
import type { IndexWork, ProposalWork } from './streamed-types';

export const indexWork = (): IndexWork => ({ queries: 0, bucketReads: 0, entryChecks: 0 });

export const proposalWork = (): ProposalWork => ({
  generationCalls: 0, candidates: 0, occupancyQueryBudget: 0, emptyReaderQueries: 0, index: indexWork(),
});

export function difference(after: IndexWork, before: IndexWork): IndexWork {
  return { queries: after.queries - before.queries, bucketReads: after.bucketReads - before.bucketReads,
    entryChecks: after.entryChecks - before.entryChecks };
}

export function addIndex(target: IndexWork, source: IndexWork) {
  target.queries += source.queries;
  target.bucketReads += source.bucketReads;
  target.entryChecks += source.entryChecks;
}

export function addProposal(target: ProposalWork, source: TopologyDelta['work']) {
  if (target.candidates !== null) target.candidates += source.candidates;
  if (target.occupancyQueryBudget !== null) target.occupancyQueryBudget += source.occupancyQueries;
}

/** Observe public reads without patching the generator or bypassing commit validation. */
export class MeasuredTopology extends MemoryTopology {
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
