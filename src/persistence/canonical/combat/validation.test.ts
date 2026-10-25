import { describe, expect, it, vi } from 'vitest';
import type { CanonicalRecord } from '../types';
import { loadBattle, saveBattle } from './records';
import { encodeBattle } from './validation';
import { battle, combatFixture, enemy, enemyKey, item, lootKey } from './combat.test-support';

type Mutate = (state: any) => void;
const invalid: [string, Mutate][] = [
  ['schema', s => s.schema = 2],
  ['extra root', s => s.unknown = undefined],
  ['legacy origin', s => s.battle.origin = { floor: 1 }],
  ['unsafe battle ID', s => s.battle.id = '../other'],
  ['invalid return mode', s => s.battle.returnMode = 'town'],
  ['unknown status', s => s.battle.status = 'pending'],
  ['won with survivors', s => s.battle.status = 'won'],
  ['active with no enemies', s => s.battle.enemies = []],
  ['zero wave', s => s.battle.wave = 0],
  ['fractional round', s => s.battle.round = 1.5],
  ['unsafe stalled counter', s => s.stalledTicks = Number.MAX_SAFE_INTEGER + 1],
  ['negative pending gold', s => s.battle.rewardGold = -1],
  ['unbounded log', s => s.battle.log = Array(21).fill('entry')],
  ['unbounded log text', s => s.battle.log = ['x'.repeat(513)]],
  ['foreign origin shape', s => s.origin.cell.hidden = 1],
  ['invalid origin level', s => s.origin.level = 0],
  ['out of range cell', s => s.origin.cell.row = 512],
  ['duplicate living IDs', s => s.battle.enemies.push(enemy())],
  ['duplicate living/defeated ID', s => s.battle.defeated = [enemy('enemy', 0)]],
  ['eleven total enemies', s => s.battle.defeated = Array.from({ length: 10 }, (_, i) => enemy(`dead-${i}`, 0))],
  ['twenty-one loot rows', s => s.battle.loot = Array.from({ length: 21 }, (_, i) => item(`loot-${i}`))],
  ['duplicate loot ID', s => s.battle.loot.push(item())],
  ['dead survivor', s => s.battle.enemies[0].hp = 0],
  ['living defeated', s => s.battle.defeated[0].hp = 1],
  ['excess health', s => s.battle.enemies[0].hp = 13],
  ['excess mana', s => s.battle.enemies[0].mp = 11],
  ['zero maximum health', s => s.battle.enemies[0].maxHp = 0],
  ['missing resources', s => delete s.battle.enemies[0].mp],
  ['nonfinite resource', s => s.battle.enemies[0].hp = NaN],
  ['unsafe damage', s => s.battle.enemies[0].combat.baseDamage = Number.MAX_SAFE_INTEGER + 1],
  ['unknown scaling', s => s.battle.enemies[0].combat.scaleWith = 'luck'],
  ['fractional attribute', s => s.battle.enemies[0].attributes.strength = 0.5],
  ['unknown monster tag', s => s.battle.enemies[0].tags = ['hidden']],
  ['duplicate monster tag', s => s.battle.enemies[0].tags = ['beast', 'beast']],
  ['unknown skill', s => s.battle.enemies[0].skills[0].id = 'futureSkill'],
  ['duplicate skill', s => s.battle.enemies[0].skills.push(s.battle.enemies[0].skills[0])],
  ['negative GCD', s => s.battle.enemies[0].gcdUntil = -1],
  ['nonfinite cooldown', s => s.battle.enemies[0].skills[0].cooldown = Infinity],
  ['unsafe cooldown expiry', s => s.battle.enemies[0].skills[0].cooldownUntil = Number.MAX_SAFE_INTEGER + 1],
  ['negative recharge expiry', s => s.battle.enemies[0].skills[0].rechargeUntil = -1],
  ['zero maximum charges', s => s.battle.enemies[0].skills[1].maxCharges = 0],
  ['fractional charges', s => s.battle.enemies[0].skills[1].charges = 1.5],
  ['excess charges', s => s.battle.enemies[0].skills[1].charges = 4],
  ['charges without maximum', s => delete s.battle.enemies[0].skills[1].maxCharges],
  ['invalid item via reused validator', s => s.battle.loot[0].slot = 'futureSlot'],
  ['unknown undefined enemy field', s => s.battle.enemies[0].unknown = undefined],
];

