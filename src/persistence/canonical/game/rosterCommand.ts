import type { CanonicalRequest } from '../types';
import { executeCanonical, type CanonicalWork } from '../transaction';
import { check, request as validateRequest } from '../validation';
import { checkpointJson, gameCheckpoint, rosterContext, type GameCheckpoint } from './checkpoint';
import { requireWorldAnchor } from '../world/residency';
import { rosterCommand, applyRosterCommand } from '../roster/commands';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';
import { recordGameObservation } from '../knowledge/write';
import { validateKnowledge } from '../knowledge/evidence';
import { currentBattle } from '../combat/coherence';
import { saveBattle } from '../combat/records';

/** Host-owned action facade. Provider exposure/authority remains with the game session. */
export function executeRosterCommand(request: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  request = validateRequest(request);
  check(request.operation === 'roster.command', 'invalid roster operation');
  return executeCanonical(request, tx => commitRosterCommand(tx, request.input), options);
}

export async function commitRosterCommand(tx: CanonicalWork, input: unknown) {
  const command = rosterCommand(input), checkpoint = gameCheckpoint(tx.head.checkpoint);
  const battle = await currentBattle(tx.pages, checkpoint);
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  const before = await loadRoster(tx.pages, { ...rosterContext(checkpoint), ...(battle ? { battle: battle.battle } : {}) });
  const next = applyRosterCommand(before.state, command);
  const unpause = battle?.battle.status === 'active' && battle.paused && command.kind === 'actor-auto' && command.enabled
    && next.party.some(a => a.id === command.actorId && a.autoBattle);
  if (unpause) await saveBattle(tx.pages, battle, { ...battle, paused: false, stalledTicks: 0 });
  if (next === before.state) return { kind: command.kind, outcome: unpause ? 'applied' : 'unchanged' };
  check((next.mode !== 'battle' || checkpoint.mode === 'battle') && next.dungeonLevel === checkpoint.position.level
    && next.battle === before.state.battle, 'roster command changed unrelated state');
  if (checkpoint.mode !== next.mode) await requireWorldAnchor(tx.pages, checkpoint.position);
  await saveRoster(tx.pages, before, next);
  let updated: GameCheckpoint = { ...checkpoint, mode: next.mode, townReturnMode: next.townReturnMode, activityLog: next.activityLog, updatedAt: next.updatedAt };
  if (checkpoint.mode === 'town' && next.mode !== 'town' && checkpoint.knowledge) updated = await recordGameObservation(tx, updated);
  tx.setCheckpoint(checkpointJson(updated));
  return { kind: command.kind, outcome: 'applied' };
}
