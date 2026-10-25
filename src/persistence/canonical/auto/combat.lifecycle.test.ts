import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameCheckpoint } from '../game/checkpoint';
import { executeAutoCommand } from './command';
import { autoCombatFixture } from './combat.test-support';
import { enemy } from '../combat/combat.test-support';
import { monsterXp } from '../../../domain/combat/rewards';
import { executeBattleCommand } from '../combat/command';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Auto shared combat and kill work', () => {
  it('accepts kill offers as real quests, not permanent combatRequired blockers before acceptance', async () => {
    const f = await autoCombatFixture();
    expect(f.board.offers.some(c => c.objective === 'kill')).toBe(true); expect(f.board.combatRequired).toBe(false);
    expect(f.accepted).toHaveLength(f.board.offers.length); expect((await f.guild()).combatRequired).toBe(true);
    expect((await f.quest())!.quest.status).toBe('active'); expect(await f.current()).toBeNull();
  });

  it('starts and settles enough shared battles to complete a selected kill quest, then claims and resumes floor work', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0);
    let now = Date.now(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    const before = (await f.roster()).state, required = f.contract.task.required;
    for (let n = 0; n < required; n++) {
      const start = (await f.tick()).receipt.result;
      expect(start).toMatchObject({ outcome: 'applied', rosterChanged: true, action: { kind: 'start', channel: 'battle' } });
      const b = (await f.current())!;
      expect(b.origin.cell.spaceId).toBe(f.contract.targetRoomId); expect(b.battle.returnMode).toBe('auto-play');
      await f.editBattle(b => { b.battle.enemies = [{ ...enemy(`kill-${n}`, 1), maxHp: 1 }]; });
      now += 10_000; vi.setSystemTime(now);
      const fight = (await f.tick()).receipt.result;
      expect(fight).toMatchObject({ outcome: 'applied', rosterChanged: true, action: { kind: 'tick', channel: 'battle' } });
      expect(await f.current()).toBeNull(); expect((await f.quest())!.quest.task.progress).toBe(n + 1);
      expect(gameCheckpoint(f.head().checkpoint).mode).toBe('auto-play');
      expect((await f.state())!.objective?.id).toBe(f.contract.id);
    }
    const won = (await f.roster()).state;
    expect(won.party[0].xp).toBe(before.party[0].xp + required * monsterXp(1));
    expect((await f.quest())!.quest.status).toBe('complete');
    const claim = (await f.tick()).receipt.result;
    expect(claim).toMatchObject({ outcome: 'applied', action: { kind: 'claim-quest', questId: f.contract.id, channel: 'content' } });
    expect((await f.roster()).state.inventory.gold).toBe(won.inventory.gold + f.contract.rewardGold);
    expect((await f.quest())!.quest.status).toBe('claimed'); expect((await f.guild()).combatRequired).toBe(false);
    expect((await f.tick()).receipt.result).not.toMatchObject({ outcome: 'blocked' });
    expect((await f.state())!.objective?.id).not.toBe(f.contract.id);
  });

  it('publishes battle entry and Auto progress atomically; exact attempt retry does not spawn twice', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0);
    const request = f.request({ kind: 'tick', revision: f.head().revision }, 'auto.command'), before = f.storage.snapshot();
    f.storage.failOnce('receipts'); await expect(executeAutoCommand(request)).rejects.toThrow('Injected receipts failure');
    expect(f.storage.snapshot()).toEqual(before); expect(await f.current()).toBeNull();
    const original = await executeAutoCommand(request), battle = await f.current(), committed = f.storage.snapshot();
    expect(battle).not.toBeNull(); expect((await f.state())!.lastRevision).toBe(f.head().revision);
    const replay = await executeAutoCommand(request); expect(replay.replayed).toBe(true); expect(replay.receipt).toEqual(original.receipt);
    expect(await f.current()).toEqual(battle); expect(f.storage.snapshot()).toEqual(committed);
  });

  it('rolls turn/quest/Auto progress back together, and replay cannot duplicate XP or rewards', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0); await f.tick();
    await f.editBattle(b => { b.battle.enemies = [{ ...enemy('one', 1), maxHp: 1 }]; });
    const request = f.request({ kind: 'tick', revision: f.head().revision }, 'auto.command'), before = f.storage.snapshot();
    f.storage.failOnce('records'); await expect(executeAutoCommand(request)).rejects.toThrow('Injected records failure');
    expect(f.storage.snapshot()).toEqual(before); expect((await f.quest())!.quest.task.progress).toBe(0);
    await executeAutoCommand(request); const committed = f.storage.snapshot();
    await executeAutoCommand(request); expect(f.storage.snapshot()).toEqual(committed); expect((await f.quest())!.quest.task.progress).toBe(1);
  });

  it('resumes the retained objective after the parent battle scheduler settles a fight outside auto.command', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0); await f.tick();
    const b = (await f.current())!;
    await f.editBattle(b => { b.battle.enemies = [{ ...enemy('external-win', 1), maxHp: 1 }]; });
    await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id, revision: f.head().revision }));
    expect(await f.current()).toBeNull(); expect((await f.quest())!.quest.task.progress).toBe(1);
    expect((await f.state())!.lastRevision).toBeLessThan(f.head().revision);
    expect((await f.tick()).receipt.result).toMatchObject({ outcome: 'applied', action: { kind: 'start', channel: 'battle' } });
    expect((await f.state())!.objective?.id).toBe(f.contract.id); expect((await f.state())!.lastRevision).toBe(f.head().revision);
  });
});
