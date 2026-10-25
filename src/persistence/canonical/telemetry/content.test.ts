import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoCombatFixture } from '../auto/combat.test-support';
import { enemy } from '../combat/combat.test-support';
import { mechanicsFixture } from '../combat/mechanics.test-support';
import { listFloorContracts } from '../content/queries';
import { loadRoomContent } from '../content/records';
import { executeContentCommand } from '../game/contentCommand';
import { trace } from './gameplay.test-support';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('shared Auto and content reward trace', () => {
  it('records one shared start/turn per Auto battle and the actual claimed wallet reward', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0);
    let now = Date.now(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    expect((await trace(f)).sequence).toBe(0);
    for (let n = 0; n < f.contract.task.required; n++) {
      await f.tick(); await f.editBattle(b => { b.battle.enemies = [{ ...enemy(`kill-${n}`, 1), maxHp: 1 }]; });
      now += 10_000; vi.setSystemTime(now); await f.tick();
    }
    const gold = (await f.roster()).state.inventory.gold; await f.tick();
    const log = await trace(f); expect(log.events).toHaveLength(f.contract.task.required * 2 + 1);
    expect(log.events.at(-1)?.fact).toEqual({ kind: 'reward', command: 'claim-quest', targetId: f.contract.id,
      walletGoldBefore: gold, walletGoldAfter: gold + f.contract.rewardGold, lootAwardCount: 0 });
    expect(log.events.filter(e => e.fact.kind === 'battle' && e.fact.event === 'won')).toHaveLength(f.contract.task.required);
    expect(log.events[1].fact).toMatchObject({ event: 'won', trigger: 'tick', returnMode: 'auto-play' });
  });

  it('records applied chest awards and quest payout, but not acceptance, repeated collection or receipt replay', async () => {
    const f = await mechanicsFixture(); f.storage.install(); vi.spyOn(Math, 'random').mockReturnValue(0);
    const board = await f.read(p => listFloorContracts(p, 1, undefined, 16)), contract = board.contracts.find(c => c.objective === 'fetch')!;
    await f.atRoom(contract.targetRoomId);
    await executeContentCommand(f.request({ kind: 'accept-quest', contractId: contract.id }, 'content.command'));
    expect((await trace(f)).sequence).toBe(0);
    const room = await f.read(p => loadRoomContent(p, 1, contract.targetRoomId));
    const request = f.request({ kind: 'open-chest', chestId: room.chestId! }, 'content.command');
    const result = await executeContentCommand(request), opened = await trace(f);
    expect(opened.events[0].fact).toMatchObject({ kind: 'reward', command: 'open-chest', targetId: room.chestId });
    expect(opened.events[0].fact.kind === 'reward' && opened.events[0].fact.lootAwardCount).toBe((result.receipt.result as { lootIds: string[] }).lootIds.length);
    await executeContentCommand(request);
    await executeContentCommand(f.request({ kind: 'open-chest', chestId: room.chestId! }, 'content.command'));
    expect((await trace(f)).events).toEqual(opened.events);
    await executeContentCommand(f.request({ kind: 'claim-quest', questId: contract.id }, 'content.command'));
    expect((await trace(f)).events.at(-1)?.fact).toMatchObject({ kind: 'reward', command: 'claim-quest', targetId: contract.id });
    const claimed = await trace(f); await executeContentCommand(f.request({ kind: 'claim-quest', questId: contract.id }, 'content.command'));
    expect((await trace(f)).events).toEqual(claimed.events);
  });
});
