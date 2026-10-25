import { afterEach, describe, expect, it, vi } from 'vitest';
import { xpForNextLevel } from '../../../domain/combat/rewards';
import { executeBattleCommand } from '../combat/command';
import { enemy, item } from '../combat/combat.test-support';
import { memoryStorage } from '../combat/storage.test-support';
import { snapshotOf } from '../read';
import { started, trace } from './gameplay.test-support';
import { readGameplayTelemetry } from './records';

afterEach(() => vi.restoreAllMocks());

describe('atomic canonical combat trace', () => {
  it.each(['manual', 'auto-play', 'waves'] as const)('retains actual %s victory facts, XP rollover and payout exactly once across reopen', async mode => {
    const f = await started(mode);
    await f.editParty(s => { s.party[0].xp = xpForNextLevel(s.party[0].level) - 1; });
    await f.editBattle(b => { b.battle.enemies = [{ ...enemy('target', 1), maxHp: 1 }]; b.battle.rewardGold = 7; b.battle.loot = [item('pending')]; });
    const before = (await f.roster()).state, b = (await f.current())!, pinned = snapshotOf(f.head());
    const request = f.request({ kind: 'skill', battleId: b.battle.id, actorId: before.party[0].id, skillId: 'slash' });
    const original = await executeBattleCommand(request), after = (await f.roster()).state, log = await trace(f);
    expect(log.events.map(e => e.fact.kind === 'battle' && e.fact.event)).toEqual(['started', 'won']);
    const event = log.events[1]; expect(event.revision).toBe(original.receipt.afterRevision);
    expect(event.fact).toMatchObject({ kind: 'battle', event: 'won', trigger: 'skill', skillId: 'slash', returnMode: mode,
      newlyDefeatedCount: 1, pendingGold: { before: 7, after: 0 }, pendingLootCount: { before: 1, after: 0 }, walletGoldDelta: 7, lootAwardCount: 1 });
    if (event.fact.kind !== 'battle') throw Error('Expected battle fact');
    expect(event.fact.actors[0]).toMatchObject({ id: before.party[0].id, before: { level: before.party[0].level, xp: before.party[0].xp },
      after: { level: after.party[0].level, xp: after.party[0].xp } });
    expect(after.party[0].level).toBe(before.party[0].level + 1); expect(after.party[0].xp).toBeLessThan(before.party[0].xp);
    expect(event.fact).not.toHaveProperty('damage'); expect(event.fact).not.toHaveProperty('xpGained');
    expect((await readGameplayTelemetry(pinned)).events).toHaveLength(1);
    const stored = f.storage.snapshot(); expect((await executeBattleCommand(request)).replayed).toBe(true); expect(f.storage.snapshot()).toEqual(stored);
    const reopened = memoryStorage(stored); reopened.install();
    expect((await readGameplayTelemetry(snapshotOf(f.head()))).events).toEqual(log.events);
  });

  it.each(['records', 'receipts', 'heads'])('rolls rewards, trace and receipt back on %s failure, then records only the committed retry', async store => {
    const f = await started(); await f.editBattle(b => { b.battle.enemies = [{ ...enemy('target', 1), maxHp: 1 }]; b.battle.rewardGold = 11; });
    const b = (await f.current())!, actor = (await f.roster()).state.party[0];
    const request = f.request({ kind: 'skill', battleId: b.battle.id, actorId: actor.id, skillId: 'slash' }), before = f.storage.snapshot();
    f.storage.failOnce(store); await expect(executeBattleCommand(request)).rejects.toThrow(`Injected ${store} failure`);
    expect(f.storage.snapshot()).toEqual(before); expect((await trace(f)).events).toHaveLength(1);
    await executeBattleCommand(request); expect((await trace(f)).events).toHaveLength(2);
    const committed = f.storage.snapshot(); await executeBattleCommand(request); expect(f.storage.snapshot()).toEqual(committed);
  });

  it('distinguishes abandonment from victory without crediting pending rewards', async () => {
    const f = await started(); await f.editBattle(b => { b.battle.rewardGold = 9; b.battle.loot = [item()]; });
    const b = (await f.current())!, gold = (await f.roster()).state.inventory.gold;
    await executeBattleCommand(f.request({ kind: 'end', battleId: b.battle.id }));
    expect((await trace(f)).events.at(-1)?.fact).toMatchObject({ event: 'abandoned', walletGoldDelta: 0, lootAwardCount: 0,
      pendingGold: { before: 9, after: 0 }, pendingLootCount: { before: 1, after: 0 } });
    expect((await f.roster()).state.inventory.gold).toBe(gold);
  });

  it('records loss and explicit lost closure without a victory payout', async () => {
    const f = await started('auto-play'); await f.editParty(s => { s.party.forEach(a => { a.hp = 1; a.autoBattle = false; }); });
    await f.editBattle(b => { b.battle.rewardGold = 17; b.battle.loot = [item('forfeit')];
      b.battle.enemies = Array.from({ length: 10 }, (_, i) => ({ ...enemy(`killer-${i}`), hp: 9999, maxHp: 9999, gcdUntil: 0,
        combat: { baseDamage: 1e6, scaleWith: 'strength' }, skills: [{ id: 'attack', cooldown: 0 }] })); });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const b = (await f.current())!; await executeBattleCommand(f.request({ kind: 'round', battleId: b.battle.id }));
    expect((await trace(f)).events.at(-1)?.fact).toMatchObject({ event: 'lost', status: 'lost', walletGoldDelta: 0,
      pendingGold: { before: 17, after: 17 }, lootAwardCount: 0, paused: true });
    await executeBattleCommand(f.request({ kind: 'end', battleId: b.battle.id }));
    expect((await trace(f)).events.at(-1)?.fact).toMatchObject({ event: 'closed-lost', walletGoldDelta: 0, lootAwardCount: 0,
      pendingGold: { before: 17, after: 0 } });
  });
});
