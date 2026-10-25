import { expect } from 'vitest';
import { mechanicsFixture } from '../combat/mechanics.test-support';
import { checkpointJson, gameCheckpoint } from '../game/checkpoint';
import { loadAcceptedQuest, loadContract } from '../content/records';
import { executeAutoCommand } from './command';
import { initialAutoState, loadAutoState, saveAutoState } from './records';
import { readAutoGuild } from './source';
import { AUTO_LIMITS } from './types';

/** Real prepared world, canonical handlers/receipts/COW; only the storage transport is in memory. */
export async function autoCombatFixture(atTarget = true) {
  const f = await mechanicsFixture(); f.storage.install();
  await f.work(async tx => { tx.setCheckpoint(checkpointJson({ ...gameCheckpoint(tx.head.checkpoint), mode: 'auto-play' })); });
  const guild = () => f.read((p, h) => readAutoGuild(p, gameCheckpoint(h.checkpoint)));
  const board = await guild(), contract = board.offers.find(c => c.objective === 'kill')!;
  expect(contract).toBeDefined();
  const tick = (revision = f.head().revision) => executeAutoCommand(f.request({ kind: 'tick', revision }, 'auto.command'));
  const accepted: string[] = [];
  for (let n = 0; n < AUTO_LIMITS.guild && (await guild()).offers.length; n++) {
    const result = (await tick()).receipt.result as { action?: { kind: string; questId: string } };
    expect(result.action?.kind).toBe('accept-quest'); accepted.push(result.action!.questId);
  }
  expect((await guild()).offers).toEqual([]); expect(accepted).toContain(contract.id);
  if (atTarget) await f.atRoom(contract.targetRoomId);
  await f.work(async tx => {
    const c = gameCheckpoint(tx.head.checkpoint), state = atTarget ? initialAutoState(c, tx.head.revision) : (await loadAutoState(tx.pages))!;
    state.objective = { kind: 'quest', id: contract.id, roomId: contract.targetRoomId };
    state.lastRevision = tx.head.revision + 1; await saveAutoState(tx.pages, state);
  });
  const quest = () => f.read(async p => loadAcceptedQuest(p, await loadContract(p, contract.id)));
  const state = () => f.read(loadAutoState);
  return { ...f, guild, contract, tick, quest, state, board, accepted };
}
