import type { ItemAffix, ItemInstance, ItemRarity } from '../types';
import { defaultRng, sample, type Rng } from '../combat/rng';
import { AFFIXES, BASE_ITEMS, findBaseItem, isEquipmentBase, LEGENDARY_POWERS, RARITY_PREFIX, RARITY_VALUE_MULTIPLIER, type BaseItemDefinition } from './catalog';

export type LootSource = 'battle' | 'chest';

interface LootRollOptions {
  source: LootSource;
  level: number;
}

export function rollLoot({ source, level }: LootRollOptions, rng: Rng = defaultRng): ItemInstance[] {
  const count = rollDropCount(source, rng);
  const items: ItemInstance[] = [];

  for (let index = 0; index < count; index++) {
    items.push(rollItem(level, rng));
  }

  return items;
}

export function rollDropCount(source: LootSource, rng: Rng = defaultRng) {
  const roll = rng();

  if (source === 'chest') {
    return roll > 0.78 ? 3 : 2;
  }

  if (roll < 0.15) {
    return 0;
  }

  return roll > 0.85 ? 2 : 1;
}

export function rollItem(level: number, rng: Rng = defaultRng): ItemInstance {
  const base = rollBaseItem(level, rng);
  const rarity = isEquipmentBase(base) ? rollRarity(rng) : 'common';
  return createItemInstance(base.id, Math.max(1, level), rarity, rng);
}

export function createItemInstance(baseId: string, itemLevel: number, rarity: ItemRarity = 'common', rng: Rng = defaultRng): ItemInstance {
  const base = findBaseItem(baseId);
  if (!base) {
    throw new Error(`Unknown item base: ${baseId}`);
  }

  const affixes = base.slot ? rollAffixes(rarity, rng) : [];
  const legendaryPower = base.slot && rarity === 'legendary' && rng() > 0.25 ? sample(LEGENDARY_POWERS, rng) : undefined;
  const prefix = RARITY_PREFIX[rarity];
  const displayName = prefix ? `${prefix} ${base.displayName}` : base.displayName;
  const stats = scaleStats(base.stats, itemLevel);
  const affixStats = combineAffixes(affixes);
  const value = Math.max(1, Math.ceil((base.value + itemLevel * 2 + statValue(stats) + statValue(affixStats) + statValue(legendaryPower?.stats)) * RARITY_VALUE_MULTIPLIER[rarity]));

  return {
    id: crypto.randomUUID(),
    baseId: base.id,
    displayName,
    token: base.token,
    category: base.slot ? 'equipment' : 'consumable',
    rarity,
    itemLevel,
    value,
    slot: base.slot,
    stats,
    affixes,
    legendaryPower,
    consumableEffect: base.consumableEffect,
    consumableAmount: base.consumableAmount,
  };
}

export function createVendorItem(baseId: string, level = 1) {
  return createItemInstance(baseId, level, 'common', () => 0.5);
}

function rollBaseItem(level: number, rng: Rng) {
  const eligible = BASE_ITEMS.filter((item) => item.minLevel <= level);
  const consumableChance = level < 3 ? 0.26 : 0.18;
  const pool = rng() < consumableChance ? eligible.filter((item) => !item.slot) : eligible.filter((item) => item.slot);
  return sample(pool.length > 0 ? pool : eligible, rng);
}

function rollRarity(rng: Rng): ItemRarity {
  const roll = rng();

  if (roll > 0.985) {
    return 'legendary';
  }

  if (roll > 0.9) {
    return 'rare';
  }

  if (roll > 0.58) {
    return 'magic';
  }

  return 'common';
}

function rollAffixes(rarity: ItemRarity, rng: Rng): ItemAffix[] {
  const count = rollAffixSlotCount(rarity, rng);
  const remaining = [...AFFIXES];
  const affixes: ItemAffix[] = [];

  for (let index = 0; index < count && remaining.length > 0; index++) {
    const affix = sample(remaining, rng);
    affixes.push(affix);
    remaining.splice(remaining.indexOf(affix), 1);
  }

  return affixes;
}

function rollAffixSlotCount(rarity: ItemRarity, rng: Rng) {
  if (rarity === 'legendary') {
    return rng() > 0.5 ? 4 : 3;
  }

  if (rarity === 'rare') {
    return rng() > 0.45 ? 3 : 2;
  }

  if (rarity === 'magic') {
    return 1;
  }

  return 0;
}

function scaleStats(stats: BaseItemDefinition['stats'], itemLevel: number) {
  if (!stats) {
    return undefined;
  }

  const bonus = Math.floor(itemLevel / 3);
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, value + bonus]));
}

function combineAffixes(affixes: ItemAffix[]) {
  return affixes.reduce<Record<string, number>>((combined, affix) => {
    for (const [key, value] of Object.entries(affix.stats)) {
      combined[key] = (combined[key] ?? 0) + value;
    }
    return combined;
  }, {});
}

function statValue(stats: object | undefined) {
  return Object.values(stats ?? {}).reduce((total, value) => total + (typeof value === 'number' ? value : 0), 0);
}
