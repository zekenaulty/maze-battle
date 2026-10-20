import type { GameSession, CommandKind } from '../../src/services/game/GameSession';
import type { Direction } from '../../src/domain/types';
import type { Json } from '../../src/persistence/canonical/types';
import { cellKey } from '../../src/persistence/canonical/knowledge/keys';

declare global { var __revisitAppSession: GameSession | undefined }
export function session() {
  const current = globalThis.__revisitAppSession;
  if (!current?.view.game) throw Error('Mounted App session required');
  return current;
}
export function state() {
  const { game, controlled, busy, status } = session().view;
  return structuredClone({ controlled, busy, status, checkpoint: game!.checkpoint,
    snapshot: game!.snapshot, observation: game!.observation, quests: game!.quests,
    contracts: game!.contracts, inventory: game!.inventory, stash: game!.stash });
}
export async function command(kind: CommandKind, input: Json) {
  return session().execute(kind, input);
}
export async function move(direction: Direction) {
  const game = session().view.game!, at = game.checkpoint.position;
  const actor = game.observation!.cells.find(cell => cellKey(cell.at) === cellKey(at));
  const target = actor?.edges[direction];
  if (!target) throw Error('Move requires an earned adjacent destination');
  const receipt = await command('exploration', { kind: 'move', direction, triggerStairs: false });
  if (cellKey(session().view.game!.checkpoint.position) !== cellKey(target)) throw Error('Normal move did not reach earned destination');
  return receipt;
}
export async function collect() {
  const game = session().view.game!, at = game.checkpoint.position;
  const actor = game.observation!.cells.find(cell => cellKey(cell.at) === cellKey(at))!;
  if (actor.chests.length !== 1) throw Error('Expected one observed chest at actor');
  return command('content', { kind: 'open-chest', chestId: actor.chests[0].id });
}
export async function acceptSurvey() {
  await command('exploration', { kind: 'stairs', direction: 'up' });
  const offers = state().contracts.filter(c => c.task.item?.baseId === 'survey-seal');
  if (offers.length !== 1) throw Error('Expected one public survey offer');
  const receipt = await command('content', { kind: 'accept-quest', contractId: offers[0].id });
  await command('roster', { kind: 'leave-town' });
  return receipt;
}
