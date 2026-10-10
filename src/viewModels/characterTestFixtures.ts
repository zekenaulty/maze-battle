import type { ActorState, InventoryState, ItemInstance } from '../domain/types';

export function characterFixture(overrides: Partial<ActorState> = {}): ActorState {
  return {
    id: 'vor', displayName: 'Vor', role: 'warrior', level: 2, xp: 20,
    hp: 80, maxHp: 100, mp: 15, maxMp: 20, gold: 0, autoBattle: true,
    attributes: { strength: 12, vitality: 8, intellect: 5, available: 2 },
    combat: { baseDamage: 10, scaleWith: 'strength' }, equipment: {},
    skills: [{ id: 'slash', cooldown: 0 }, { id: 'cleave', cooldown: 0, charges: 2, maxCharges: 2 }],
    ...overrides,
  };
}

export function itemFixture(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return { id: 'sword', baseId: 'iron-sword', displayName: 'Iron Sword', token: '!', category: 'equipment', rarity: 'common', slot: 'weapon', itemLevel: 2, value: 30, stats: { baseDamage: 4, strength: 1 }, ...overrides };
}

export function inventoryFixture(items: ItemInstance[] = []): InventoryState {
  return { capacity: 36, gold: 35, items };
}
