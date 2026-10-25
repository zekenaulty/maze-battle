import { describe, expect, it } from 'vitest';
import type { BattleHeader } from './types';
import { loadBattle, saveBattle } from './records';
import { battle, combatFixture, enemyKey, item, lootKey } from './combat.test-support';

describe('canonical combat exact records', () => {
  it('treats an absent combat header as an old save, without scanning or writing', async () => {
    const f = combatFixture(); expect(await loadBattle(f.pages)).toBeNull();
    expect(f.reads).toEqual(['combat/current']); expect(f.writes).toEqual([]); expect(f.deletes).toEqual([]);
    expect(f.pages.scan).not.toHaveBeenCalled();
  });

  it.each(['manual', 'auto-play', 'waves'] as const)('round-trips all frame state in %s mode', async returnMode => {
    const f = combatFixture(), state = battle(); state.battle.returnMode = returnMode;
    const original = structuredClone(state); await saveBattle(f.pages, null, state);
    expect(state).toEqual(original); expect(await loadBattle(f.pages)).toEqual(state);
    expect(f.records.size).toBe(4);
    const header = f.records.get('combat/current')!.value as unknown as BattleHeader;
    expect(header.battle.enemyIds).toEqual(['enemy']); expect(header.battle.defeatedIds).toEqual(['dead']); expect(header.battle.lootIds).toEqual(['loot']);
    expect(header.battle).not.toHaveProperty('enemies'); expect(header.battle).not.toHaveProperty('loot');
    expect(f.pages.scan).not.toHaveBeenCalled();
  });

  it('encodes only documented optional undefined fields and preserves absence versus empty arrays', async () => {
    const f = combatFixture(), state = battle();
    state.battle.defeated = undefined; state.battle.loot = undefined; state.battle.rewardGold = undefined; state.battle.returnMode = undefined;
    state.battle.enemies[0].monsterId = undefined; state.battle.enemies[0].gcdUntil = undefined;
    state.battle.enemies[0].skills[0].rechargeUntil = undefined;
    await saveBattle(f.pages, null, state);
    const loaded = (await loadBattle(f.pages))!;
    expect(loaded).toEqual(JSON.parse(JSON.stringify(state)));
    expect(loaded.battle).not.toHaveProperty('defeated'); expect(loaded.battle).not.toHaveProperty('loot');
    const next = structuredClone(loaded); next.battle.loot = []; next.battle.defeated = [];
    await saveBattle(f.pages, loaded, next); expect(await loadBattle(f.pages)).toEqual(next);
  });

  it('does not rewrite unchanged rows, including property order changes', async () => {
    const f = combatFixture(), state = battle(); await saveBattle(f.pages, null, state); f.reset();
    const next = { stalledTicks: state.stalledTicks, origin: state.origin, battle: state.battle, schema: 1 as const };
    await saveBattle(f.pages, state, next);
    expect(f.writes).toEqual([]); expect(f.deletes).toEqual([]); expect(f.reads).toHaveLength(4);
  });

  it('writes only changed header/enemy/item rows, retaining every other row version', async () => {
    const f = combatFixture(), state = battle(); await saveBattle(f.pages, null, state);
    const deadRow = structuredClone(f.records.get(enemyKey('battle', 'dead'))); f.reset();
    const next = structuredClone(state); next.stalledTicks++; next.battle.enemies[0].hp--; next.battle.loot![0].locked = true;
    await saveBattle(f.pages, state, next);
    expect(f.writes).toEqual(['combat/current', enemyKey(), lootKey()]); expect(f.deletes).toEqual([]);
    expect(f.records.get(enemyKey('battle', 'dead'))).toEqual(deadRow); expect(await loadBattle(f.pages)).toEqual(next);
  });

  it('moves a defeated enemy between header lists without an orphan or redundant delete', async () => {
    const f = combatFixture(), state = battle(); await saveBattle(f.pages, null, state); f.reset();
    const next = structuredClone(state); next.battle.enemies[0].hp = 0;
    next.battle.defeated!.push(next.battle.enemies.pop()!); next.battle.status = 'won';
    await saveBattle(f.pages, state, next);
    expect(f.deletes).toEqual([]); expect(f.writes).toEqual(['combat/current', enemyKey()]);
    expect(f.records.size).toBe(4); expect(await loadBattle(f.pages)).toEqual(next);
  });

  it('deletes only header-owned children on replacement and settlement, without enumeration', async () => {
    const f = combatFixture(), state = battle(); await saveBattle(f.pages, null, state);
    const unrelated = 'combat/other/enemy/retained'; f.records.set(unrelated, f.row(unrelated, { retained: true }));
    const next = structuredClone(state); next.battle.id = 'replacement'; next.battle.loot = [item('new-loot')];
    f.reset(); await saveBattle(f.pages, state, next);
    expect(new Set(f.deletes)).toEqual(new Set([enemyKey(), enemyKey('battle', 'dead'), lootKey()]));
    expect(f.records.size).toBe(5); expect(await loadBattle(f.pages)).toEqual(next);
    f.reset(); await saveBattle(f.pages, next, null);
    expect(f.records.size).toBe(1); expect(f.records.has(unrelated)).toBe(true);
    expect(new Set(f.deletes)).toEqual(new Set(['combat/current', enemyKey('replacement'), enemyKey('replacement', 'dead'), lootKey('replacement', 'new-loot')]));
    expect(await loadBattle(f.pages)).toBeNull(); expect(f.pages.scan).not.toHaveBeenCalled();
  });

  it('deletes removed loot by retained IDs and performs no writes for null to null', async () => {
    const f = combatFixture(), state = battle(); await saveBattle(f.pages, null, null); expect(f.writes).toEqual([]);
    await saveBattle(f.pages, null, state); const next = structuredClone(state); next.battle.loot = [];
    f.reset(); await saveBattle(f.pages, state, next);
    expect(f.deletes).toEqual([lootKey()]); expect(f.writes).toEqual(['combat/current']); expect(await loadBattle(f.pages)).toEqual(next);
  });

  it('refuses stale prior state and occupied new identities before staging mutations', async () => {
    const f = combatFixture(), state = battle(); await saveBattle(f.pages, null, state);
    const stale = structuredClone(state); stale.stalledTicks++; f.reset();
    await expect(saveBattle(f.pages, stale, null)).rejects.toThrow('stale battle prior');
    await expect(saveBattle(f.pages, null, state)).rejects.toThrow('stale battle prior');
    expect(f.writes).toEqual([]); expect(f.deletes).toEqual([]);
    const next = structuredClone(state); next.battle.id = 'replacement'; next.battle.loot!.push(item('occupied'));
    const key = lootKey('replacement', 'occupied'); f.records.set(key, f.row(key, { foreign: true }));
    await expect(saveBattle(f.pages, state, next)).rejects.toThrow('identity already exists');
    expect(f.writes).toEqual([]); expect(f.deletes).toEqual([]);
  });
});
