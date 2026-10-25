import { afterEach, describe, expect, it, vi } from 'vitest';
import * as residency from '../world/residency';
import { CanonicalPages } from '../pages';
import { acceptQuest } from '../content/questActions';
import { listFloorContracts } from '../content/queries';
import { loadAcceptedQuest, loadContract } from '../content/records';
import { gameCheckpoint, rosterContext } from '../game/checkpoint';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';
import { executeBattleCommand } from './command';
import { mechanicsFixture } from './mechanics.test-support';
import { enemy } from './combat.test-support';

afterEach(() => vi.restoreAllMocks());
async function target(accepted: boolean, atTarget = true) {
  const f = await mechanicsFixture(); f.storage.install(); vi.spyOn(Math, 'random').mockReturnValue(0);
  const posted = await f.read(p => listFloorContracts(p, 1, undefined, 16));
  const contract = posted.contracts.find(c => c.objective === 'kill')!;
  expect(contract).toBeDefined(); await f.atRoom(contract.targetRoomId);
  if (accepted) await f.work(async tx => {
    const c = gameCheckpoint(tx.head.checkpoint), before = await loadRoster(tx.pages, rosterContext(c));
    const next = await acceptQuest(tx.pages, contract.id, c.position, before.state, '2020-01-01T00:00:00.000Z');
    await saveRoster(tx.pages, before, next);
  });
  if (!atTarget) await f.atRoom('entry');
  await executeBattleCommand(f.request({ kind: 'start', returnMode: 'manual' }));
  await f.editBattle(b => {
    b.battle.enemies = [{ ...enemy('first', 1), maxHp: 1 },
      { ...enemy('remaining'), hp: 100_000, maxHp: 100_000 }];
  });
  const quest = () => f.read(async p => loadAcceptedQuest(p, await loadContract(p, contract.id)));
  return { ...f, contract, quest };
}

describe('room-local kill credit', () => {
  it('credits only newly defeated matching enemies once, with no quest/history or geometry scan', async () => {
    const f = await target(true), b = (await f.current())!, before = (await f.roster()).state;
    const scan = vi.spyOn(CanonicalPages.prototype, 'scan'), geometry = vi.spyOn(residency, 'loadWorldRoom');
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId: before.party[0].id, skillId: 'slash' }));
    expect(scan.mock.calls.every(call => call[1].startsWith('roster/items/'))).toBe(true); expect(geometry).not.toHaveBeenCalled();
    expect((await f.quest())!.quest.task.progress).toBe(1);
    const rewarded = (await f.roster()).state;
    expect(rewarded.party[0].xp).toBeGreaterThan(before.party[0].xp); expect(rewarded.inventory.gold).toBe(before.inventory.gold);
    expect((await f.current())!.battle.defeated!.map(e => e.id)).toEqual(['first']);
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId: before.party[1].id, skillId: 'wand' }));
    expect((await f.quest())!.quest.task.progress).toBe(1); expect((await f.roster()).state.party[0].xp).toBe(rewarded.party[0].xp);
  });

  it('never accepts a posted kill offer as a side effect of combat', async () => {
    const f = await target(false), b = (await f.current())!, actor = (await f.roster()).state.party[0];
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId: actor.id, skillId: 'slash' }));
    expect(await f.quest()).toBeNull(); expect((await f.read(p => loadContract(p, f.contract.id))).accepted).toBe(false);
  });

  it('does not credit an accepted kill quest from a different origin room', async () => {
    const f = await target(true, false), b = (await f.current())!, actor = (await f.roster()).state.party[0];
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId: actor.id, skillId: 'slash' }));
    expect((await f.quest())!.quest.task.progress).toBe(0);
  });

  it('rolls kill credit back with the turn when kernel publication fails', async () => {
    const f = await target(true), b = (await f.current())!, actor = (await f.roster()).state.party[0], before = f.storage.snapshot();
    const request = f.request({ kind: 'skill', battleId: b.battle.id, actorId: actor.id, skillId: 'slash' });
    f.storage.failOnce('receipts'); await expect(executeBattleCommand(request)).rejects.toThrow('Injected receipts failure');
    expect(f.storage.snapshot()).toEqual(before); expect((await f.quest())!.quest.task.progress).toBe(0);
    await executeBattleCommand(request); expect((await f.quest())!.quest.task.progress).toBe(1);
  });
});
