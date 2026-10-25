import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../../domain/combat/skillCatalog';
import type { ItemStats, SkillId } from '../../../domain/types';
import { MAX_RECORD_BYTES } from '../types';
import { jsonBytes } from '../validation';
import { loadBattle, saveBattle } from './records';
import { battle, combatFixture, enemy, item } from './combat.test-support';

function maximal() {
  const state = battle(), n = Number.MAX_SAFE_INTEGER, identity = (i: number) => String(i).padEnd(128, 'x');
  const stats: ItemStats = { strength: n, vitality: n, intellect: n, maxHp: n, maxMp: n, baseDamage: n };
  state.battle.id = 'b'.repeat(128); state.stalledTicks = n; state.battle.wave = n; state.battle.round = n; state.battle.rewardGold = n;
  state.origin = { level: n, cell: { spaceId: 'r'.repeat(128), row: 511, column: 511 } };
  state.battle.log = Array(20).fill('\uffff'.repeat(512));
  const enemies = Array.from({ length: 10 }, (_, i) => ({ ...enemy(identity(i)), monsterId: 'm'.repeat(128),
    displayName: '\uffff'.repeat(160), token: '\uffff'.repeat(32), level: n, hp: i < 5 ? n : 0, maxHp: n, mp: n, maxMp: n, gcdUntil: n,
    tags: ['vermin', 'beast', 'undead', 'reptile', 'arcane', 'construct', 'ooze'] as const,
    attributes: { strength: n, vitality: n, intellect: n, available: n }, combat: { baseDamage: n, scaleWith: 'intellect' as const },
    skills: (Object.keys(SKILLS) as SkillId[]).map(id => ({ id, cooldown: n, cooldownUntil: n, rechargeUntil: n, charges: n, maxCharges: n })) }));
  state.battle.enemies = enemies.slice(0, 5).map(e => ({ ...e, tags: [...e.tags] }));
  state.battle.defeated = enemies.slice(5).map(e => ({ ...e, tags: [...e.tags] }));
  state.battle.loot = Array.from({ length: 20 }, (_, i) => ({ ...item(identity(i)), baseId: 'i'.repeat(128),
    questId: 'q'.repeat(128), displayName: 'x'.repeat(160), token: 'x'.repeat(32), rarity: 'legendary' as const,
    itemLevel: n, value: n, stackSellValue: n, quantity: 1, locked: true, stats,
    affixes: Array.from({ length: 8 }, (_, j) => ({ id: identity(j), name: 'a'.repeat(160), stats })),
    legendaryPower: { id: 'p'.repeat(128), name: 'p'.repeat(160), description: 'd'.repeat(1024), stats } }));
  return state;
}

describe('bounded combat frame storage', () => {
  it('splits a maximum 10-enemy/20-loot frame larger than 64 KiB into safe records and exactly 31 reads', async () => {
    const f = combatFixture(128), state = maximal();
    expect(new TextEncoder().encode(JSON.stringify(state)).byteLength).toBeGreaterThan(MAX_RECORD_BYTES);
    await saveBattle(f.pages, null, state);
    expect(f.records.size).toBe(31); expect(f.reads).toHaveLength(31); expect(f.writes).toHaveLength(31);
    for (const row of f.records.values()) expect(jsonBytes(row)).toBeLessThanOrEqual(MAX_RECORD_BYTES);
    f.reset(); expect(await loadBattle(f.pages)).toEqual(state);
    expect(f.reads).toHaveLength(31); expect(new Set(f.reads).size).toBe(31); expect(f.pages.scan).not.toHaveBeenCalled();
  });

  it('bounds disjoint replacement at 61 reads/61 mutations, then deletes all 31 retained rows', async () => {
    const f = combatFixture(), state = maximal(); await saveBattle(f.pages, null, state); f.reset();
    const next = structuredClone(state); next.battle.id = 'new-battle';
    await saveBattle(f.pages, state, next);
    expect(f.reads).toHaveLength(61); expect(f.deletes).toHaveLength(30); expect(f.writes).toHaveLength(31);
    expect(f.records.size).toBe(31); expect(await loadBattle(f.pages)).toEqual(next);
    f.reset(); await saveBattle(f.pages, next, null);
    expect(f.reads).toHaveLength(31); expect(f.deletes).toHaveLength(31); expect(f.records.size).toBe(0);
    expect(f.pages.scan).not.toHaveBeenCalled();
  });

  it('enforces the header byte bound rather than truncating even a legal-count log', async () => {
    const f = combatFixture(), state = maximal(); state.battle.log = Array(20).fill('\u0000'.repeat(512));
    await expect(saveBattle(f.pages, null, state)).rejects.toThrow('record exceeds');
    expect(f.reads).toEqual([]); expect(f.writes).toEqual([]); expect(f.deletes).toEqual([]);
  });

  it('round-trips the longest JSON escapes within the header byte bound', async () => {
    const f = combatFixture(128), state = maximal(); state.battle.log = Array(20).fill('\u0000'.repeat(480));
    await saveBattle(f.pages, null, state); expect(await loadBattle(f.pages)).toEqual(state);
    for (const row of f.records.values()) expect(jsonBytes(row)).toBeLessThanOrEqual(MAX_RECORD_BYTES);
  });
});
