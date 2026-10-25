import type { ActorState, BattleState, GameMode } from '../domain/types';

interface ControlView {
  mode: GameMode;
  townReturnMode?: 'manual' | 'auto-play' | 'waves';
  battle?: Pick<BattleState, 'status' | 'returnMode'>;
  party: Pick<ActorState, 'autoBattle'>[];
  battleAutomationPaused?: boolean;
}

export function wavesActive(game: ControlView) {
  return !game.battleAutomationPaused && (game.mode === 'waves' || game.townReturnMode === 'waves'
    || game.battle?.status === 'active' && game.battle.returnMode === 'waves');
}
export function automationActive(game: ControlView) {
  return !game.battleAutomationPaused && (wavesActive(game) || game.mode === 'auto-play' || game.townReturnMode === 'auto-play'
    || game.battle?.status === 'active' && (game.battle.returnMode === 'auto-play' || game.party.some(actor => actor.autoBattle)));
}
