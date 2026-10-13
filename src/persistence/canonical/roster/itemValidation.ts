import type { ItemInstance } from '../../../domain/types';
import { EQUIPMENT_SLOTS } from '../../../domain/items/equipment';
import { check, jsonBytes } from '../validation';
import { encodeRoster, fields, id, natural, number, optionalBoolean, text } from './codec';

const statKeys = 'strength vitality intellect maxHp maxMp baseDamage'.split(' ');
const optionalPaths = [
  ...'questId slot stats affixes legendaryPower consumableEffect consumableAmount quantity stackSellValue locked'.split(' '),
  'legendaryPower.stats', ...['stats', 'legendaryPower.stats', 'affixes.*.stats'].flatMap(prefix => statKeys.map(key => `${prefix}.${key}`)),
];
export function encodeItem(value: ItemInstance): ItemInstance {
  const encoded = encodeRoster(value, optionalPaths); validateItem(encoded); return encoded;
}

function stats(value: unknown) {
  const object = fields(value, '', 'strength vitality intellect maxHp maxMp baseDamage');
  for (const amount of Object.values(object)) number(amount);
}

export function validateItem(value: unknown): asserts value is ItemInstance {
  jsonBytes(value, 8192);
  const item = fields(value, 'id baseId displayName token category rarity itemLevel value',
    'questId slot stats affixes legendaryPower consumableEffect consumableAmount quantity stackSellValue locked');
  id(item.id); id(item.baseId); text(item.displayName); text(item.token, 32);
  check(typeof item.category === 'string' && ['equipment', 'consumable', 'currency', 'quest'].includes(item.category), 'invalid item category');
  check(typeof item.rarity === 'string' && ['common', 'magic', 'rare', 'legendary'].includes(item.rarity), 'invalid item rarity');
  natural(item.itemLevel, 1); natural(item.value); optionalBoolean(item.locked);
  if (item.questId !== undefined) id(item.questId);
  if (item.quantity !== undefined) natural(item.quantity, 1);
  if (item.stackSellValue !== undefined) natural(item.stackSellValue);
  if (item.stats !== undefined) stats(item.stats);
  if (item.affixes !== undefined) {
    check(Array.isArray(item.affixes) && item.affixes.length <= 8, 'invalid affix count');
    const ids = new Set<string>();
    for (const value of item.affixes) {
      const affix = fields(value, 'id name stats'); id(affix.id); text(affix.name); stats(affix.stats);
      check(!ids.has(affix.id), 'duplicate item affix'); ids.add(affix.id);
    }
  }
  if (item.legendaryPower !== undefined) {
    const power = fields(item.legendaryPower, 'id name description', 'stats');
    id(power.id); text(power.name); text(power.description, 1024);
    if (power.stats !== undefined) stats(power.stats);
    check(item.category === 'equipment' && item.rarity === 'legendary', 'invalid legendary item');
  }
  if (item.category === 'equipment') {
    check(EQUIPMENT_SLOTS.includes(item.slot as never) && (item.quantity === undefined || item.quantity === 1), 'invalid equipment item');
    check(item.consumableEffect === undefined && item.consumableAmount === undefined, 'equipment has consumable effect');
  } else check(item.slot === undefined, 'non-equipment item has a gear slot');
  if (item.consumableEffect !== undefined) {
    check(item.category === 'consumable' && typeof item.consumableEffect === 'string' && ['heal', 'mana', 'townPortal'].includes(item.consumableEffect), 'invalid consumable effect');
    if (item.consumableEffect !== 'townPortal') { number(item.consumableAmount); check(item.consumableAmount > 0, 'empty consumable effect'); }
  }
  if (item.consumableAmount !== undefined) number(item.consumableAmount);
}
