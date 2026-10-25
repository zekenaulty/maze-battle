import { SKILLS } from '../../../domain/combat/skillCatalog';
import type { EnemyState, ItemInstance, MonsterCategory } from '../../../domain/types';
import { cellPosition } from '../knowledge/validation';
import { encodeRoster, fields, id, natural, number, optionalBoolean, optionalNumber, text } from '../roster/codec';
import { encodeItem, validateItem } from '../roster/itemValidation';
import { check, jsonBytes } from '../validation';
import { MAX_BATTLE_ENEMIES, MAX_BATTLE_LOG, MAX_BATTLE_LOOT,
  type BattleEnemy, type BattleHeader, type BattleLoot, type BattleRows, type CanonicalBattle } from './types';

const tags: readonly MonsterCategory[] = ['vermin', 'beast', 'undead', 'reptile', 'arcane', 'construct', 'ooze'];
const metadata = 'id wave status round log';
const optionalMetadata = 'returnMode rewardGold';
const enemyOptional = ['monsterId', 'gcdUntil', ...['cooldownUntil', 'rechargeUntil', 'charges', 'maxCharges'].map(k => `skills.*.${k}`)];

export function battleHeader(value: unknown): BattleHeader {
  // Leave room for the canonical record envelope even at maximum scope/key lengths.
  jsonBytes(value, 63 * 1024);
  const r = fields(value, 'schema battle origin stalledTicks', 'paused'); optionalBoolean(r.paused);
  check(r.schema === 1, 'invalid battle schema'); cellPosition(r.origin); natural(r.stalledTicks);
  const b = fields(r.battle, `${metadata} enemyIds`, `${optionalMetadata} defeatedIds lootIds`);
  id(b.id); natural(b.wave, 1); natural(b.round, 1);
  check(['active', 'won', 'lost'].some(s => b.status === s), 'invalid battle status');
  check(b.returnMode === undefined || ['manual', 'auto-play', 'waves'].some(s => b.returnMode === s), 'invalid battle return mode');
  if (b.rewardGold !== undefined) natural(b.rewardGold);
  check(Array.isArray(b.log) && b.log.length <= MAX_BATTLE_LOG, 'invalid battle log'); b.log.forEach(v => text(v, 512));
  const alive = ids(b.enemyIds, MAX_BATTLE_ENEMIES), dead = b.defeatedIds === undefined ? [] : ids(b.defeatedIds, MAX_BATTLE_ENEMIES);
  check(alive.length + dead.length <= MAX_BATTLE_ENEMIES && new Set([...alive, ...dead]).size === alive.length + dead.length,
    'duplicate or excessive battle enemies');
  if (b.lootIds !== undefined) ids(b.lootIds, MAX_BATTLE_LOOT);
  check(b.status !== 'won' || alive.length === 0, 'won battle has enemies');
  check(b.status !== 'active' || alive.length > 0, 'active battle has no enemies');
  return value as BattleHeader;
}

function ids(value: unknown, max: number): string[] {
  check(Array.isArray(value) && value.length <= max, 'invalid battle ID list'); value.forEach(id);
  check(new Set(value).size === value.length, 'duplicate battle ID'); return value;
}

export function battleEnemy(value: unknown, battleId: string, enemyId: string, defeated: boolean): BattleEnemy {
  jsonBytes(value, 16 * 1024);
  const r = fields(value, 'schema battleId enemy');
  check(r.schema === 1 && r.battleId === battleId, 'foreign battle enemy');
  validateEnemy(r.enemy);
  check(r.enemy.id === enemyId && (defeated ? r.enemy.hp === 0 : r.enemy.hp > 0), 'invalid battle enemy reference or life state');
  return value as BattleEnemy;
}