describe('strict combat validation', () => {
  it.each(invalid)('rejects %s before any reads or staged mutations', async (_name, change) => {
    const f = combatFixture(), state = battle(); change(state);
    await expect(saveBattle(f.pages, null, state)).rejects.toThrow('Canonical storage:');
    expect(f.reads).toEqual([]); expect(f.writes).toEqual([]); expect(f.deletes).toEqual([]);
  });

  it('rejects getters, cycles, sparse lists, symbols and nonplain split containers without invoking getters', () => {
    const getter = vi.fn(() => []), state = battle();
    Object.defineProperty(state.battle, 'enemies', { enumerable: true, get: getter });
    expect(() => encodeBattle(state)).toThrow(); expect(getter).not.toHaveBeenCalled();
    const sparse = battle(); sparse.battle.loot = new Array(2);
    const symbolic = battle(); Object.assign(symbolic.battle.enemies, { [Symbol('hidden')]: true });
    const cyclic = battle(); Object.assign(cyclic.battle.enemies[0], { attributes: cyclic });
    const exotic = battle(); Object.setPrototypeOf(exotic.battle, { inherited: true });
    for (const value of [sparse, symbolic, cyclic, exotic]) expect(() => encodeBattle(value)).toThrow();
  });

  it('never invokes custom collection prototype methods while encoding split rows', () => {
    const state = battle(), map = vi.fn(() => { throw Error('Untrusted map'); });
    Object.setPrototypeOf(state.battle.enemies, { map });
    expect(encodeBattle(state).header.battle.enemyIds).toEqual(['enemy']); expect(map).not.toHaveBeenCalled();
  });
});

type Corrupt = (f: ReturnType<typeof combatFixture>) => void;
function child(change: (row: CanonicalRecord, value: any) => void): Corrupt {
  return f => f.corrupt(enemyKey(), row => change(row, row.value));
}
const corrupt: [string, Corrupt][] = [
  ['dangling living child', f => f.records.delete(enemyKey())],
  ['dangling defeated child', f => f.records.delete(enemyKey('battle', 'dead'))],
  ['dangling loot child', f => f.records.delete(lootKey())],
  ['foreign battle ID', child((_r, v) => v.battleId = 'foreign')],
  ['mismatched row ID', child((_r, v) => v.enemy.id = 'foreign')],
  ['foreign game', child(r => r.gameId = 'foreign')],
  ['foreign generation', child(r => r.generation = 'foreign')],
  ['wrong key', child(r => r.key = enemyKey('foreign'))],
  ['wrong area', child(r => r.area = 'execution')],
  ['foreign indexes', child(r => r.indexes = ['foreign'])],
  ['malformed child schema', child((_r, v) => v.schema = 2)],
  ['stored undefined (not repaired)', child((_r, v) => v.enemy.gcdUntil = undefined)],
  ['stored invalid resources', child((_r, v) => v.enemy.hp = -1)],
  ['duplicate header references', f => f.corrupt('combat/current', r => (r.value as any).battle.enemyIds.push('enemy'))],
  ['overlap header references', f => f.corrupt('combat/current', r => (r.value as any).battle.defeatedIds.push('enemy'))],
  ['foreign loot ID', f => f.corrupt(lootKey(), r => (r.value as any).item.id = 'foreign')],
  ['foreign loot owner', f => f.corrupt(lootKey(), r => (r.value as any).battleId = 'foreign')],
  ['invalid header ownership', f => f.corrupt('combat/current', r => r.key = 'combat/foreign')],
  ['unbounded header', f => f.corrupt('combat/current', r => (r.value as any).battle.lootIds = Array(21).fill('id'))],
];

describe('stored combat corruption is not repaired or deleted', () => {
  it.each(corrupt)('refuses %s on both load and save', async (_name, change) => {
    const f = combatFixture(), state = battle(); await saveBattle(f.pages, null, state); f.reset(); change(f);
    await expect(loadBattle(f.pages)).rejects.toThrow('Canonical storage:');
    await expect(saveBattle(f.pages, state, null)).rejects.toThrow('Canonical storage:');
    expect(f.writes).toEqual([]); expect(f.deletes).toEqual([]); expect(f.pages.scan).not.toHaveBeenCalled();
  });
});
