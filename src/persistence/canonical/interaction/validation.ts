import type { ContentCommand } from '../content/types';
import { contentCommand } from '../game/contentCommand';
import { fields, id } from '../roster/codec';
import { check, integer, jsonBytes, validId } from '../validation';
import { position } from '../world/records';
import type { WorldPosition } from '../world/types';
import type { InteractionBinding, InteractionProgress } from './types';

export function interactionBinding(value: unknown): InteractionBinding {
  jsonBytes(value, 4096);
  const row = fields(value, 'schema kind command position');
  check(row.schema === 1 && row.kind === 'content-interaction', 'invalid interaction binding');
  contentCommand(row.command);
  const at = fields(row.position, 'level cell'); fields(at.cell, 'spaceId row column');
  position(row.position as unknown as WorldPosition);
  return structuredClone(value) as InteractionBinding;
}
export function createInteractionBinding(command: ContentCommand, position: WorldPosition) {
  return interactionBinding({ schema: 1, kind: 'content-interaction', command, position });
}
export function interactionProgress(value: unknown): InteractionProgress {
  jsonBytes(value, 12 * 1024);
  const p = fields(value, 'schema operationId binding sourceAttemptId owner epoch sequence status reason result');
  check(p.schema === 1 && validId(p.operationId) && validId(p.sourceAttemptId) && validId(p.owner)
    && integer(p.epoch, 1) && (p.sequence === 0 || p.sequence === 1), 'invalid interaction progress');
  const { command } = interactionBinding(p.binding);
  if (p.sequence === 0) check(p.status === 'pending' && p.reason === null && p.result === null, 'invalid interaction admission');
  else if (p.status === 'blocked') check(p.result === null && (p.reason === 'position-changed'
    || p.reason === 'unavailable' && command.kind === 'open-chest'), 'invalid blocked interaction');
  else {
    check(['applied', 'unchanged'].includes(p.status as string) && p.reason === null, 'invalid interaction outcome');
    const r = fields(p.result, command.kind === 'open-chest' ? 'kind outcome chestId lootIds' : 'kind outcome questId');
    check(r.kind === command.kind && r.outcome === p.status, 'interaction outcome differs from command');
    if (command.kind === 'open-chest') {
      check(r.chestId === command.chestId && Array.isArray(r.lootIds) && r.lootIds.length <= 4
        && new Set(r.lootIds).size === r.lootIds.length, 'invalid interaction loot');
      r.lootIds.forEach(item => id(item));
      check(p.status === 'applied' ? r.lootIds.length >= 2 : r.lootIds.length === 0, 'interaction loot differs from outcome');
    } else check(r.questId === (command.kind === 'accept-quest' ? command.contractId : command.questId), 'interaction quest differs from command');
  }
  return structuredClone(value) as InteractionProgress;
}
