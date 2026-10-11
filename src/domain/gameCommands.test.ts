import { describe, expect, it, vi } from 'vitest';
import { applyGameCommand } from './gameCommands';
import { createNewGameState } from './gameFactory';
import { chestAt, lineMaze, roomAt } from './automation/autopilotTestFixtures';
import { openChest } from './items/chests';
import { moveManually } from '../hooks/useGameLoop';

const move = { type: 'move', direction: 'east', triggerStairs: false } as const;
const fixture = () => createNewGameState({ maze: lineMaze(6, [], 1), randomBattles: false, chests: [chestAt(2)] });

describe('game-owned commands', () => {
  it('manual and internal travel share physics without chest, quest, or stair policy', () => {
    const game = fixture(), now = Date.now();
    vi.useFakeTimers(); vi.setSystemTime(now);
    try {
      const result = applyGameCommand(game, move);
      expect(result.game).toEqual(moveManually(game, 'east', { triggerStairs: false }));
      expect(result.outcome).toEqual({ status: 'applied', reason: 'moved' });
      expect(result.game.chests).toEqual(game.chests);
      expect(result.game.inventory).toEqual(game.inventory);
      expect(result.game.quests).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('opening is explicit and cannot target a chest outside the current cell', () => {
    const game = fixture(), chestId = game.chests[0].id;
    expect(applyGameCommand(game, { type: 'open-chest', chestId }).game).toBe(game);
    const arrived = applyGameCommand(game, move).game;
    const opened = applyGameCommand(arrived, { type: 'open-chest', chestId }, () => .5);
    expect(opened.outcome.reason).toBe('opened');
    expect(opened.game.chests[0].opened).toBe(true);
    expect(applyGameCommand(opened.game, { type: 'open-chest', chestId }).game).toBe(opened.game);
    expect(openChest(arrived, 'different', () => .5)).toBe(arrived);
  });

  it('preserves mandatory encounter consequences, safe rooms and explicit encounter disabling', () => {
    const game = fixture();
    expect(applyGameCommand({ ...game, randomBattles: true }, move, () => 0).game.battle?.status).toBe('active');
    expect(applyGameCommand(game, move, () => 0).game.battle).toBeUndefined();
    const safe = createNewGameState({ maze: lineMaze(6, [roomAt('safe', 'safe', 2)], 1), randomBattles: true });
    expect(applyGameCommand(safe, move, () => 0).game.battle).toBeUndefined();
  });

  it('rejects defeated-party movement and keeps blocked facing without inventing translation', () => {
    const game = fixture(), defeated = { ...game, party: game.party.map(a => ({ ...a, hp: 0 })) };
    expect(applyGameCommand(defeated, move)).toEqual({ game: defeated, outcome: { status: 'refused', reason: 'ineligible' } });
    const result = applyGameCommand(game, { ...move, direction: 'north' });
    expect(result.outcome.reason).toBe('blocked');
    expect(result.game.maze).toBe(game.maze);
    expect(result.game.facing).toBe('north');
  });
});
