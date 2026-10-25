import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeBattleCommand } from './command';
import { mechanicsFixture } from './mechanics.test-support';
import { enemy, item } from './combat.test-support';
import { gameCheckpoint } from '../game/checkpoint';
import { projectGameSnapshot } from '../game/projection';
import { executeRosterCommand } from '../game/rosterCommand';
import { executeSaveCommand } from '../game/manualSaves';
import { monsterXp } from '../../../domain/combat/rewards';

afterEach(() => vi.restoreAllMocks());
async function started(returnMode: 'manual' | 'auto-play' | 'waves' = 'manual') {
  const f = await mechanicsFixture(); f.storage.install(); vi.spyOn(Math, 'random').mockReturnValue(0);
  await executeBattleCommand(f.request({ kind: 'start', returnMode })); return f;
}

describe('canonical battle lifecycle and kernel receipts', () => {
  it('starts from a real prepared anchor and projects bounded combat without changing boot settings', async () => {
    const f = await started(), current = (await f.current())!;
    expect(current.origin).toEqual(gameCheckpoint(f.head().checkpoint).position); expect(current.battle.enemies).toHaveLength(1);
    expect(gameCheckpoint(f.head().checkpoint).mode).toBe('battle');
    const view = await f.read((p, h) => projectGameSnapshot(p, h));
    expect(view.battle).toEqual(current.battle); expect(view.battleAutomationPaused).toBe(false); expect(view.randomBattles).toBe(false);
    expect(await f.read(p => p.get('world', 'game/settings'))).toMatchObject({ value: { schema: 1, autoThrottleMs: 500 } });
  });

  it.each(['manual', 'auto-play', 'waves'] as const)('settles victory once and returns to %s with pending gold/loot and per-kill XP', async mode => {
    const f = await started(mode);
    await f.editBattle(b => { b.battle.enemies = [{ ...enemy('target', 1), maxHp: 1 }]; b.battle.rewardGold = 7; b.battle.loot = [item('pending')]; });
    const before = (await f.roster()).state, b = (await f.current())!;
    const request = f.request({ kind: 'skill', battleId: b.battle.id, actorId: before.party[0].id, skillId: 'slash' });
    const original = await executeBattleCommand(request), after = (await f.roster()).state;
    expect(await f.current()).toBeNull(); expect(after.inventory.gold).toBe(before.inventory.gold + 7);
    expect(after.inventory.items.some(i => i.id === 'pending')).toBe(true);
    expect(after.party[0].xp).toBe(before.party[0].xp + monsterXp(1));
    expect(gameCheckpoint(f.head().checkpoint)).toMatchObject({ mode, wave: mode === 'waves' ? b.battle.wave : 1, position: b.origin });
    const committed = f.storage.snapshot(), replay = await executeBattleCommand(request);
    expect(replay.replayed).toBe(true); expect(replay.receipt).toEqual(original.receipt); expect(f.storage.snapshot()).toEqual(committed);
    const newId = f.request({ kind: 'round', battleId: b.battle.id });
    await expect(executeBattleCommand(newId)).rejects.toThrow('stale battle ID'); expect(f.storage.snapshot()).toEqual(committed);
  });

  it('aborts staged rewards, roster, battle deletion and receipt together on a storage write failure', async () => {
    const f = await started(); await f.editBattle(b => { b.battle.enemies = [{ ...enemy('target', 1), maxHp: 1 }]; b.battle.rewardGold = 11; b.battle.loot = [item('pending')]; });
    const b = (await f.current())!, actor = (await f.roster()).state.party[0];
    const request = f.request({ kind: 'skill', battleId: b.battle.id, actorId: actor.id, skillId: 'slash' }), before = f.storage.snapshot();
    f.storage.failOnce('records'); await expect(executeBattleCommand(request)).rejects.toThrow('Injected records failure');
    expect(f.storage.snapshot()).toEqual(before);
    const retry = await executeBattleCommand(request); expect(retry.replayed).toBe(false); expect(await f.current()).toBeNull();
    expect((await f.roster()).state.inventory.gold).toBe(111);
  });

  it('retains loss without payout, blocks ticks, and explicit End permits existing inn recovery', async () => {
    const f = await started('auto-play'); await f.editParty(s => { s.party.forEach(a => { a.hp = 1; a.autoBattle = false; }); });
    await f.editBattle(b => { b.battle.rewardGold = 17; b.battle.loot = [item('forfeit')];
      b.battle.enemies = Array.from({ length: 10 }, (_, i) => ({ ...enemy(`killer-${i}`), hp: 9999, maxHp: 9999, gcdUntil: 0,
        combat: { baseDamage: 1e6, scaleWith: 'strength' }, skills: [{ id: 'attack', cooldown: 0 }] })); });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const b = (await f.current())!, gold = (await f.roster()).state.inventory.gold;
    await executeBattleCommand(f.request({ kind: 'round', battleId: b.battle.id }));
    expect((await f.current())!.battle.status).toBe('lost'); expect(gameCheckpoint(f.head().checkpoint).mode).toBe('manual');
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, mode: 'waves', enabled: false }));
    expect(await f.current()).toMatchObject({ paused: true, battle: { returnMode: 'manual' } });
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, mode: 'waves', enabled: true }));
    expect(await f.current()).toMatchObject({ paused: true, battle: { status: 'lost', returnMode: 'manual' } });
    const lost = f.head().roots; await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id })); expect(f.head().roots).toEqual(lost);
    await executeBattleCommand(f.request({ kind: 'end', battleId: b.battle.id }));
    expect(await f.current()).toBeNull(); expect(gameCheckpoint(f.head().checkpoint)).toMatchObject({ mode: 'town', townReturnMode: 'manual' });
    expect((await f.roster()).state.inventory.gold).toBe(gold); expect((await f.roster()).state.inventory.items).toEqual([]);
    await executeRosterCommand(f.request({ kind: 'rest' }, 'roster.command'));
    expect((await f.roster()).state.party.every(a => a.hp === a.maxHp)).toBe(true);
  });

  it('abandons an active fight without paying pending victory rewards', async () => {
    const f = await started(); await f.editBattle(b => { b.battle.rewardGold = 9; b.battle.loot = [item()]; });
    const b = (await f.current())!, before = (await f.roster()).state;
    await executeBattleCommand(f.request({ kind: 'end', battleId: b.battle.id }));
    expect(await f.current()).toBeNull(); expect(gameCheckpoint(f.head().checkpoint).mode).toBe('manual');
    expect((await f.roster()).state.inventory).toEqual(before.inventory);
  });

  it('reopens from retained roots and manual save/restore retains battle identity, timers and pause metadata', async () => {
    const f = await started(); const b = (await f.current())!;
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, enabled: false, mode: 'manual' }));
    const retained = (await f.current())!, save = f.request({ kind: 'create', label: 'Battle' }, 'save.command');
    await executeSaveCommand(save);
    await executeBattleCommand(f.request({ kind: 'end', battleId: b.battle.id }));
    await executeSaveCommand(f.request({ kind: 'load', id: save.attemptId }, 'save.command'));
    expect(await f.current()).toEqual(retained); expect(gameCheckpoint(f.head().checkpoint).mode).toBe('battle');
    const view = await f.read((p, h) => projectGameSnapshot(p, h)); expect(view.battleAutomationPaused).toBe(true);
    expect(view.battle).toEqual(retained.battle);
  });
});
