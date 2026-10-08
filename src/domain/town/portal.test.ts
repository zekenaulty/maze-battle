import { describe, expect, it } from 'vitest';
import { moveActive, normalizeGameState } from '../gameFactory';
import { useConsumable } from '../items/inventory';
import { inventoryGame, supply } from '../items/__tests__/fixtures';
import { canUseTownPortal, portalScrollCount, useTownPortal } from './portal';
import { enterTown, leaveTown } from './town';

describe('one shared town portal resource', () => {
  it('cannot teleport with no scroll, stash-only stock, locked or empty stock', () => {
    for (const items of [[], [supply('town-portal', 1, { locked: true })], [supply('town-portal', 0)]]) {
      const game = inventoryGame([], { inventory: { capacity: 10, gold: 100, items }, stash: { capacity: 10, items: [supply('town-portal', 10)] } });
      expect(portalScrollCount(game)).toBe(0);
      expect(canUseTownPortal(game)).toBe(false);
      expect(useTownPortal(game)).toBe(game);
      expect(enterTown(game)).toBe(game);
    }
  });

  it('consumes exactly one scroll through either entry path and rejects duplicate town use', () => {
    const scroll = supply('town-portal', 3);
    const game = inventoryGame([scroll]);
    for (const entry of [useTownPortal, enterTown, (state: typeof game) => useConsumable(state, scroll.id)]) {
      const next = entry(game);
      expect(next.mode).toBe('town');
      expect(next.inventory.items).toMatchObject([{ id: scroll.id, quantity: 2 }]);
      expect(portalScrollCount(next)).toBe(2);
      expect(canUseTownPortal(next)).toBe(false);
      expect(useTownPortal(next)).toBe(next);
      expect(useConsumable(next, scroll.id)).toBe(next);
      expect(next.dungeonLevel).toBe(game.dungeonLevel);
      expect(next.maze).toBe(game.maze);
      expect(next.floors).toBe(game.floors);
    }
  });

  it('consumes the explicitly selected stack, never a different one on stale item IDs', () => {
    const first = supply('town-portal', 2);
    const selected = supply('town-portal', 1, { value: 100 });
    const game = inventoryGame([first, selected]);
    expect(useTownPortal(game, 'missing')).toBe(game);
    const next = useConsumable(game, selected.id);
    expect(next.inventory.items).toMatchObject([{ id: first.id, quantity: 2 }]);
  });

  it('disallows active combat, battle screens and defeated parties without consuming stock', () => {
    const game = inventoryGame([supply('town-portal', 2)]);
    const battle = { id: 'battle', status: 'active' as const, wave: 1, round: 1, enemies: [], log: [] };
    const states = [
      { ...game, mode: 'battle' as const, battle },
      { ...game, battle },
      { ...game, party: game.party.map((actor) => ({ ...actor, hp: 0 })) },
    ];
    for (const state of states) {
      expect(canUseTownPortal(state)).toBe(false);
      expect(useTownPortal(state)).toBe(state);
      expect(portalScrollCount(state)).toBe(2);
    }
  });

  it.each(['manual', 'auto-play', 'waves'] as const)('returns to the exact floor, location, facing and %s mode after serialization', (mode) => {
    const game = inventoryGame([supply('town-portal', 1)], { dungeonLevel: 7, mode, facing: 'west' });
    const town = useTownPortal(game);
    const restored = JSON.parse(JSON.stringify(town));
    const returned = leaveTown(restored);
    expect(returned.mode).toBe(mode);
    expect(returned.townReturnMode).toBeUndefined();
    expect(returned.dungeonLevel).toBe(7);
    expect(returned.maze).toEqual(game.maze);
    expect(returned.floors).toEqual(game.floors);
    expect(returned.facing).toBe('west');
    expect(portalScrollCount(returned)).toBe(0);
    expect(useTownPortal(returned)).toBe(returned);
    expect(leaveTown(returned)).toBe(returned);
  });

  it('retains consumed resources and manual return position through the existing game normalizer', () => {
    const game = inventoryGame([supply('town-portal', 2)]);
    const restored = normalizeGameState(JSON.parse(JSON.stringify(useTownPortal(game))));
    expect(portalScrollCount(restored)).toBe(1);
    expect(leaveTown(restored).maze.active).toEqual(game.maze.active);
    expect(leaveTown(restored).mode).toBe('manual');
  });

  it('keeps floor-one stairs free without changing scroll stock', () => {
    const game = inventoryGame([supply('town-portal', 2)]);
    const town = moveActive(game, 'west');
    expect(town.mode).toBe('town');
    expect(portalScrollCount(town)).toBe(2);
    expect(town.maze.active).toEqual(game.maze.start);
    const noScroll = inventoryGame();
    expect(moveActive(noScroll, 'west').mode).toBe('town');
  });

  it.todo('integration owner: normalizeGameState must preserve inventoryPolicy and townReturnMode for automatic return after repository reload');
});
