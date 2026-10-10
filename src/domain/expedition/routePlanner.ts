import { addressKey, sameAddress } from './address';
import { copyAddress, isAddress, isRecord } from './explorationGraph';
import { emptyRouteWork, RouteKnowledge, type RouteKnowledgeChanges, type RoutePlannerWork } from './routeKnowledge';
import { LocalRouteCache, planObservedRoute, type RouteBatch, type RouteSearchLimits, type RouteStep } from './routeSearch';
import type { CellAddress, ExpeditionCheckpoint, ExplorationDecision } from './types';

export type { RouteKnowledgeChanges, RoutePlannerWork } from './routeKnowledge';

export interface ObservedRoutePlannerLimits extends RouteSearchLimits { maxKnownRecords: number }
export interface ObservedRouteContext {
  sessionId: string;
  epoch: number;
  changes?: RouteKnowledgeChanges;
}

const defaults: ObservedRoutePlannerLimits = {
  maxKnownRecords: 32768, maxBatchSteps: 128, maxCachedSearchCells: 8192,
  maxCachedSearches: 8, maxPlanningVisits: 65536, maxPortStates: 512,
};

interface Previous {
  revision: number;
  position: CellAddress;
  phase: ExpeditionCheckpoint['phase'];
  moves: number;
}

/**
 * One instance per runtime/control owner. This cache is disposable, never a receipt
 * or authority source. Execute at most the returned command through the host boundary,
 * then supply its checkpoint. A repeated/unconfirmed command blocks until reconciled
 * or explicitly reset. Recreating the class after reload safely replans from knowledge.
 *
 * Ordinary calls audit all known records (including in-place edits). A complete host
 * change set avoids that scan on consecutive revisions. Semantic edits conservatively
 * rebuild the bounded graph and invalidate all searches/batches; timestamps do not.
 * The pure chooseExplorationDecision remains an independent, explicit fallback.
 */
export class ObservedRoutePlanner {
  private readonly limits: ObservedRoutePlannerLimits;
  private readonly knowledge = new RouteKnowledge();
  private readonly local = new LocalRouteCache();
  private total = emptyRouteWork();
  private last = emptyRouteWork();
  private owner?: { sessionId: string; epoch: number; identity: string };
  private previous?: Previous;
  private batch?: RouteBatch;
  private cursor = 0;
  private pending?: RouteStep;

  constructor(limits: Partial<ObservedRoutePlannerLimits> = {}) {
    this.limits = { ...defaults, ...limits };
    if (Object.values(this.limits).some(value => !Number.isSafeInteger(value) || value < 1)) {
      throw new Error('Route planner limits must be positive safe integers.');
    }
  }

  get diagnostics() {
    return { work: { ...this.total }, lastWork: { ...this.last },
      cache: { knowledgeRecords: this.knowledge.recordCount, localSearches: this.local.size,
        localSearchCells: this.local.cellCount, batchSteps: this.batch ? this.batch.steps.length - this.cursor : 0 },
      target: this.batch && copyAddress(this.batch.target) };
  }

  /** Explicit host reconciliation/takeover, not an automatic retry of an uncertain effect. */
  reset() {
    this.clear();
    this.owner = undefined;
  }

  choose(checkpoint: ExpeditionCheckpoint, context: ObservedRouteContext): ExplorationDecision {
    this.last = emptyRouteWork();
    try {
      return this.decide(checkpoint, context);
    } catch (error) {
      this.clear();
      return { reason: `Blocked: ${error instanceof Error ? error.message : 'Invalid route input.'}` };
    } finally {
      for (const key of Object.keys(this.total) as (keyof RoutePlannerWork)[]) this.total[key] += this.last[key];
    }
  }

  private clear() {
    this.knowledge.clear();
    this.local.clear();
    this.batch = undefined;
    this.cursor = 0;
    this.previous = undefined;
    this.pending = undefined;
  }

  private invalidate() {
    if (this.batch || this.local.size) this.last.invalidations++;
    this.batch = undefined;
    this.cursor = 0;
    this.pending = undefined;
  }

