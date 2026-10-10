import { createExpeditionPlan, materializeSpace } from '../../domain/expedition/generation';
import { createExpeditionCheckpoint } from '../../domain/expedition/commands';
import { loadExpedition, saveExpedition } from '../../persistence/expeditionRepository';
import { claimExpeditionSession, loadExpeditionSession, loadExpeditionAction, settleExpeditionAction } from '../../persistence/expeditionActionRepository';

export const EXPEDITION_SLOT = 'structural-demo';

async function restoreRecord() {
  const saved = await loadExpedition(EXPEDITION_SLOT);
  if (saved) return saved;
  const plan = createExpeditionPlan({ version: 'spaces-v1', worldId: EXPEDITION_SLOT, floorId: 'floor-1', level: 1, seed: 20261008 });
  const checkpoint = createExpeditionCheckpoint(plan, materializeSpace);
  try { await saveExpedition(EXPEDITION_SLOT, plan, checkpoint, null); }
  catch (error) {
    const concurrent = await loadExpedition(EXPEDITION_SLOT);
    if (!concurrent) throw error;
    return concurrent;
  }
  return { plan, checkpoint };
}

export async function restoreExpedition(cancelled: () => boolean) {
  const saved = await restoreRecord();
  const spec = saved.plan.spaces.find(value => value.id === saved.checkpoint.position.spaceId);
  if (!spec || !materializeSpace(spec).cells.some(cell => cell.row === saved.checkpoint.position.row && cell.column === saved.checkpoint.position.column)) {
    throw new Error('Checkpoint position is not on walkable floor.');
  }
  const previous = await loadExpeditionSession(EXPEDITION_SLOT);
  if (cancelled()) return undefined;
  const owner = await claimExpeditionSession(EXPEDITION_SLOT, crypto.randomUUID(), previous?.epoch ?? null);
  const current = (await loadExpedition(EXPEDITION_SLOT))!;
  if (owner.pendingActionId) {
    const receipt = await loadExpeditionAction(EXPEDITION_SLOT, owner.pendingActionId);
    if (!receipt) throw new Error('Missing pending action receipt.');
    // This ledger contains only local, atomic checkpoint effects. An unresolved
    // reservation cannot have committed one. Fence its old writer before cancelling.
    await settleExpeditionAction(EXPEDITION_SLOT, receipt.request, { checkpoint: current.checkpoint,
      result: { actionId: receipt.request.actionId, disposition: 'refused', beforeRevision: receipt.request.expectedRevision,
        afterRevision: receipt.request.expectedRevision, reason: 'Interrupted local action cancelled before commit.' } }, owner);
  }
  return { ...current, owner };
}
