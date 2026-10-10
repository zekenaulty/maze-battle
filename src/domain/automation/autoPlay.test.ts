import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { startBattle } from '../combat/battleEngine';
import { advanceAutomaticPlay, stopAllAutomation, toggleAutoplay, toggleWaves } from './autoPlay';
import { advanceTownCare, careBeforeTravel } from './autoCare';
import { blockAutopilot } from './autopilotState';

describe('automatic play host', () => {
  it('halts blocked combat even when individual actor auto preferences remain enabled', () => {
    const game = startBattle(createNewGameState({ mode: 'auto-play' }), () => 0.5);
    const blocked = blockAutopilot(game, 'No combat progress');
    expect(blocked.party.every(actor => actor.autoBattle)).toBe(true);
    expect(blocked.battle?.returnMode).toBe('manual');
    expect(advanceAutomaticPlay(blocked)).toBe(blocked);
    expect(toggleAutoplay(blocked).automationPaused).toBe(false);
  });
  it('stops travel, town return, waves, and combat without forgetting actor choices', () => {
    const game = createNewGameState({ mode: 'auto-play' });
    game.party[0].autoBattle = false;
    for (const state of [game, startBattle(game, () => 0.5), { ...game, mode: 'town' as const, townReturnMode: 'waves' as const }]) {
      const stopped = stopAllAutomation(state);
      expect(stopped.automationPaused).toBe(true);
      expect(stopped.party.map(a => a.autoBattle)).toEqual([false, true, true]);
      expect(advanceAutomaticPlay(stopped, () => 0.5, 10000)).toBe(stopped);
      expect(stopped.battle?.returnMode ?? stopped.townReturnMode ?? stopped.mode).toBe('manual');
    }
  });

  it('allows explicit restart while preserving mixed character choices', () => {
    const game = createNewGameState();
    game.party[0].autoBattle = false;
    const started = toggleAutoplay(stopAllAutomation(game));
    expect(started.automationPaused).toBe(false);
    expect(started.party.map(a => a.autoBattle)).toEqual([false, true, true]);
    expect(started.mode).toBe('auto-play');
    const disabled = { ...game, party: game.party.map(a => ({ ...a, autoBattle: false })) };
    expect(toggleWaves(disabled, () => 0.5).party.every(a => a.autoBattle)).toBe(true);
  });

  it('uses a scroll for pack recovery and returns after bounded town care', () => {
    const game = createNewGameState({ mode: 'auto-play' });
    game.inventory.capacity = game.inventory.items.length;
    const town = careBeforeTravel(game, () => 0.5, 10000);
    expect(town.mode).toBe('town');
    expect(town.townReturnMode).toBe('auto-play');
    expect(town.inventory.items.some(i => i.consumableEffect === 'townPortal')).toBe(false);
    town.inventory.capacity = 36;
    const cared = advanceTownCare(town);
    expect(cared.autopilot?.phase).toBe('town');
    expect(advanceTownCare(cared).mode).toBe('auto-play');
  });

  it('stops with a visible reason when no portal can fund recovery', () => {
    const game = createNewGameState({ mode: 'auto-play' });
    game.inventory.items = [];
    game.inventory.capacity = 0;
    const blocked = careBeforeTravel(game, () => 0.5, 10000);
    expect(blocked.mode).toBe('manual');
    expect(blocked.autopilot?.phase).toBe('blocked');
    expect(blocked.autopilot?.reason).toContain('No usable portal scroll');
    expect(advanceAutomaticPlay(blocked)).toBe(blocked);
  });
});
