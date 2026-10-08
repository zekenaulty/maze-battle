import { describe, expect, it } from 'vitest';
import { createNewGameState, normalizeGameState } from './gameFactory';
import { inventoryGame } from './items/__tests__/fixtures';

describe('resource and actor automation preservation', () => {
  it.each([0, 7, 19.5])('preserves finite nonnegative pending battle gold %s without crediting it on reload', (rewardGold) => {
    let game = normalizeGameState({ ...inventoryGame(), battle: { id: 'pending', rewardGold, status: 'active', enemies: [], defeated: [] } });
    for (let cycle = 0; cycle < 3; cycle++) {
      game = normalizeGameState(JSON.parse(JSON.stringify(createNewGameState(game))));
      expect(game.battle).toHaveProperty('rewardGold', rewardGold);
      expect(game.inventory.gold).toBe(0);
      expect(game.party.map((actor) => actor.gold)).toEqual([0, 0, 0]);
    }
  });

  it.each([undefined, null, -1, NaN, Infinity, '7', true])('does not retain invalid pending gold %s', (rewardGold) => {
    const game = normalizeGameState({ ...inventoryGame(), battle: { rewardGold, status: 'active' } });
    expect(game.battle).toHaveProperty('rewardGold', undefined);
  });

  it('preserves true/false autoSpendPoints independently from autoBattle, defaulting invalid/omitted values to true', () => {
    const base = inventoryGame();
    for (const value of [true, false, undefined, null, 'false', 0]) {
      const expected = typeof value === 'boolean' ? value : true;
      const raw = { ...base, party: base.party.map((actor) => ({ ...actor, autoBattle: false, autoSpendPoints: value })) };
      const created = createNewGameState(JSON.parse(JSON.stringify(raw)));
      const loaded = normalizeGameState(raw);
      for (const game of [created, loaded, normalizeGameState(JSON.parse(JSON.stringify(loaded)))]) {
        expect(game.party.every((actor) => !actor.autoBattle)).toBe(true);
        for (const actor of game.party) expect(actor).toHaveProperty('autoSpendPoints', expected);
      }
    }
    for (const actor of base.party) expect(actor).toHaveProperty('autoSpendPoints', true);
  });
});
