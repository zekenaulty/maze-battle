import { applyExpeditionCommand } from '../../domain/expedition/commands';
import { materializeSpace } from '../../domain/expedition/generation';
import { observeExpedition } from '../../domain/expedition/observation';
import type { ExpeditionActionRequest, ExpeditionActionResult } from '../../domain/expedition/protocol';
import { SpaceResidency } from '../../domain/expedition/residency';
import { ObservedRoutePlanner, type RouteKnowledgeChanges } from '../../domain/expedition/routePlanner';
import type { ExpeditionCheckpoint, ExpeditionCommand, ExpeditionPlan } from '../../domain/expedition/types';
import { beginExpeditionAction, claimExpeditionSession, settleExpeditionAction, type ExpeditionOwner } from '../../persistence/expeditionActionRepository';
import { EXPEDITION_SLOT } from './restore';

export const RESIDENT_CELL_BUDGET = 512;
export interface ExpeditionView { plan: ExpeditionPlan; checkpoint: ExpeditionCheckpoint }

/** Browser-owned host. Route caches and control fences never own canonical state. */
export class ExpeditionRuntime {
  readonly plan: ExpeditionPlan;
  checkpoint: ExpeditionCheckpoint;
  readonly cache = new SpaceResidency(RESIDENT_CELL_BUDGET, materializeSpace);
  readonly planner = new ObservedRoutePlanner();
  faulted = false;
  private owner: ExpeditionOwner;
  private controlVersion = 0;
  private control: Promise<void> = Promise.resolve();
  private active?: Promise<ExpeditionActionResult>;
  private changes?: RouteKnowledgeChanges;
  private readonly publish: (view: ExpeditionView) => void;

  constructor(saved: ExpeditionView & { owner: ExpeditionOwner }, publish: (view: ExpeditionView) => void) {
    this.plan = saved.plan;
    this.checkpoint = saved.checkpoint;
    this.owner = saved.owner;
    this.publish = publish;
  }

  takeOver(): Promise<void> {
    this.controlVersion++;
    this.planner.reset();
    const active = this.active;
    this.control = this.control.then(async () => {
      await active;
      this.owner = await claimExpeditionSession(EXPEDITION_SLOT, this.owner.sessionId, this.owner.epoch);
    }).catch(error => { this.faulted = true; throw error; });
    return this.control;
  }

  decide() { return this.planner.choose(this.checkpoint, { ...this.owner, changes: this.changes }); }

  async dispatch(command: ExpeditionCommand): Promise<ExpeditionActionResult> {
    const controlVersion = this.controlVersion;
    await this.control;
    const request: ExpeditionActionRequest = { version: 1, sessionId: this.owner.sessionId, epoch: this.owner.epoch,
      actionId: crypto.randomUUID(), expectedRevision: this.checkpoint.revision, command };
    const refused = (reason: string): ExpeditionActionResult => ({ actionId: request.actionId, disposition: 'unavailable',
      beforeRevision: request.expectedRevision, afterRevision: request.expectedRevision, reason });
    if (this.faulted || controlVersion !== this.controlVersion) return refused('Control changed.');
    if (this.active) return refused('An action is already in flight.');
    this.active = this.execute(request);
    try { return await this.active; }
    finally { this.active = undefined; }
  }

  private async execute(request: ExpeditionActionRequest): Promise<ExpeditionActionResult> {
    try {
      const reservation = await beginExpeditionAction(EXPEDITION_SLOT, request);
      if (reservation.status === 'existing') return reservation.receipt.result;
      const transition = applyExpeditionCommand(reservation.plan, reservation.checkpoint, request.command, spec => this.cache.get(spec));
      const checkpoint = transition.checkpoint;
      const spec = this.plan.spaces.find(value => value.id === checkpoint.position.spaceId)!;
      const result: ExpeditionActionResult = { actionId: request.actionId, disposition: transition.applied ? 'applied' : 'refused',
        beforeRevision: request.expectedRevision, afterRevision: checkpoint.revision, reason: transition.reason,
        observation: observeExpedition(checkpoint, spec, this.cache.get(spec)) };
      const receipt = await settleExpeditionAction(EXPEDITION_SLOT, request, { checkpoint, result });
      this.checkpoint = checkpoint;
      this.changes = transition.changes;
      this.publish({ plan: this.plan, checkpoint });
      return receipt.result;
    } catch (error) {
      this.faulted = true;
      return { actionId: request.actionId, disposition: 'unresolved', beforeRevision: request.expectedRevision,
        afterRevision: this.checkpoint.revision, reason: error instanceof Error ? error.message : 'Unable to commit expedition action.' };
    }
  }
}
