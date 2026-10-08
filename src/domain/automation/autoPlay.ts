import type { GameState } from '../types';
import { setGameMode } from '../gameFactory';
import { advanceBattleRound, setBattleReturnMode, startBattle } from '../combat/battleEngine';
import { defaultRng, type Rng } from '../combat/rng';
import { advanceAutopilot, stopAutopilot } from './autopilot';
import { advanceTownCare, careBeforeTravel } from './autoCare';

export function autoControlActive(game: GameState) {
  if (game.automationPaused) return false;
  return game.mode === 'auto-play' || game.townReturnMode === 'auto-play'
    || game.battle?.returnMode === 'auto-play' || Boolean(game.battle?.status === 'active' && game.party.some(a => a.autoBattle));
}

export function wavesControlActive(game: GameState) {
  return !game.automationPaused && (game.mode === 'waves' || game.battle?.returnMode === 'waves' || game.townReturnMode === 'waves');
}

export function stopAllAutomation(game: GameState): GameState {
  const stopped = stopAutopilot(game);
  return {
    ...stopped, automationPaused: true,
    mode: stopped.mode === 'waves' ? 'manual' : stopped.mode,
    battle: stopped.battle ? { ...stopped.battle, returnMode: 'manual' } : undefined,
    townReturnMode: stopped.mode === 'town' ? 'manual' : undefined,
  };
}

export function toggleAutoplay(game: GameState): GameState {
  if (autoControlActive(game) || wavesControlActive(game)) return stopAllAutomation(game);
  let next = { ...game, automationPaused: false };
  if (!next.party.some(a => a.autoBattle)) next = { ...next, party: next.party.map(a => ({ ...a, autoBattle: true })) };
  if (game.mode === 'town') return { ...next, townReturnMode: 'auto-play' };
  return game.battle ? setBattleReturnMode(next, 'auto-play') : setGameMode(next, 'auto-play');
}

export function toggleWaves(game: GameState, rng: Rng = defaultRng): GameState {
  if (wavesControlActive(game)) return stopAllAutomation(game);
  let next = { ...game, automationPaused: false };
  if (!next.party.some(a => a.autoBattle)) next = { ...next, party: next.party.map(a => ({ ...a, autoBattle: true })) };
  if (game.mode === 'town') return { ...next, townReturnMode: 'waves' };
  return game.battle ? setBattleReturnMode(next, 'waves') : startBattle(setGameMode(next, 'waves'), rng);
}

export function advanceAutomaticPlay(game: GameState, rng: Rng = defaultRng, now = Date.now()): GameState {
  if (game.automationPaused || game.battle?.status === 'lost') return game;
  if (game.battle?.status === 'active') {
    return game.party.some(a => a.autoBattle) ? advanceBattleRound(game, rng, now) : game;
  }
  if (game.mode === 'town') {
    return game.townReturnMode === 'auto-play' || game.townReturnMode === 'waves' ? advanceTownCare(game) : game;
  }
  if (game.mode !== 'auto-play' && game.mode !== 'waves') return game;
  const cared = careBeforeTravel(game, rng, now);
  if (cared !== game) return cared;
  return game.mode === 'waves' ? startBattle(game, rng) : advanceAutopilot(game, rng, now);
}
