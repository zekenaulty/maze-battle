import { vi } from 'vitest';
import type { EnemyState, ItemInstance } from '../../../domain/types';
import type { CanonicalPages } from '../pages';
import type { CanonicalRecord, Json } from '../types';
import { jsonBytes } from '../validation';
import type { CanonicalBattle } from './types';

export const enemyKey = (battleId = 'battle', id = 'enemy') => `combat/${battleId}/enemy/${id}`;
export const lootKey = (battleId = 'battle', id = 'loot') => `combat/${battleId}/loot/${id}`;
export function enemy(id = 'enemy', hp = 12): EnemyState {
  return { id, monsterId: 'cave-spider', displayName: 'Spider', token: 'S', tags: ['vermin', 'beast'], level: 1,
    hp, maxHp: 12, mp: 5, maxMp: 10, gcdUntil: 100,
    attributes: { strength: 1, vitality: 2, intellect: 3, available: 0 }, combat: { baseDamage: 2, scaleWith: 'strength' },
    skills: [{ id: 'attack', cooldown: 1, cooldownUntil: 150 },
      { id: 'magicMissiles', cooldown: 3, cooldownUntil: 200, charges: 1, maxCharges: 3, rechargeUntil: 300 }] };
}
export function item(id = 'loot'): ItemInstance {
  return { id, baseId: 'rusty-sword', displayName: 'Sword', token: 'S', category: 'equipment', rarity: 'common',
    itemLevel: 1, value: 3, slot: 'weapon', stats: { baseDamage: 2 } };
}
export function battle(): CanonicalBattle {
  return { schema: 1, origin: { level: 2, cell: { spaceId: 'room', row: 1, column: 2 } }, stalledTicks: 2,
    battle: { id: 'battle', status: 'active', returnMode: 'auto-play', wave: 3, round: 4, rewardGold: 17,
      log: ['Battle starts.', 'One defeated.'], enemies: [enemy()], defeated: [enemy('dead', 0)], loot: [item()] } };
}

/** In-memory world-key mock, not kernel/IDB/transaction or playable integration proof. */
export function combatFixture(scopeLength = 4) {
  const records = new Map<string, CanonicalRecord>(), reads: string[] = [], writes: string[] = [], deletes: string[] = [];
  const scope = { generation: 'g'.repeat(scopeLength), gameId: 'w'.repeat(scopeLength) };
  let sequence = 0;
  function row(key: string, value: Json, indexes: string[] = []): CanonicalRecord {
    return { ...scope, id: `record-${++sequence}`, revision: 1, area: 'world', key, value: structuredClone(value), indexes };
  }
  const scan = vi.fn(() => { throw Error('Combat must not scan'); });
  const pages = {
    get: vi.fn<CanonicalPages['get']>(async (area, key) => {
      if (area !== 'world') throw Error('Combat must use world records');
      reads.push(key); return structuredClone(records.get(key));
    }),
    set: vi.fn<CanonicalPages['set']>(async (area, key, value, indexes = []) => {
      if (area !== 'world') throw Error('Combat must use world records');
      const record = row(key, value, indexes); jsonBytes(record);
      writes.push(key); records.set(key, record); return structuredClone(record);
    }),
    delete: vi.fn<CanonicalPages['delete']>(async (area, key) => {
      if (area !== 'world') throw Error('Combat must use world records');
      deletes.push(key); records.delete(key);
    }), scan,
  };
  const reset = () => { reads.length = 0; writes.length = 0; deletes.length = 0; };
  function corrupt(key: string, change: (row: CanonicalRecord) => void) { change(records.get(key)!); }
  return { pages, records, reads, writes, deletes, reset, corrupt, row };
}
