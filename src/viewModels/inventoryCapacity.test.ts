import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../domain/gameFactory';
import { equipItem, stashItem, unequipItem } from '../domain/items/inventory';
import { createVendorItem } from '../domain/items/loot';
import type { GameState } from '../domain/types';
import { characterFixture, inventoryFixture, itemFixture } from './characterTestFixtures';
import { equipDisabledReason, inventoryPackUsage, stashDisabledReason, unequipDisabledReason } from './inventoryCapacity';

function fullPack(): GameState {
  const worn = itemFixture({ id: 'worn' });
  const other = itemFixture({ id: 'other' });
  const spare = itemFixture({ id: 'spare' });
  return {
    ...createNewGameState({ mode: 'town' }),
    party: [characterFixture({ equipment: { weapon: worn.id } }), characterFixture({ id: 'mage', equipment: { weapon: other.id } })],
    inventory: { ...inventoryFixture([worn, other, spare]), capacity: 1 },
    stash: { items: [], capacity: 1 },
  };
}

describe('inventory capacity previews', () => {
  it('accepts only party and inventory fields with no stash or whole-game state', () => {
    const context = { party: [characterFixture()], inventory: inventoryFixture([itemFixture({ id: 'spare' })]) };
    expect(inventoryPackUsage(context)).toBe(1);
    expect(equipDisabledReason(context, 'vor', 'spare')).toBeUndefined();
    expect(stashDisabledReason(context, 'spare')).toBeUndefined();
  });

  it('counts bag records, preserves a full-pack replacement, and leaves the source unchanged', () => {
    const game = fullPack();
    const before = structuredClone(game);
    expect(inventoryPackUsage(game)).toBe(1);
    expect(equipDisabledReason(game, 'vor', 'spare')).toBeUndefined();
    expect(inventoryPackUsage(equipItem(game, 'vor', 'spare'))).toBe(1);
    expect(game).toEqual(before);
  });

  it('blocks a worn-to-occupied transfer and unequip when displaced gear has no room', () => {
    const game = fullPack();
    expect(equipDisabledReason(game, 'vor', 'other')).toBe('Pack full: no room for displaced gear');
    expect(equipItem(game, 'vor', 'other')).toBe(game);
    expect(unequipDisabledReason(game, 'vor', 'weapon')).toBe('Pack full: no room to unequip');
    expect(unequipItem(game, 'vor', 'weapon')).toBe(game);
  });

  it('allows a transfer to an empty slot while overfull but never worsens overflow', () => {
    const game = fullPack();
    game.inventory.items.push(itemFixture({ id: 'overflow' }));
    game.party.push(characterFixture({ id: 'empty', equipment: {} }));
    expect(inventoryPackUsage(game)).toBe(2);
    expect(equipDisabledReason(game, 'empty', 'other')).toBeUndefined();
    expect(inventoryPackUsage(equipItem(game, 'empty', 'other'))).toBe(2);
    expect(equipDisabledReason(game, 'vor', 'spare')).toBeUndefined();
    expect(unequipDisabledReason(game, 'vor', 'weapon')).toBe('Pack full: no room to unequip');
    expect(unequipItem(game, 'vor', 'weapon')).toBe(game);
  });

  it('enables unequip and occupied transfers after freeing a bag slot', () => {
    const game = fullPack();
    game.inventory.capacity = 2;
    expect(unequipDisabledReason(game, 'vor', 'weapon')).toBeUndefined();
    expect(inventoryPackUsage(unequipItem(game, 'vor', 'weapon'))).toBe(2);
    expect(equipDisabledReason(game, 'vor', 'other')).toBeUndefined();
    expect(inventoryPackUsage(equipItem(game, 'vor', 'other'))).toBe(2);
  });

  it('protects cross-container collisions without granting false free slots', () => {
    const game = fullPack();
    game.stash.items = [{ ...game.inventory.items[0] }];
    expect(inventoryPackUsage(game)).toBe(2);
    expect(equipDisabledReason(game, 'mage', 'worn')).toBe('Duplicate item identity');
    expect(equipItem(game, 'mage', 'worn')).toBe(game);
  });

  it('previews stacking into a full stash while rejecting new slots and protected identities', () => {
    const game = fullPack();
    const herb = createVendorItem('health-herb');
    game.inventory.items.push(herb);
    game.stash.items = [createVendorItem('health-herb')];
    const before = structuredClone(game);
    expect(stashDisabledReason(game, herb.id)).toBeUndefined();
    expect(stashItem(game, herb.id)).not.toBe(game);
    expect(stashDisabledReason(game, 'spare')).toBe('Stash full');
    expect(stashItem(game, 'spare')).toBe(game);
    expect(stashDisabledReason(game, 'worn')).toBe('Unequip before stashing');
    expect(game).toEqual(before);
    game.stash.items[0] = { ...herb };
    expect(stashDisabledReason(game, herb.id)).toBe('Duplicate item identity');
    expect(stashItem(game, herb.id)).toBe(game);
  });
});
