import type { ConsumableEffect, EquipmentSlot, ItemAffix, ItemInstance, ItemRarity, ItemStats, LegendaryPower, VendorId } from '../types';

export interface BaseItemDefinition {
  id: string;
  displayName: string;
  token: string;
  minLevel: number;
  value: number;
  slot?: EquipmentSlot;
  stats?: ItemStats;
  consumableEffect?: ConsumableEffect;
  consumableAmount?: number;
  vendors?: VendorId[];
}

export const BASE_ITEMS: BaseItemDefinition[] = [
  { id: 'rusty-sword', displayName: 'Rusty Sword', token: '🗡️', minLevel: 1, value: 8, slot: 'weapon', stats: { baseDamage: 2 }, vendors: ['blacksmith'] },
  { id: 'iron-sword', displayName: 'Iron Sword', token: '⚔️', minLevel: 2, value: 24, slot: 'weapon', stats: { baseDamage: 4, strength: 1 }, vendors: ['blacksmith'] },
  { id: 'oak-wand', displayName: 'Oak Wand', token: '🪄', minLevel: 1, value: 10, slot: 'weapon', stats: { baseDamage: 1, intellect: 1 }, vendors: ['blacksmith'] },
  { id: 'buckler', displayName: 'Buckler', token: '🛡️', minLevel: 1, value: 12, slot: 'offhand', stats: { vitality: 1, maxHp: 3 }, vendors: ['blacksmith'] },
  { id: 'leather-cap', displayName: 'Leather Cap', token: '🧢', minLevel: 1, value: 8, slot: 'head', stats: { maxHp: 4 }, vendors: ['blacksmith'] },
  { id: 'cloth-robe', displayName: 'Cloth Robe', token: '🥋', minLevel: 1, value: 9, slot: 'body', stats: { maxMp: 4, intellect: 1 }, vendors: ['blacksmith'] },
  { id: 'travel-boots', displayName: 'Travel Boots', token: '🥾', minLevel: 1, value: 7, slot: 'feet', stats: { vitality: 1 }, vendors: ['blacksmith'] },
  { id: 'work-gloves', displayName: 'Work Gloves', token: '🧤', minLevel: 1, value: 7, slot: 'hands', stats: { strength: 1 }, vendors: ['blacksmith'] },
  { id: 'copper-ring', displayName: 'Copper Ring', token: '💍', minLevel: 1, value: 16, slot: 'ring', stats: { maxHp: 3, maxMp: 3 }, vendors: ['blacksmith'] },
  { id: 'moon-amulet', displayName: 'Moon Amulet', token: '📿', minLevel: 2, value: 26, slot: 'amulet', stats: { intellect: 1, maxMp: 8 }, vendors: ['blacksmith'] },
  { id: 'health-herb', displayName: 'Health Herb', token: '🌿', minLevel: 1, value: 6, consumableEffect: 'heal', consumableAmount: 35, vendors: ['alchemist'] },
  { id: 'mana-vial', displayName: 'Mana Vial', token: '🧪', minLevel: 1, value: 8, consumableEffect: 'mana', consumableAmount: 25, vendors: ['alchemist'] },
  { id: 'town-portal', displayName: 'Town Portal', token: '🌀', minLevel: 1, value: 14, consumableEffect: 'townPortal', vendors: ['alchemist'] },
];

export const AFFIXES: ItemAffix[] = [
  { id: 'bear', name: 'Bear', stats: { vitality: 2, maxHp: 4 } },
  { id: 'fox', name: 'Fox', stats: { intellect: 2, maxMp: 4 } },
  { id: 'wolf', name: 'Wolf', stats: { strength: 2, baseDamage: 1 } },
  { id: 'guarding', name: 'Guarding', stats: { maxHp: 8 } },
  { id: 'focus', name: 'Focus', stats: { maxMp: 8 } },
  { id: 'edge', name: 'Edge', stats: { baseDamage: 2 } },
];

export const LEGENDARY_POWERS: LegendaryPower[] = [
  { id: 'ember-step', name: 'Ember Step', description: 'Leaves a tiny trail of fire in memory.', stats: { baseDamage: 1, maxMp: 4 } },
  { id: 'old-king', name: 'Old King', description: 'A forgotten ruler still lends strength.', stats: { strength: 2, vitality: 1 } },
  { id: 'deep-pocket', name: 'Deep Pocket', description: 'Gold seems easier to find.', stats: { maxHp: 5, maxMp: 5 } },
  { id: 'green-spark', name: 'Green Spark', description: 'Healing magic hums softly.', stats: { intellect: 1, maxMp: 6 } },
];

export const RARITY_PREFIX: Record<ItemRarity, string> = {
  common: '',
  magic: 'Glimmering',
  rare: 'Heroic',
  legendary: 'Legendary',
};

export const RARITY_VALUE_MULTIPLIER: Record<ItemRarity, number> = {
  common: 1,
  magic: 2,
  rare: 4,
  legendary: 9,
};

export function findBaseItem(baseId: string) {
  return BASE_ITEMS.find((item) => item.id === baseId);
}

export function isEquipmentBase(base: BaseItemDefinition) {
  return Boolean(base.slot);
}

export function itemSummary(item: ItemInstance) {
  const affixes = item.affixes?.map((affix) => affix.name).join(', ');
  const power = item.legendaryPower ? ` - ${item.legendaryPower.name}` : '';
  const quantity = (item.quantity ?? 1) > 1 ? ` x${item.quantity}` : '';
  return `${item.token} ${item.displayName}${quantity}${affixes ? ` (${affixes})` : ''}${power}`;
}
