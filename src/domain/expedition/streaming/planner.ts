import { opposite } from '../../maze/movement';
import { addressKey, sameAddress } from '../address';
import { copyAddress } from '../explorationGraph';
import type { CellAddress } from '../types';
import { emptyWork, readPlannerPage, STREAM_PLANNER_LIMITS, validateInput, type PlannerPage, type StreamPlannerWork } from './plannerPage';
import { planPageRoute, type PlannerStep } from './plannerRoute';
import type { StreamCheckpoint, StreamControl, StreamDecision, StreamKnowledgePage } from './types';

export { STREAM_PLANNER_LIMITS } from './plannerPage';
export type { StreamPlannerWork } from './plannerPage';

export interface StreamPlannerOptions { maxBatchSteps?: number }
interface Previous {
  revision: number;
  topologyRevision: number;
  moves: number;
  position: CellAddress;
}

/**
 * Runtime-owned, disposable room-local DFS for the current TREE generator. Only
 * supplied observations are read. Parent/completed-exit receipts live in the page,
 * not in an ancestry stack. Reload/reset safely replans from that durable page.
 *
 * Each call audits at most 512 cells, 512 chests and 4 total ports; no change-set
 * contract is required. Timestamps alone do not invalidate a batch. A plan uses at
 * most 8 bounded local BFS searches for greedy nearest-chest grouping, not a global
 * optimal tour. One page and at most maxBatchSteps commands survive between calls.
 *
 * Execute one returned command, then pass the host's confirmed checkpoint/page.
 * Repeated unconfirmed commands block; reset is explicit host reconciliation, not
 * an automatic retry. Control tokens fence this cache, not the authoritative host.
 */
export class StreamPlanner {
  private readonly maxSteps: number;
  private owner?: StreamControl & { identity: string };
  private page?: PlannerPage;
  private previous?: Previous;
  private pending?: PlannerStep;
  private batch: PlannerStep[] = [];
  private cursor = 0;
  private total = emptyWork();
  private last = emptyWork();

  constructor(options: StreamPlannerOptions = {}) {
    this.maxSteps = options.maxBatchSteps ?? STREAM_PLANNER_LIMITS.batchSteps;
    if (!Number.isSafeInteger(this.maxSteps) || this.maxSteps < 1 || this.maxSteps > STREAM_PLANNER_LIMITS.cells) {
      throw new Error('maxBatchSteps must be an integer from 1 to 512.');
    }
  }

  get diagnostics() {
    const step = this.batch[this.cursor];
    return { work: { ...this.total }, lastWork: { ...this.last }, cache: {
      pages: Number(Boolean(this.page)), cells: this.page?.cells.size ?? 0,
      ports: (this.page?.openings.length ?? 0) + (this.page?.frontiers.length ?? 0),
      chests: this.page?.chests.length ?? 0, batchSteps: this.batch.length - this.cursor,
    }, target: step && copyAddress(step.target) };
  }

  /** Drop disposable state after explicit reconciliation/reload. Work counters remain cumulative. */
  reset() {
    this.owner = undefined;
    this.page = undefined;
    this.previous = undefined;
    this.pending = undefined;
    this.batch = [];
    this.cursor = 0;
  }

  choose(checkpoint: StreamCheckpoint, knowledgePage: StreamKnowledgePage, control: StreamControl): StreamDecision {
    this.last = emptyWork();
    try {
      return this.decide(checkpoint, knowledgePage, control);
    } catch (error) {
      this.invalidate();
      this.page = undefined;
      // Keep the pending command fence even when an incoming page is malformed.
      return { reason: `Blocked: ${error instanceof Error ? error.message : 'Invalid planner input.'}` };
    } finally {
      for (const key of Object.keys(this.total) as (keyof StreamPlannerWork)[]) this.total[key] += this.last[key];
    }
  }

  private invalidate() {
    if (this.batch.length) this.last.invalidations++;
    this.batch = [];
    this.cursor = 0;
  }

