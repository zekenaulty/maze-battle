import { claimStreamControl, loadStreamAction, loadStreamControl, loadStreamSnapshot, executeStreamAction } from '../../../persistence/streamRepository';
import { ensureStreamPublicScope } from '../../../persistence/streamPublicScope';
import { loadTopologyHeader } from '../../../persistence/topologyRepository';
import { DEFAULT_PLANNING_LIMITS, type PlanningAction, type PlanningBinding, type PlanningHost, type PlanningLimits } from './contracts';
import { actionRequest, parseServiceMessage, validateBinding, validateLimits } from './protocol';
import { PlanningSession } from './session';

/** Deliberate browser takeover of an existing isolated stream slot. Never creates a game. */
export async function openRepositoryPlanningSession(slot: string, runId: string, objectiveId: string, limits: PlanningLimits = DEFAULT_PLANNING_LIMITS) {
  validateLimits(limits);
  const initial = await loadStreamSnapshot(slot);
  const scopeId = await ensureStreamPublicScope(slot);
  const before = await loadStreamControl(slot);
  const owner = { sessionId: crypto.randomUUID(), epoch: before === undefined ? 0 : before.epoch + 1 };
  const binding: PlanningBinding = { ...owner, runId, objectiveId, actorId: 'party', scopeId,
    worldId: initial.checkpoint.worldId, floorId: initial.checkpoint.floorId };
  validateBinding(binding);
  await claimStreamControl(slot, owner.sessionId, before?.epoch ?? null);
  let released = false;
  const host: PlanningHost = {
    async read() {
      const snapshot = await loadStreamSnapshot(slot);
      return { checkpoint: snapshot.checkpoint, knowledge: snapshot.room.knowledge!,
        observation: snapshot.observation, control: await loadStreamControl(slot) };
    },
    execute: request => executeStreamAction(slot, request),
    lookup: request => loadStreamAction(slot, request),
    async release() {
      if (released) return;
      const control = await loadStreamControl(slot);
      if (control?.sessionId === owner.sessionId && control.epoch === owner.epoch) {
        // CAS never steals a newer manual/other-tab owner when release races takeover.
        await claimStreamControl(slot, owner.sessionId, owner.epoch);
      }
      released = true;
    },
  };
  return new PlanningSession(host, binding, limits);
}

/** Read-only original-attempt reconciliation after browser reload or service reconnect. */
export async function reconcileRepositoryAction(slot: string, text: string) {
  const input = parseServiceMessage(text);
  if (input.type !== 'action.query') throw new Error('Expected original action query');
  const root = await loadTopologyHeader(slot);
  if (!root || root.publicScopeId !== input.binding.scopeId || root.header.recipe.worldId !== input.binding.worldId
    || root.header.recipe.floorId !== input.binding.floorId) throw new Error('Original action scope mismatch');
  const receipt = await loadStreamAction(slot, actionRequest(input as PlanningAction));
  if (!receipt) return undefined;
  const result = receipt.result;
  return { actionId: result.actionId, disposition: result.disposition, beforeRevision: result.beforeRevision,
    afterRevision: result.afterRevision, topologyRevision: result.topologyRevision, reason: result.reason };
}
