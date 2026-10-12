import type { GameState } from '../../../domain/types';
import { samePosition } from '../../../domain/maze/key';
import { matchesQuestItem } from '../../../domain/quests/questItems';
import { itemQuantity } from '../../../domain/items/itemQuantity';
import type { RpgAgenticaBinding } from './contracts';
import { requireRpg } from './validation';

/** Private binding: never send a generated quest ID, target room or hidden location to the model. */
export function bindRpgQuest(game: GameState, questId: string | undefined): NonNullable<RpgAgenticaBinding['quest']> {
  const quest = game.quests.find(candidate => candidate.id === questId);
  requireRpg(quest && quest.floor === game.dungeonLevel && quest.status !== 'claimed'
    && quest.task.objective === 'fetch' && quest.task.item && quest.task.required === 1,
  'Choose an accepted single-item fetch quest on this floor.');
  return { id: quest.id, baseId: quest.task.item.baseId, token: quest.task.item.token, required: quest.task.required };
}

/** Own quest log and pack are public; authoritative quest placement is deliberately not read. */
export function rpgQuestStatus(game: GameState, binding: RpgAgenticaBinding) {
  const bound = binding.quest;
  requireRpg(binding.mode === 'quest' && bound, 'missing retrieval binding');
  const quest = game.quests.find(candidate => candidate.id === bound.id);
  const valid = game.id === binding.gameId && quest?.floor === binding.floor && quest.task.objective === 'fetch'
    && quest.task.item?.baseId === bound.baseId && quest.task.item?.token === bound.token && quest.task.required === bound.required;
  const carried = valid ? Math.min(bound.required, game.inventory.items.reduce((sum, item) =>
    sum + (matchesQuestItem(item, quest!) ? itemQuantity(item) : 0), 0)) : 0;
  const atReturn = game.dungeonLevel === binding.completionTarget.floor && samePosition(game.maze.active, binding.completionTarget);
  return { kind: 'retrieval' as const, status: valid ? quest!.status : 'unavailable',
    item: { name: valid ? quest!.task.item!.displayName.slice(0, 128) : 'Quest collectible', token: bound.token },
    required: bound.required, carried, returnTarget: { ...binding.completionTarget }, atReturn,
    complete: !!valid && (quest!.status === 'complete' || quest!.status === 'claimed') && carried >= bound.required && atReturn };
}

export function rpgObjectiveComplete(game: GameState, binding: RpgAgenticaBinding) {
  return binding.mode === 'quest' ? rpgQuestStatus(game, binding).complete : binding.mode !== 'exploration'
    && game.dungeonLevel === binding.completionTarget.floor && samePosition(game.maze.active, binding.completionTarget);
}