  private decide(checkpoint: StreamCheckpoint, knowledgePage: StreamKnowledgePage, control: StreamControl): StreamDecision {
    validateInput(checkpoint, control);
    const identity = JSON.stringify([checkpoint.worldId, checkpoint.floorId, checkpoint.scopeId, addressKey(checkpoint.home)]);
    if (this.owner?.identity === identity && (control.epoch < this.owner.epoch
      || (control.epoch === this.owner.epoch && control.sessionId !== this.owner.sessionId))) {
      return { reason: 'Blocked: stale or competing control token; reconcile ownership.' };
    }
    if (!this.owner || this.owner.identity !== identity || this.owner.epoch !== control.epoch || this.owner.sessionId !== control.sessionId) {
      this.invalidate();
      this.reset();
      this.owner = { ...control, identity };
    }
    const previous = this.previous;
    if (previous && (checkpoint.revision < previous.revision || checkpoint.topologyRevision < previous.topologyRevision)) {
      return { reason: 'Blocked: stale checkpoint revision.' };
    }
    if (checkpoint.phase === 'complete') {
      this.invalidate();
      this.page = undefined;
      this.pending = undefined;
      return { reason: 'Expedition already complete.' };
    }
    const page = readPlannerPage(knowledgePage, checkpoint, this.last);
    if (this.page?.spaceId === page.spaceId && page.revision < this.page.revision) {
      return { reason: 'Blocked: knowledge page revision moved backwards.' };
    }
    let compatible = this.page?.structure === page.structure
      && JSON.stringify(this.page.unopened) === JSON.stringify(page.unopened);
    if (this.pending && previous) {
      const step = this.pending;
      const gameProgress = checkpoint.revision > previous.revision;
      const topologyProgress = checkpoint.topologyRevision > previous.topologyRevision;
      if (!gameProgress && !(step.kind === 'prepare' && topologyProgress)) {
        return { reason: 'Blocked: command has no confirmed revision progress; reconcile before retrying.' };
      }
      if (step.command.type === 'move' && sameAddress(checkpoint.position, previous.position)) {
        return { reason: 'Blocked: move has no spatial progress; reconcile before retrying.' };
      }
      if (step.kind === 'finish') return { reason: 'Blocked: host has not confirmed finite-scope completion.' };
      if (step.kind === 'collect' && sameAddress(checkpoint.position, step.from)) {
        if (!page.chests.some(chest => chest.id === step.objectiveId && chest.opened)) {
          return { reason: 'Blocked: observed collection has not been confirmed.' };
        }
        compatible = this.page?.structure === page.structure
          && JSON.stringify(this.page.unopened.filter(id => id !== step.objectiveId)) === JSON.stringify(page.unopened);
      }
      const expectedPosition = step.command.type === 'move'
        ? step.to ? sameAddress(checkpoint.position, step.to) : checkpoint.position.spaceId !== step.from.spaceId
        : sameAddress(checkpoint.position, step.from);
      if (step.kind === 'exit' && expectedPosition && step.command.type === 'move') {
        const reverse = opposite(step.command.direction);
        if (!page.openings.some(port => sameAddress(port, checkpoint.position) && port.direction === reverse
          && port.destination && sameAddress(port.destination, step.from))) {
          return { reason: 'Blocked: crossing lacks an observed reciprocal learned port.' };
        }
      }
      const expectedMoves = previous.moves + Number(step.command.type === 'move');
      if (!expectedPosition || checkpoint.revision !== previous.revision + 1 || checkpoint.moves !== expectedMoves) compatible = false;
      this.pending = undefined;
      this.cursor++;
    }
    if (!compatible) this.invalidate();
    this.page = page;
    if (this.cursor >= this.batch.length || !sameAddress(this.batch[this.cursor].from, checkpoint.position)) this.invalidate();
    if (!this.batch.length) {
      this.batch = planPageRoute(page, checkpoint, this.maxSteps, this.last);
      this.cursor = 0;
    } else this.last.reusedSteps++;
    const step = this.batch[this.cursor];
    if (!step) throw new Error('No observed route is available.');
    this.previous = { revision: checkpoint.revision, topologyRevision: checkpoint.topologyRevision,
      moves: checkpoint.moves, position: copyAddress(checkpoint.position) };
    this.pending = step;
    return { command: { ...step.command }, target: copyAddress(step.target), reason: step.reason };
  }
}
