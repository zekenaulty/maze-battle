import { describe, expect, it, vi } from 'vitest';
import type { GameState } from '../types';
import { createNewGameState } from '../gameFactory';
import { startBattle, useBattleSkill } from '../combat/battleEngine';
import { leaveTown } from '../town/town';
import { advanceAutopilot } from './autopilot';
import { blockAutopilot, planningState } from './autopilotState';
import { lineMaze } from './autopilotTestFixtures';

describe.each(['auto-play', 'waves'] as const)('blocked %s recovery', (returnMode) => {
  it.each(['manual', 'auto-play', 'waves', 'town', 'battle'] as const)(
    'clears automatic return modes without losing the %s screen or actor choices',
    (mode) => {
      const base = createNewGameState({ mode: returnMode, maze: lineMaze(3), randomBattles: false });
      const started = startBattle(base, () => 0.1);
      const flags = [true, false, true];
      const game: GameState = {
        ...started,
        mode,
        townReturnMode: returnMode,
        battle: mode === 'battle' ? {
          ...started.battle!,
          enemies: [{ ...started.battle!.enemies[0], hp: 1, skills: [] }],
        } : undefined,
        party: started.party.map((actor, index) => ({ ...actor, autoBattle: flags[index] })),
        autopilot: { ...planningState(started), phase: 'travel', route: ['east'], targetId: 'chest:pending' },
      };

      const blocked = blockAutopilot(game, 'No affordable supplies.');
      expect(blocked.mode).toBe(mode === 'town' || mode === 'battle' ? mode : 'manual');
      expect(blocked.townReturnMode).toBe('manual');
      expect(blocked.battle?.returnMode).toBe(mode === 'battle' ? 'manual' : undefined);
      expect(blocked.autopilot).toMatchObject({
        phase: 'blocked', route: [], stalledTicks: 1, reason: 'No affordable supplies.',
      });
      expect(blocked.activityLog[0]).toBe('Auto stopped: No affordable supplies.');
      expect(blocked.party).toBe(game.party);
      expect(blocked.party.map((actor) => actor.autoBattle)).toEqual(flags);
      expect(game.townReturnMode).toBe(returnMode);
      expect(game.autopilot?.route).toEqual(['east']);

      const rng = vi.fn(() => 0.1);
      expect(advanceAutopilot(blocked, rng)).toBe(blocked);
      expect(rng).not.toHaveBeenCalled();
      if (mode === 'town') {
        expect(leaveTown(blocked).mode).toBe('manual');
      }
      if (mode === 'battle') {
        expect(blocked.battle?.round).toBe(game.battle?.round);
        const finished = useBattleSkill(blocked, blocked.party[0].id, 'slash', () => 0.99, 1000);
        expect(finished.battle).toBeUndefined();
        expect(finished.mode).toBe('manual');
        expect(finished.party.map((actor) => actor.autoBattle)).toEqual(flags);
      }
    },
  );
});