  private decide(checkpoint: ExpeditionCheckpoint, context: ObservedRouteContext): ExplorationDecision {
    if (!isRecord(checkpoint) || checkpoint.version !== 1 || !isAddress(checkpoint.position) || !isAddress(checkpoint.home)
      || !['exploring', 'returning', 'complete'].includes(checkpoint.phase)
      || !Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0
      || !Number.isSafeInteger(checkpoint.moves) || checkpoint.moves < 0
      || !Array.isArray(checkpoint.openedChestIds) || checkpoint.openedChestIds.length > this.limits.maxKnownRecords
      || ![checkpoint.worldId, checkpoint.floorId, checkpoint.scopeId].every(id => typeof id === 'string' && id.length > 0)
      || !isRecord(context) || typeof context.sessionId !== 'string' || !context.sessionId
      || !Number.isSafeInteger(context.epoch) || context.epoch < 0) throw new Error('Invalid checkpoint or control context.');
    const identity = JSON.stringify([checkpoint.worldId, checkpoint.floorId, checkpoint.scopeId, addressKey(checkpoint.home)]);
    if (this.owner?.sessionId === context.sessionId && context.epoch < this.owner.epoch) {
      return { reason: 'Blocked: stale control epoch; reconcile with the runtime owner.' };
    }
    if (!this.owner || this.owner.sessionId !== context.sessionId || this.owner.epoch !== context.epoch || this.owner.identity !== identity) {
      this.invalidate();
      this.clear();
      this.owner = { sessionId: context.sessionId, epoch: context.epoch, identity };
    }
    if (checkpoint.phase === 'complete') {
      this.clear();
      return { reason: 'Expedition already complete.' };
    }
    const previous = this.previous;
    const consecutive = previous && checkpoint.revision === previous.revision + 1;
    if (this.pending && previous) {
      const step = this.pending;
      if (checkpoint.revision === previous.revision && sameAddress(checkpoint.position, previous.position)) {
        return { reason: 'Blocked: command revision has not advanced; reconcile its outcome before retrying.' };
      }
      if (step.command.type === 'move' && sameAddress(checkpoint.position, step.from)) {
        return { reason: 'Blocked: movement made no spatial progress; reconcile or explicitly reset.' };
      }
      if (step.frontierOpeningId && !isAddress(checkpoint.knowledge?.openings?.[step.frontierOpeningId]?.destination)) {
        return { reason: 'Blocked: frontier traversal did not record its learned destination; reconcile the observation.' };
      }
      if (step.command.type === 'collect' && sameAddress(checkpoint.position, step.from)) {
        const opened = new Set(checkpoint.openedChestIds);
        if (!step.lootIds!.some(id => opened.has(id) || checkpoint.knowledge?.chests?.[id]?.opened === true)) {
          return { reason: 'Blocked: collection was not confirmed by observed chest state.' };
        }
      }
      if (step.command.type === 'finish') return { reason: 'Blocked: host has not confirmed finite-scope completion.' };
      const expectedMoves = previous.moves + Number(step.command.type === 'move');
      if (!consecutive || checkpoint.phase !== previous.phase || checkpoint.moves !== expectedMoves
        || (step.to && !sameAddress(checkpoint.position, step.to))) {
        this.invalidate();
      } else {
        this.cursor++;
        this.pending = undefined;
        if (step.command.type === 'collect') this.invalidate();
      }
    } else if (previous && (!consecutive || checkpoint.phase !== previous.phase)) this.invalidate();

    const changed = this.knowledge.sync(checkpoint, this.limits.maxKnownRecords, this.last,
      consecutive ? context.changes : undefined, previous?.revision);
    if (changed) {
      this.invalidate();
      this.local.clear();
    }
    const graph = this.knowledge.graph!;
    const key = addressKey(checkpoint.position);
    if (!graph.nodes.has(key) || !graph.nodes.has(addressKey(checkpoint.home))) throw new Error('Position or home is missing from observed cells.');
    if (this.batch && (this.cursor >= this.batch.steps.length || !sameAddress(this.batch.steps[this.cursor].from, checkpoint.position))) {
      this.batch = undefined;
      this.cursor = 0;
    }
    if (!this.batch) {
      this.batch = planObservedRoute(graph, checkpoint, this.limits, this.local, this.last);
      this.cursor = 0;
    } else this.last.reusedSteps++;
    const step = this.batch.steps[this.cursor];
    if (!step) throw new Error('No observed route step is available.');
    this.previous = { revision: checkpoint.revision, position: copyAddress(checkpoint.position), phase: checkpoint.phase, moves: checkpoint.moves };
    this.pending = step;
    return { command: { ...step.command }, target: copyAddress(this.batch.target), reason: this.batch.reason };
  }
}
