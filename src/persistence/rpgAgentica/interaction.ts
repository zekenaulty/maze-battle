import type { AgenticaAction, AgenticaResult } from '../../services/agentica/contracts';
import type { RpgAgenticaBinding } from '../../services/agentica/rpg/contracts';
import { requireRpg } from '../../services/agentica/rpg/validation';
import type { OwnedGame } from '../gameCustody';
import type { GameWrite } from '../gameTransaction';
import type { MemoryQuery } from '../rpgMemory/query';
import { commitGameCommandInTransaction } from '../gameCommands';
import { rpgOperationObservation } from './evidence';

/** SDK result and the ordinary command/loot receipt share the caller's transaction. */
export async function openRpgChest(tx: GameWrite, action: AgenticaAction, binding: RpgAgenticaBinding,
  current: OwnedGame, memory: MemoryQuery, attemptId: string, chestId: string, result: AgenticaResult): Promise<AgenticaResult> {
  requireRpg(binding.mode === 'quest', 'chest interaction is not bound');
  const receipt = memory.head.observation;
  const cell = receipt.cells.find(value => value.address.row === receipt.actor.row && value.address.column === receipt.actor.column);
  // Reject remote/guessed targets using permitted evidence before asking world mechanics anything.
  if (!cell?.chests.some(chest => chest.id === chestId && !chest.opened))
    return { ...result, disposition: 'refused', summary: 'No eligible observed chest at the current cell.' };
  const committed = await commitGameCommandInTransaction(tx, { attemptId, gameId: binding.gameId, floor: binding.floor,
    position: { ...current.game.maze.active }, control: current.control, deadlineAt: Date.parse(action.deadlineAt),
    command: { type: 'open-chest', chestId } });
  const slot = await tx.objectStore('saves').get('auto');
  requireRpg(slot && committed.current, 'interaction checkpoint missing');
  const observation = await rpgOperationObservation(tx, slot, committed.receipt.afterRevision, binding, true);
  observation.data.effect = { kind: 'open-chest', attemptId, chestId,
    beforeRevision: committed.receipt.beforeRevision, afterRevision: committed.receipt.afterRevision,
    outcome: committed.receipt.outcome, sourceHead: committed.receipt.observationHead };
  return { ...result, afterRevision: committed.receipt.afterRevision, observation,
    disposition: committed.receipt.outcome.status === 'applied' ? 'applied' : 'refused',
    summary: committed.receipt.outcome.status === 'applied' ? 'Opened the selected chest through the ordinary game command.'
      : 'The selected chest interaction was refused by the game.' };
}