function validateEnemy(value: unknown): asserts value is EnemyState {
  jsonBytes(value, 8192);
  const e = fields(value, 'id displayName token tags level hp maxHp mp maxMp attributes combat skills', 'monsterId gcdUntil');
  id(e.id); if (e.monsterId !== undefined) id(e.monsterId); text(e.displayName); text(e.token, 32); natural(e.level, 1);
  number(e.hp); number(e.maxHp); number(e.mp); number(e.maxMp);
  check(e.maxHp > 0 && e.hp <= e.maxHp && e.mp <= e.maxMp, 'invalid enemy resources'); optionalNumber(e.gcdUntil);
  check(Array.isArray(e.tags) && e.tags.length <= tags.length && new Set(e.tags).size === e.tags.length
    && e.tags.every(t => tags.some(known => known === t)), 'invalid monster tags');
  Object.values(fields(e.attributes, 'strength vitality intellect available')).forEach(v => natural(v));
  const combat = fields(e.combat, 'baseDamage scaleWith'); number(combat.baseDamage);
  check(combat.scaleWith === 'strength' || combat.scaleWith === 'intellect', 'invalid enemy damage scaling');
  check(Array.isArray(e.skills) && e.skills.length <= Object.keys(SKILLS).length, 'invalid enemy skills');
  const seen = new Set<string>();
  for (const value of e.skills) {
    const s = fields(value, 'id cooldown', 'cooldownUntil rechargeUntil charges maxCharges');
    id(s.id); check(Object.hasOwn(SKILLS, s.id) && !seen.has(s.id), 'invalid or duplicate enemy skill'); seen.add(s.id);
    number(s.cooldown); optionalNumber(s.cooldownUntil); optionalNumber(s.rechargeUntil);
    if (s.maxCharges !== undefined) natural(s.maxCharges, 1);
    if (s.charges !== undefined) { natural(s.charges); check(typeof s.maxCharges === 'number' && s.charges <= s.maxCharges, 'invalid enemy skill charges'); }
  }
}

export function battleLoot(value: unknown, battleId: string, itemId: string): BattleLoot {
  jsonBytes(value, 16 * 1024);
  const r = fields(value, 'schema battleId item');
  check(r.schema === 1 && r.battleId === battleId, 'foreign battle loot'); validateItem(r.item);
  check(r.item.id === itemId, 'invalid battle loot reference'); return value as BattleLoot;
}

// Inspect split containers without invoking getters; each bounded child then uses the existing codec.
function shape(value: unknown, required: string, optional = '') {
  check(value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'nonplain battle object');
  const keys = Reflect.ownKeys(value); check(keys.length <= 32, 'excessive battle fields');
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    check(typeof key === 'string' && d.enumerable && Object.hasOwn(d, 'value'), 'unsupported battle descriptor');
  }
  return fields(value, required, optional);
}
function list(value: unknown, max: number): unknown[] {
  check(Array.isArray(value) && value.length <= max && Reflect.ownKeys(value).length === value.length + 1, 'invalid bounded battle list');
  const values: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    check(d?.enumerable && Object.hasOwn(d, 'value'), 'invalid battle list entry');
    values.push(d.value);
  }
  return values;
}

export function encodeBattle(value: CanonicalBattle): BattleRows {
  const r = shape(value, 'schema battle origin stalledTicks', 'paused');
  const b = shape(r.battle, `${metadata} enemies`, `${optionalMetadata} defeated loot`);
  const enemy = (value: unknown) => { const e = encodeRoster(value, enemyOptional); validateEnemy(e); return e; };
  const alive = list(b.enemies, MAX_BATTLE_ENEMIES).map(enemy);
  const dead = b.defeated === undefined ? undefined : list(b.defeated, MAX_BATTLE_ENEMIES).map(enemy);
  const loot = b.loot === undefined ? undefined : list(b.loot, MAX_BATTLE_LOOT).map(v => encodeItem(v as ItemInstance));
  const meta = Object.fromEntries(Object.entries(b).filter(([k]) => !['enemies', 'defeated', 'loot'].includes(k)));
  const header = battleHeader(encodeRoster({ ...r, battle: { ...meta, enemyIds: alive.map(e => e.id),
    defeatedIds: dead?.map(e => e.id), lootIds: loot?.map(i => i.id) } },
  ['paused', 'battle.returnMode', 'battle.rewardGold', 'battle.defeatedIds', 'battle.lootIds']));
  const enemies = new Map<string, BattleEnemy>(), items = new Map<string, BattleLoot>();
  for (const [values, defeated] of [[alive, false], [dead ?? [], true]] as const)
    for (const enemy of values) enemies.set(enemy.id, battleEnemy({ schema: 1, battleId: header.battle.id, enemy }, header.battle.id, enemy.id, defeated));
  for (const item of loot ?? []) items.set(item.id, battleLoot({ schema: 1, battleId: header.battle.id, item }, header.battle.id, item.id));
  return { header, enemies, loot: items };
}
