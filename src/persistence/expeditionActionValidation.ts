import { commandSignature, type ExpeditionActionRequest, type ExpeditionActionResult } from '../domain/expedition/protocol';
import { addressKey, sameAddress } from '../domain/expedition/address';
import { movePosition } from '../domain/maze/movement';
import type { ExpeditionPlan } from '../domain/expedition/types';
import type { ExpeditionRecord } from './expeditionDatabase';
import { canonical, validateExpeditionRecord } from './expeditionRepository';
import { MAX_DURABLE_ACTIONS, type DurableExpeditionReceipt, type DurableExpeditionSession, type ExpeditionActionEffect, type ExpeditionActionOutcome } from './expeditionActionTypes';

export function actionCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Expedition action: ${message}`);
}
export const validActionId = (value: unknown): value is string => typeof value === 'string' && value.length <= 128 && !!value.trim();
export const naturalRevision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]';
const only = (value: object, keys: string) => Object.keys(value).every(key => keys.split(',').includes(key));

/** Same identity signature as actionSession, with a bounded, strict request envelope. */
export function expeditionActionSignature(request: ExpeditionActionRequest): string {
  actionCheck(object(request) && only(request, 'version,sessionId,epoch,actionId,expectedRevision,command') && request.version === 1 &&
    validActionId(request.actionId) && validActionId(request.sessionId) && naturalRevision(request.epoch) &&
    naturalRevision(request.expectedRevision), 'invalid request');
  return JSON.stringify([request.sessionId, request.epoch, request.expectedRevision, commandSignature(request.command)]);
}

export function validateActionSession(value: unknown, record: ExpeditionRecord): asserts value is DurableExpeditionSession {
  actionCheck(object(value) && value.version === 1 && validActionId(value.sessionId) && naturalRevision(value.epoch) &&
    naturalRevision(value.maxActions) && value.maxActions >= 1 && value.maxActions <= MAX_DURABLE_ACTIONS &&
    naturalRevision(value.receiptCount) && value.receiptCount <= value.maxActions &&
    (value.pendingActionId === null || (validActionId(value.pendingActionId) && value.receiptCount > 0)), 'invalid session');
  actionCheck(value.worldId === record.plan.recipe.worldId && value.floorId === record.plan.recipe.floorId &&
    value.scopeId === record.plan.scopeId, 'session world changed');
}

function validateResult(value: unknown, request: ExpeditionActionRequest, plan: ExpeditionPlan): asserts value is ExpeditionActionResult {
  actionCheck(object(value) && only(value, 'actionId,disposition,beforeRevision,afterRevision,reason,observation') &&
    value.actionId === request.actionId && value.beforeRevision === request.expectedRevision &&
    typeof value.disposition === 'string' && ['applied', 'refused', 'unresolved'].includes(value.disposition) && naturalRevision(value.afterRevision) &&
    value.afterRevision === request.expectedRevision + (value.disposition === 'applied' ? 1 : 0) &&
    typeof value.reason === 'string' && value.reason.length <= 2048, 'invalid result');
  if (value.observation === undefined) return;
  const observation = value.observation;
  actionCheck(object(observation) && only(observation, 'version,worldId,floorId,scopeId,revision,position,phase,visibleCells,visibleOpenings,visibleChests') &&
    observation.version === 1 && observation.worldId === plan.recipe.worldId && observation.floorId === plan.recipe.floorId &&
    observation.scopeId === plan.scopeId && observation.revision === value.afterRevision &&
    Array.isArray(observation.visibleCells) && observation.visibleCells.length <= 512 &&
    Array.isArray(observation.visibleOpenings) && observation.visibleOpenings.length <= 1026 &&
    Array.isArray(observation.visibleChests) && observation.visibleChests.length <= 512, 'invalid observation');
  actionCheck(object(observation.position) && only(observation.position, 'spaceId,row,column'), 'invalid observation position');
  const knowledge = { cells: {}, openings: {}, chests: {} };
  const collections = [
    [observation.visibleCells, knowledge.cells, 'spaceId,row,column,links,observedAt'],
    [observation.visibleOpenings, knowledge.openings, 'spaceId,row,column,id,direction,destination,observedAt'],
    [observation.visibleChests, knowledge.chests, 'spaceId,row,column,id,opened,observedAt'],
  ] as const;
  for (const [entries, target, fields] of collections) {
    for (const entry of entries) {
      actionCheck(object(entry) && only(entry, fields), 'invalid observation entry');
      if (entry.destination !== undefined) actionCheck(object(entry.destination) && only(entry.destination, 'spaceId,row,column'), 'invalid observed destination');
      const key = target === knowledge.cells ? addressKey(entry as never) : entry.id;
      actionCheck(typeof key === 'string' && !Object.hasOwn(target, key), 'duplicate observation identity');
      Object.defineProperty(target, key, { value: entry, enumerable: true });
    }
  }
  // Validate a historical observation independently of today's opened-chest state.
  validateExpeditionRecord({ plan, checkpoint: {
    version: 1, worldId: observation.worldId, floorId: observation.floorId, scopeId: observation.scopeId,
    revision: observation.revision, position: observation.position, home: plan.start, phase: observation.phase, moves: 0,
    openedChestIds: observation.visibleChests.filter(chest => chest.opened).map(chest => chest.id), knowledge,
  } });
}

function validateEffect(effect: ExpeditionActionEffect, request: ExpeditionActionRequest, plan: ExpeditionPlan) {
  const position = (value: unknown) => object(value) && only(value, 'spaceId,row,column') && naturalRevision(value.row) && naturalRevision(value.column) &&
    plan.spaces.some(spec => spec.id === value.spaceId && Number(value.row) < spec.rows && Number(value.column) < spec.columns);
  actionCheck(object(effect) && only(effect, 'from,to,openedChestIds,moves,beforePhase,afterPhase') && position(effect.from) && position(effect.to) &&
    Array.isArray(effect.openedChestIds) && effect.openedChestIds.length <= 1 &&
    ['exploring', 'returning'].includes(effect.beforePhase), 'invalid effect');
  const command = request.command;
  const samePosition = sameAddress(effect.from, effect.to);
  if (command.type === 'move') {
    const spec = plan.spaces.find(space => space.id === effect.from.spaceId)!;
    const adjacent = sameAddress({ ...movePosition(effect.from, command.direction), spaceId: spec.id }, effect.to);
    const port = spec.openings.some(opening => opening.direction === command.direction &&
      opening.cell.row === effect.from.row && opening.cell.column === effect.from.column && sameAddress(opening.destination, effect.to));
    actionCheck((adjacent || port) && effect.moves === 1 && effect.openedChestIds.length === 0 &&
      effect.afterPhase === effect.beforePhase, 'move effect mismatch');
  } else if (command.type === 'collect') {
    actionCheck(samePosition && effect.moves === 0 && effect.afterPhase === effect.beforePhase && effect.openedChestIds.length === 1 &&
      plan.spaces.find(space => space.id === effect.from.spaceId)!.chests.some(chest => chest.id === effect.openedChestIds[0] &&
        chest.cell.row === effect.from.row && chest.cell.column === effect.from.column), 'collect effect mismatch');
  } else {
    actionCheck(samePosition && effect.moves === 0 && effect.openedChestIds.length === 0 && effect.afterPhase === 'complete', 'finish effect mismatch');
  }
}

export function validateActionReceipt(value: unknown, plan: ExpeditionPlan): asserts value is DurableExpeditionReceipt {
  actionCheck(object(value) && only(value, 'version,request,signature,result,effect') && value.version === 1, 'invalid receipt');
  const receipt = value as unknown as DurableExpeditionReceipt;
  actionCheck(receipt.signature === expeditionActionSignature(receipt.request), 'receipt signature corrupt');
  validateResult(receipt.result, receipt.request, plan);
  if (receipt.result.disposition === 'applied') validateEffect(receipt.effect!, receipt.request, plan);
  else actionCheck(receipt.effect === undefined, 'unexpected effect');
}

/** Host must compute the domain transition without external side effects before settlement. */
export function validateActionOutcome(record: ExpeditionRecord, request: ExpeditionActionRequest, outcome: ExpeditionActionOutcome): ExpeditionActionEffect | undefined {
  actionCheck(object(outcome), 'missing outcome');
  const next = outcome.checkpoint;
  const before = record.checkpoint;
  validateExpeditionRecord({ plan: record.plan, checkpoint: next });
  validateResult(outcome.result, request, record.plan);
  actionCheck(['applied', 'refused'].includes(outcome.result.disposition) && outcome.result.afterRevision === next.revision,
    'only a confirmed local outcome can settle');
  if (outcome.result.observation) {
    const observation = outcome.result.observation;
    actionCheck(sameAddress(observation.position, next.position) && observation.phase === next.phase, 'observation checkpoint mismatch');
    for (const cell of observation.visibleCells) actionCheck(canonical(cell) === canonical(next.knowledge.cells[addressKey(cell)]), 'observation knowledge mismatch');
    for (const opening of observation.visibleOpenings) actionCheck(canonical(opening) === canonical(next.knowledge.openings[opening.id]), 'observation knowledge mismatch');
    for (const chest of observation.visibleChests) actionCheck(canonical(chest) === canonical(next.knowledge.chests[chest.id]), 'observation knowledge mismatch');
  }
  if (outcome.result.disposition === 'refused') {
    actionCheck(canonical(before) === canonical(next), 'refused action changed checkpoint');
    return undefined;
  }
  actionCheck(next.revision === before.revision + 1 && sameAddress(next.home, before.home) &&
    before.openedChestIds.every(id => next.openedChestIds.includes(id)), 'checkpoint effect regression');
  const effect: ExpeditionActionEffect = {
    from: { spaceId: before.position.spaceId, row: before.position.row, column: before.position.column },
    to: { spaceId: next.position.spaceId, row: next.position.row, column: next.position.column },
    openedChestIds: next.openedChestIds.filter(id => !before.openedChestIds.includes(id)),
    moves: next.moves - before.moves, beforePhase: before.phase, afterPhase: next.phase,
  };
  validateEffect(effect, request, record.plan);
  if (request.command.type === 'finish') actionCheck(sameAddress(next.position, next.home), 'finish away from home');
  return effect;
}
