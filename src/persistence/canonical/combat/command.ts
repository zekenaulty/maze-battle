import { executeBattleTurn } from '../../../domain/combat/battleTurn';
import { defaultRng } from '../../../domain/combat/rng';
import { getEquipmentStats } from '../../../domain/items/equipment';
import { checkpointJson, gameCheckpoint, rosterContext } from '../game/checkpoint';
import { validateKnowledge } from '../knowledge/evidence';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';
import type { CanonicalRequest, JsonObject } from '../types';
import { executeCanonical, type CanonicalWork } from '../transaction';
import { check, request as validateRequest } from '../validation';
import { currentBattle } from './coherence';
import { battleCommand } from './input';
import { saveBattle } from './records';
import { settleBattleTurn } from './settlement';
import { beginBattle } from './start';

export function executeBattleCommand(request: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  request = validateRequest(request); check(request.operation === 'battle.command', 'invalid battle operation');
  return executeCanonical(request, tx => commitBattleCommand(tx, request.input), options);
}

/** Host clock/RNG and game-owned effects only. No caller stats, enemies, targets or timing overrides. */
export async function commitBattleCommand(tx: CanonicalWork, input: unknown): Promise<JsonObject> {
  const command = battleCommand(input);
  if (command.revision !== undefined && command.revision !== tx.head.revision) return { kind: command.kind, outcome: 'stale' };
  if (command.kind === 'start') {
    const next = await beginBattle(tx, command.returnMode);
    return { kind: command.kind, outcome: 'applied', battleId: next.battle.id };
  }
  const checkpoint = gameCheckpoint(tx.head.checkpoint), before = await currentBattle(tx.pages, checkpoint);
  check(before && before.battle.id === command.battleId, 'stale battle ID');
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  if (command.kind === 'end') {
    await saveBattle(tx.pages, before, null);
    tx.setCheckpoint(checkpointJson({ ...checkpoint, updatedAt: new Date().toISOString(),
      mode: before.battle.status === 'lost' ? 'town' : 'manual',
      ...(before.battle.status === 'lost' ? { townReturnMode: 'manual' } : {}) }));
    return { kind: command.kind, outcome: 'applied' };
  }
  if (command.kind === 'automation' && !command.enabled) {
    await saveBattle(tx.pages, before, { ...before, paused: true, battle: { ...before.battle, returnMode: 'manual' } });
    return { kind: command.kind, outcome: 'applied' };
  }
  if (before.battle.status !== 'active') return { kind: command.kind, outcome: 'unchanged' };
  const roster = await loadRoster(tx.pages, rosterContext(checkpoint));
  check(roster.state.party.some(a => a.hp > 0), 'active battle has no living party');
  if (command.kind === 'automation') {
    if (!roster.state.party.some(a => a.autoBattle))
      await saveRoster(tx.pages, roster, { ...roster.state, party: roster.state.party.map(a => ({ ...a, autoBattle: true })) });
    await saveBattle(tx.pages, before, { ...before, paused: false, stalledTicks: 0, battle: { ...before.battle, returnMode: command.mode } });
    return { kind: command.kind, outcome: 'applied' };
  }
  if (command.kind === 'tick' && (before.paused || !roster.state.party.some(a => a.autoBattle)))
    return { kind: command.kind, outcome: 'unchanged' };
  const now = Date.now();
  const turn = executeBattleTurn({ party: roster.state.party, battle: before.battle,
    equipmentBonuses: Object.fromEntries(roster.state.party.map(a => [a.id, getEquipmentStats(a, roster.state.inventory)])) },
  command.kind === 'skill' ? command : { kind: 'round' }, defaultRng, now);
  if (command.kind === 'skill' && !turn.acted) return { kind: command.kind, outcome: 'unchanged' };
  const applied = await settleBattleTurn(tx, checkpoint, before, roster, turn, new Date(now).toISOString());
  return { kind: command.kind, outcome: applied ? 'applied' : 'unchanged' };
}
