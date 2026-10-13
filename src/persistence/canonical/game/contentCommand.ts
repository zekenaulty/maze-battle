import type { CanonicalRequest, JsonObject } from '../types';
import { executeCanonical, type CanonicalWork } from '../transaction';
import { check, request as validateRequest } from '../validation';
import { fields, id } from '../roster/codec';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';
import { gameCheckpoint, checkpointJson, rosterContext } from './checkpoint';
import { acceptQuest, claimReward } from '../content/questActions';
import { openStoredChest } from '../content/openChest';
import type { ContentCommand } from '../content/types';
import { recordGameObservation } from '../knowledge/write';
import { validateKnowledge } from '../knowledge/evidence';

export function contentCommand(value: unknown): ContentCommand {
  const row = fields(value, 'kind', 'chestId contractId questId');
  const target = row.kind === 'open-chest' ? 'chestId' : row.kind === 'accept-quest' ? 'contractId' : row.kind === 'claim-quest' ? 'questId' : null;
  check(target && Object.keys(row).length === 2, 'invalid content command'); id(row[target]);
  return value as ContentCommand;
}
/** Host-owned facade, shared by future manual/Auto/agent bindings. Not a provider capability grant. */
export function executeContentCommand(request: CanonicalRequest) {
  request = validateRequest(request); check(request.operation === 'content.command', 'invalid content operation');
  return executeCanonical(request, tx => commitContentCommand(tx, request.input));
}
export async function commitContentCommand(tx: CanonicalWork, input: unknown) {
  const command = contentCommand(input), checkpoint = gameCheckpoint(tx.head.checkpoint), now = new Date().toISOString();
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  const before = await loadRoster(tx.pages, rosterContext(checkpoint));
  let next = before.state;
  const result: JsonObject = { kind: command.kind, outcome: 'unchanged' };
  if (command.kind === 'open-chest') {
    const opened = await openStoredChest(tx.pages, command.chestId, checkpoint.position, next, now);
    next = opened.roster; result.chestId = command.chestId; result.lootIds = opened.loot.map(item => item.id);
  } else if (command.kind === 'accept-quest') {
    next = await acceptQuest(tx.pages, command.contractId, checkpoint.position, next, now); result.questId = command.contractId;
  } else {
    next = await claimReward(tx.pages, command.questId, next, now); result.questId = command.questId;
  }
  if (next === before.state) return result;
  await saveRoster(tx.pages, before, next);
  let updated = { ...checkpoint, updatedAt: next.updatedAt, activityLog: next.activityLog };
  if (command.kind === 'open-chest' && checkpoint.knowledge && checkpoint.mode !== 'town') updated = await recordGameObservation(tx, updated);
  tx.setCheckpoint(checkpointJson(updated));
  return { ...result, outcome: 'applied' };
}
