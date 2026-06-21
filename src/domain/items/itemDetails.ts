import type { ItemInstance, ItemStats, LegendaryPower } from '../types';
import { LEGENDARY_POWERS } from './catalog';

const STAT_ORDER: Array<keyof ItemStats> = ['baseDamage', 'strength', 'vitality', 'intellect', 'maxHp', 'maxMp'];

const STAT_LABELS: Record<keyof ItemStats, string> = {
  baseDamage: 'Damage',
  strength: 'Strength',
  vitality: 'Vitality',
  intellect: 'Intellect',
  maxHp: 'Max HP',
  maxMp: 'Max MP',
};

export function getItemTotalStats(item: ItemInstance): ItemStats {
  const withAffixes = (item.affixes ?? []).reduce((stats, affix) => addItemStats(stats, affix.stats), item.stats ?? {});
  return addItemStats(withAffixes, getItemLegendaryPower(item)?.stats ?? {});
}

export function addItemStats(left: ItemStats, right: ItemStats): ItemStats {
  return {
    strength: (left.strength ?? 0) + (right.strength ?? 0) || undefined,
    vitality: (left.vitality ?? 0) + (right.vitality ?? 0) || undefined,
    intellect: (left.intellect ?? 0) + (right.intellect ?? 0) || undefined,
    maxHp: (left.maxHp ?? 0) + (right.maxHp ?? 0) || undefined,
    maxMp: (left.maxMp ?? 0) + (right.maxMp ?? 0) || undefined,
    baseDamage: (left.baseDamage ?? 0) + (right.baseDamage ?? 0) || undefined,
  };
}

export function getItemStatLines(item: ItemInstance) {
  return formatStats(getItemTotalStats(item));
}

export function getItemBreakdownLines(item: ItemInstance) {
  const lines: string[] = [];
  const baseStats = formatStats(item.stats);

  if (baseStats.length > 0) {
    lines.push(`Base: ${baseStats.join(', ')}`);
  }

  for (const affix of item.affixes ?? []) {
    const stats = formatStats(affix.stats);
    if (stats.length > 0) {
      lines.push(`${affix.name}: ${stats.join(', ')}`);
    }
  }

  const power = getItemLegendaryPower(item);
  const powerStats = formatStats(power?.stats);
  if (power) {
    lines.push(`${power.name}: ${powerStats.length > 0 ? `${powerStats.join(', ')}. ` : ''}${power.description}`);
  }

  const consumableLine = getConsumableEffectLine(item);
  if (consumableLine) {
    lines.push(consumableLine);
  }

  return lines;
}

export function getItemTooltip(item: ItemInstance, equippedLabel?: string) {
  return [equippedLabel, ...getItemStatLines(item), ...getItemBreakdownLines(item)].filter(Boolean).join('\n');
}

export function getConsumableEffectLine(item: ItemInstance) {
  if (item.consumableEffect === 'heal') {
    return `Restores ${item.consumableAmount ?? 0} HP.`;
  }

  if (item.consumableEffect === 'mana') {
    return `Restores ${item.consumableAmount ?? 0} MP.`;
  }

  if (item.consumableEffect === 'townPortal') {
    return 'Opens a portal back to town.';
  }

  return undefined;
}

export function formatStats(stats: ItemStats | undefined) {
  return STAT_ORDER.flatMap((stat) => {
    const value = stats?.[stat] ?? 0;
    return value === 0 ? [] : [`${value > 0 ? '+' : ''}${value} ${STAT_LABELS[stat]}`];
  });
}

function getItemLegendaryPower(item: ItemInstance): LegendaryPower | undefined {
  if (!item.legendaryPower) {
    return undefined;
  }

  const catalogPower = LEGENDARY_POWERS.find((power) => power.id === item.legendaryPower?.id);
  return {
    ...item.legendaryPower,
    stats: item.legendaryPower.stats ?? catalogPower?.stats,
  };
}
