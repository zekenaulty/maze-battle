import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeBattleCommand } from '../combat/command';
import { mechanicsFixture } from '../combat/mechanics.test-support';
import { saveBattle } from '../combat/records';
import { listFloorContracts } from '../content/queries';
import { loadAcceptedQuest, loadChest, loadContract, loadRoomContent } from '../content/records';
import { gameCheckpoint } from './checkpoint';
import { executeContentCommand } from './contentCommand';

afterEach(() => vi.restoreAllMocks());

async function chestBattle(paused = false) {
  const f = await mechanicsFixture(); f.storage.install(); vi.spyOn(Math, 'random').mockReturnValue(0);
  // Authored unit setup, not an earned-navigation or native-IDB journey claim.
  const posted = await f.read(p => listFloorContracts(p, 1, undefined, 16));
  const contract = posted.contracts.find(c => c.objective === 'fetch');
  if (!contract) throw Error('Fixture requires a fetch contract');
  await f.atRoom(contract.targetRoomId);
  await executeContentCommand(f.request({ kind: 'accept-quest', contractId: contract.id }, 'content.command'));
  const room = await f.read(p => loadRoomContent(p, 1, contract.targetRoomId));
  if (!room.chestId) throw Error('Fixture requires a chest');
  const chestId = room.chestId;
  await executeBattleCommand(f.request({ kind: 'start', returnMode: 'waves' }));
  const battle = (await f.current())!;
  if (paused) await executeBattleCommand(f.request({ kind: 'automation', battleId: battle.battle.id, mode: 'manual', enabled: false }));
  const open = () => f.request({ kind: 'open-chest', chestId }, 'content.command');
  const state = async () => ({
    roots: f.head().roots, checkpoint: f.head().checkpoint, roster: (await f.roster()).state,
    chest: await f.read(p => loadChest(p, 1, chestId)),
    quest: await f.read(async p => loadAcceptedQuest(p, await loadContract(p, contract.id))),
    battle: await f.current(),
  });
  return { ...f, chestId, battle, open, state };
}

describe('canonical chest collection during battle', () => {
  it.each([false, true])('preserves inventory, chest, quest and knowledge while paused=%s, including replay', async paused => {
    const f = await chestBattle(paused), before = await f.state(), stored = f.storage.snapshot();
    expect(before.chest.chest.opened).toBe(false);
    expect(before.quest).toMatchObject({ award: null, quest: { status: 'active', task: { progress: 0 } } });
    expect(gameCheckpoint(before.checkpoint).knowledge).not.toBeNull();
    expect(gameCheckpoint(before.checkpoint).position.cell).toEqual({ spaceId: before.chest.spaceId, ...before.chest.chest.position });
    const request = f.open(), result = await executeContentCommand(request);
    expect(result.receipt.result).toEqual({ kind: 'open-chest', outcome: 'unchanged', chestId: f.chestId, lootIds: [] });
    expect(await f.state()).toEqual(before);
    for (const table of ['records', 'nodes']) expect(f.storage.snapshot().get(table)).toEqual(stored.get(table));
    const after = f.storage.snapshot();
    expect((await executeContentCommand(request)).replayed).toBe(true);
    expect(f.storage.snapshot()).toEqual(after);

    // The same chest remains collectible once explicit End has removed the battle.
    await executeBattleCommand(f.request({ kind: 'end', battleId: f.battle.battle.id }));
    const opened = await executeContentCommand(f.open()), collected = await f.state();
    expect(opened.receipt.result).toMatchObject({ kind: 'open-chest', outcome: 'applied' });
    expect(collected.chest.chest.opened).toBe(true);
    expect(collected.roster.inventory).not.toEqual(before.roster.inventory);
    expect(collected.quest?.award).not.toBeNull();
    expect(collected.quest?.quest.task.progress).toBeGreaterThan(0);
    expect(gameCheckpoint(collected.checkpoint).knowledge).not.toEqual(gameCheckpoint(before.checkpoint).knowledge);
  });

  it.each(['missing-header', 'foreign-origin', 'missing-enemy'] as const)('rejects %s instead of treating an invalid battle as absent', async defect => {
    const f = await chestBattle();
    const enemyKey = `combat/${f.battle.battle.id}/enemy/${f.battle.battle.enemies[0].id}`;
    if (defect === 'missing-header') await f.work(tx => saveBattle(tx.pages, f.battle, null));
    else if (defect === 'foreign-origin') await f.editBattle(b => { b.origin.cell.row++; });
    else await f.work(tx => tx.pages.delete('world', enemyKey));
    const before = f.storage.snapshot();
    const error = defect === 'missing-header' ? 'battle checkpoint has no battle'
      : defect === 'foreign-origin' ? 'battle origin differs from checkpoint position' : `missing battle record: ${enemyKey}`;
    await expect(executeContentCommand(f.open())).rejects.toThrow(`Canonical storage: ${error}`);
    expect(f.storage.snapshot()).toEqual(before);
  });
});
