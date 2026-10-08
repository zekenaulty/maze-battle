import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { startBattle } from '../combat/battleEngine';
import { grantRewards } from '../combat/rewards';
import { createMazePathSearch } from '../maze/solver';
import { castExplorationSkill, setAutoSpendPoints, spendAttribute } from './partyActions';

describe('character actions', () => {
  it('spends exactly one available point without mutating other actors', () => {
    const game = createNewGameState();
    game.party[0].attributes.available = 1;
    const actor = game.party[0];
    const next = spendAttribute(game, actor.id, 'vitality');
    expect(next.party[0].attributes.available).toBe(0);
    expect(next.party[0].attributes.vitality).toBe(actor.attributes.vitality + 1);
    expect(next.party[0].maxHp).toBe(actor.maxHp + 2);
    expect(next.party[1]).toBe(game.party[1]);
    expect(spendAttribute(next, actor.id, 'strength')).toBe(next);
    expect(actor.attributes.available).toBe(1);
  });

  it('respects manual allocation through reward processing', () => {
    let game = createNewGameState();
    game.party[0].attributes.available = 5;
    game = setAutoSpendPoints(game, game.party[0].id, false);
    expect(grantRewards(game.party, [], () => 0.5)[0].attributes.available).toBe(5);
    game = setAutoSpendPoints(game, game.party[0].id, true);
    expect(grantRewards(game.party, [], () => 0.5)[0].attributes.available).toBe(0);
  });

  it('heals outside combat using the same mana and cooldown rules', () => {
    const game = createNewGameState();
    game.party[0].hp = 1;
    const healer = game.party.find(a => a.role === 'healer')!;
    const healed = castExplorationSkill(game, healer.id, 'heal', () => 0.5, 10000);
    expect(healed.party[0].hp).toBeGreaterThan(1);
    expect(healed.party.find(a => a.id === healer.id)!.mp).toBe(healer.mp - 4);
    expect(castExplorationSkill(healed, healer.id, 'heal', () => 0.5, 10100)).toBe(healed);
    expect(game.party[0].hp).toBe(1);
  });

  it('does not consume mana for a missing heal or resurrection target, or during battle', () => {
    const game = createNewGameState();
    const healer = game.party.find(a => a.role === 'healer')!;
    expect(castExplorationSkill(game, healer.id, 'heal')).toBe(game);
    expect(castExplorationSkill(game, healer.id, 'resurrect')).toBe(game);
    const battle = startBattle(game, () => 0.5);
    expect(castExplorationSkill(battle, healer.id, 'heal')).toBe(battle);
  });

  it('resurrects and teleports only to reachable non-stair cells on the current floor', () => {
    const game = createNewGameState();
    const healer = game.party.find(a => a.role === 'healer')!;
    healer.mp = 40;
    game.party[0].hp = 0;
    const revived = castExplorationSkill(game, healer.id, 'resurrect', () => 0.5, 10000);
    expect(revived.party[0].hp).toBeGreaterThan(0);
    const mage = revived.party.find(a => a.role === 'mage')!;
    mage.mp = 40;
    const next = castExplorationSkill(revived, mage.id, 'teleport', () => 0.5, 11000);
    expect(next.dungeonLevel).toBe(game.dungeonLevel);
    expect(next.maze.active).not.toEqual(game.maze.start);
    expect(next.maze.active).not.toEqual(game.maze.end);
    expect(next.maze.active).not.toEqual(game.maze.active);
    expect(Number.isFinite(createMazePathSearch(game.maze).distanceTo(next.maze.active))).toBe(true);
    expect(next.floors[0].maze.active).toEqual(next.maze.active);
    expect(next.maze.visibility?.explored).toContainEqual(next.maze.active);
  });
});
