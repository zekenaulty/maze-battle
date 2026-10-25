import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKILLS } from '../../../domain/combat/skillCatalog';
import { executeBattleTurn } from '../../../domain/combat/battleTurn';
import { getEquipmentStats } from '../../../domain/items/equipment';
import type { SkillId } from '../../../domain/types';
import { mechanicsFixture } from './mechanics.test-support';
import { executeBattleCommand } from './command';
import { enemy } from './combat.test-support';

afterEach(() => vi.restoreAllMocks());
async function ready() {
  const f = await mechanicsFixture(); f.storage.install(); vi.spyOn(Math, 'random').mockReturnValue(0.5); vi.spyOn(Date, 'now').mockReturnValue(10_000);
  await executeBattleCommand(f.request({ kind: 'start', returnMode: 'manual' }));
  await f.editBattle(b => { b.paused = true; b.battle.enemies = [{ ...enemy(), hp: 100_000, maxHp: 100_000, gcdUntil: 0 }]; });
  return f;
}

describe('canonical manual skills preserve the shared core', () => {
  it.each(Object.keys(SKILLS) as SkillId[])('executes %s with identical core effects and enemy response while paused', async skillId => {
    const f = await ready();
    await f.editParty(s => {
      s.party.forEach((a, i) => { a.autoBattle = false; a.hp = i === 1 ? 0 : Math.ceil(a.maxHp / 2); a.mp = a.maxMp = 1000; a.gcdUntil = 0; });
      s.party[0].skills = (Object.keys(SKILLS) as SkillId[]).map(id => ({ id, cooldown: 0,
        ...(SKILLS[id].rechargeMs ? { charges: 2, maxCharges: 2 } : {}) }));
    });
    const b = (await f.current())!, roster = (await f.roster()).state, actorId = roster.party[0].id;
    const expected = executeBattleTurn({ party: roster.party, battle: b.battle,
      equipmentBonuses: Object.fromEntries(roster.party.map(a => [a.id, getEquipmentStats(a, roster.inventory)])) },
    { kind: 'skill', actorId, skillId }, () => 0.5, 10_000);
    expect(expected.acted).toBe(true);
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId, skillId }));
    const next = (await f.current())!;
    expect((await f.roster()).state.party).toEqual(expected.context.party); expect(next.battle.enemies).toEqual(expected.context.enemies);
    expect(next.battle.log).toEqual(expected.context.log.slice(-20)); expect(next.battle.round).toBe(b.battle.round + 1); expect(next.paused).toBe(true);
  });

  it('refuses GCD/cooldown/empty-charge skills without an enemy turn, and persists recharge on the next accepted action', async () => {
    const f = await ready(), b = (await f.current())!;
    await f.editParty(s => { const a = s.party[0]; a.gcdUntil = 0; a.skills = [{ id: 'cleave', cooldown: 0, charges: 1, maxCharges: 1 }]; });
    const actorId = (await f.roster()).state.party[0].id;
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId, skillId: 'cleave' }));
    const used = (await f.roster()).state.party[0]; expect(used.gcdUntil).toBe(10_250); expect(used.skills[0].charges).toBe(0);
    const before = f.head().roots;
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId, skillId: 'cleave' })); expect(f.head().roots).toEqual(before);
    vi.spyOn(Date, 'now').mockReturnValue(11_000);
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId, skillId: 'cleave' })); expect(f.head().roots).toEqual(before);
    vi.spyOn(Date, 'now').mockReturnValue(13_000);
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId, skillId: 'cleave' }));
    expect((await f.current())!.battle.round).toBe(b.battle.round + 2);
    expect((await f.roster()).state.party[0].skills[0].rechargeUntil).toBe(15_500);
  });

  it('does not accept an actor that is not in the authoritative roster or a skill that actor does not own', async () => {
    const f = await ready(), b = (await f.current())!, before = f.head().roots;
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId: 'foreign', skillId: 'slash' }));
    expect(f.head().roots).toEqual(before);
    const actorId = (await f.roster()).state.party[0].id;
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId, skillId: 'teleport' })); expect(f.head().roots).toEqual(before);
  });
});
