import type { CanonicalPages } from '../pages';
import { encodeRoster } from '../roster/codec';
import type { CanonicalRecord, GameIdentity, Json } from '../types';
import { check, record, validId } from '../validation';
import { same } from '../world/records';
import type { BattleRows, CanonicalBattle } from './types';
import { battleEnemy, battleHeader, battleLoot, encodeBattle } from './validation';

type Read = Pick<CanonicalPages, 'get'>;
type Write = Pick<CanonicalPages, 'get' | 'set' | 'delete'>;
const current = 'combat/current';
function childKey(battleId: string, kind: 'enemy' | 'loot', id: string) {
  check(validId(battleId) && validId(id), 'invalid battle child identity'); return `combat/${battleId}/${kind}/${id}`;
}
function owned(row: CanonicalRecord | undefined, key: string, scope?: GameIdentity): asserts row is CanonicalRecord {
  check(row, `missing battle record: ${key}`); record(row, row.id, scope ?? row, 'world', `record/${key}`);
  check(row.key === key && row.indexes.length === 0, 'invalid battle record ownership');
}

async function loadRows(pages: Read): Promise<BattleRows | null> {
  const row = await pages.get('world', current);
  if (!row) return null;
  owned(row, current);
  const header = battleHeader(row.value), b = header.battle;
  const enemies: BattleRows['enemies'] = new Map(), loot: BattleRows['loot'] = new Map();
  for (const [ids, defeated] of [[b.enemyIds, false], [b.defeatedIds ?? [], true]] as const) {
    for (const id of ids) {
      const key = childKey(b.id, 'enemy', id), child = await pages.get('world', key); owned(child, key, row);
      enemies.set(id, battleEnemy(child.value, b.id, id, defeated));
    }
  }
  for (const id of b.lootIds ?? []) {
    const key = childKey(b.id, 'loot', id), child = await pages.get('world', key); owned(child, key, row);
    loot.set(id, battleLoot(child.value, b.id, id));
  }
  return { header, enemies, loot };
}

/** At most 31 exact world-key reads; an absent header is compatible with pre-combat v9 saves. */
export async function loadBattle(pages: Read): Promise<CanonicalBattle | null> {
  const rows = await loadRows(pages);
  if (!rows) return null;
  const { enemyIds, defeatedIds, lootIds, ...metadata } = rows.header.battle;
  return { ...rows.header, battle: { ...metadata, enemies: enemyIds.map(id => rows.enemies.get(id)!.enemy),
    ...(defeatedIds === undefined ? {} : { defeated: defeatedIds.map(id => rows.enemies.get(id)!.enemy) }),
    ...(lootIds === undefined ? {} : { loot: lootIds.map(id => rows.loot.get(id)!.item) }) } };
}

function records(rows: BattleRows | null) {
  const result = new Map<string, Json>();
  if (rows) {
    result.set(current, encodeRoster(rows.header));
    for (const [id, enemy] of rows.enemies) result.set(childKey(rows.header.battle.id, 'enemy', id), encodeRoster(enemy));
    for (const [id, item] of rows.loot) result.set(childKey(rows.header.battle.id, 'loot', id), encodeRoster(item));
  }
  return result;
}

/** At most 61 exact reads and 61 mutations, staged inside the caller's canonical transaction. */
export async function saveBattle(pages: Write, prior: CanonicalBattle | null, next: CanonicalBattle | null): Promise<void> {
  const before = records(prior === null ? null : encodeBattle(prior));
  const after = records(next === null ? null : encodeBattle(next));
  const stored = records(await loadRows(pages));
  check(before.size === stored.size && [...before].every(([key, value]) => stored.has(key) && same(value, stored.get(key))), 'stale battle prior');
  // Complete all validation/collision reads before staging any mutation.
  for (const key of after.keys())
    if (key !== current && !before.has(key)) check(!await pages.get('world', key), 'battle child identity already exists');
  for (const key of before.keys()) if (!after.has(key)) await pages.delete('world', key);
  for (const [key, value] of after) if (!before.has(key) || !same(before.get(key), value)) await pages.set('world', key, value);
}
