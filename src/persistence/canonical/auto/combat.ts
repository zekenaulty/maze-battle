import { commitBattleCommand } from '../combat/command';
import { currentBattle } from '../combat/coherence';
import { beginBattle } from '../combat/start';
import { gameCheckpoint } from '../game/checkpoint';
import { loadParty } from '../roster/projection';
import type { RosterState } from '../../../domain/party/roster';
import type { CanonicalWork } from '../transaction';
import type { JsonObject } from '../types';
import type { AutoGuild } from './source';
import { AutoBlocked, type AutoState } from './types';

/** Explicit host Auto may select accepted guild work, never an unaccepted offer or a hidden path. */
export async function beginObjectiveBattle(tx: CanonicalWork, state: AutoState, guild: AutoGuild, roster: RosterState): Promise<JsonObject | null> {
  const c = gameCheckpoint(tx.head.checkpoint), objective = state.objective;
  const quest = objective?.kind === 'quest' && guild.active.find(q => q.id === objective.id);
  if (!quest || quest.task.objective !== 'kill' || quest.floor !== c.position.level || quest.targetRoomId !== c.position.cell.spaceId) return null;
  if (!roster.party.some(a => a.autoBattle)) throw new AutoBlocked('Kill objective requires a hero with auto battle enabled; actor preferences were preserved.');
  const battle = await beginBattle(tx, 'auto-play');
  state.route = null; state.search = null;
  return { kind: 'start', outcome: 'applied', channel: 'battle', battleId: battle.battle.id };
}

/** No idle enemy clock: delegate only an enabled Auto-return battle, using the existing combat tick. */
export async function advanceAutoBattle(tx: CanonicalWork) {
  let checkpoint = gameCheckpoint(tx.head.checkpoint);
  if (checkpoint.mode !== 'battle') return null;
  const before = (await currentBattle(tx.pages, checkpoint))!;
  const paused = before.paused || before.battle.returnMode !== 'auto-play' || !(await loadParty(tx.pages)).some(a => a.autoBattle);
  if (paused) return { action: null, outcome: 'paused', reason: 'Battle Auto is paused or no hero auto battle is enabled.', status: 'blocked' as const };
  const result = await commitBattleCommand({ ...tx, setCheckpoint(value) {
    checkpoint = gameCheckpoint(value); tx.setCheckpoint(value);
  } }, { kind: 'tick', battleId: before.battle.id, revision: tx.head.revision });
  const after = await currentBattle(tx.pages, checkpoint), lost = after?.battle.status === 'lost', blocked = lost || after?.paused;
  return { action: { ...result, channel: 'battle' }, outcome: blocked ? 'blocked' : result.outcome === 'applied' ? 'applied' : 'planning',
    reason: lost ? 'Party defeated; end the battle and recover before resuming Auto.' : after?.paused
      ? 'Combat made no progress; manual action and a fresh resume are required.' : after ? 'Advancing shared combat.' : 'Battle won; resuming floor work.',
    status: blocked ? 'blocked' as const : 'running' as const };
}
