import type { ActorState } from '../../../domain/types';
import { EQUIPMENT_SLOTS } from '../../../domain/items/equipment';
import { SKILLS } from '../../../domain/combat/skillCatalog';
import { check, jsonBytes } from '../validation';
import { encodeRoster, fields, id, natural, number, optionalBoolean, optionalNumber, text } from './codec';

export function encodeActor(value: ActorState): ActorState {
  const encoded = encodeRoster(value, ['autoSpendPoints', 'gcdUntil', ...EQUIPMENT_SLOTS.map(slot => `equipment.${slot}`),
    ...['cooldownUntil', 'rechargeUntil', 'charges', 'maxCharges'].map(key => `skills.*.${key}`)]);
  validateActor(encoded); return encoded;
}

export function validateActor(value: unknown): asserts value is ActorState {
  jsonBytes(value, 8192);
  const actor = fields(value, 'id role displayName level xp hp maxHp mp maxMp gold autoBattle equipment attributes combat skills',
    'autoSpendPoints gcdUntil');
  id(actor.id); text(actor.displayName);
  check(typeof actor.role === 'string' && ['warrior', 'mage', 'healer'].includes(actor.role), 'invalid hero role');
  natural(actor.level, 1); natural(actor.xp); natural(actor.gold);
  for (const key of ['hp', 'mp', 'maxHp', 'maxMp']) number(actor[key]);
  check(typeof actor.autoBattle === 'boolean', 'invalid battle policy'); optionalBoolean(actor.autoSpendPoints); optionalNumber(actor.gcdUntil);
  const equipment = fields(actor.equipment, '', EQUIPMENT_SLOTS.join(' '));
  Object.values(equipment).forEach(id);
  check(new Set(Object.values(equipment)).size === Object.keys(equipment).length, 'duplicate equipped item');
  const attributes = fields(actor.attributes, 'strength vitality intellect available');
  for (const amount of Object.values(attributes)) natural(amount);
  const combat = fields(actor.combat, 'baseDamage scaleWith'); number(combat.baseDamage);
  check(combat.scaleWith === 'strength' || combat.scaleWith === 'intellect', 'invalid damage scaling');
  check(Array.isArray(actor.skills) && actor.skills.length <= Object.keys(SKILLS).length, 'invalid skill list');
  const ids = new Set<string>();
  for (const value of actor.skills) {
    const skill = fields(value, 'id cooldown', 'cooldownUntil rechargeUntil charges maxCharges');
    id(skill.id); check(Object.hasOwn(SKILLS, skill.id) && !ids.has(skill.id), 'invalid or duplicate skill'); ids.add(skill.id);
    number(skill.cooldown); optionalNumber(skill.cooldownUntil); optionalNumber(skill.rechargeUntil);
    if (skill.maxCharges !== undefined) natural(skill.maxCharges, 1);
    if (skill.charges !== undefined) { natural(skill.charges); check(typeof skill.maxCharges === 'number' && skill.charges <= skill.maxCharges, 'invalid skill charges'); }
  }
}
