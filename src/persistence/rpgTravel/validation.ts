import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { directions, integer, validAddress, validId } from '../../domain/agentic/knowledge/shared';
import { validateDestinationBudget } from '../../domain/directed/destinationBudgetValidation';
import { snapshotDestinationLimits } from '../../domain/directed/destinationLimits';
import type { SaveControl } from '../saveControl';
import { commandFingerprint, validateCommandReceipt } from '../gameCommandValidation';
import type { GameCommandRequest } from '../gameCommandTypes';
import type { RpgFrontierTarget, RpgTravelReceipt, RpgTravelRecord, RpgTravelRequest } from './types';
import { EXPLORATION_TRAIL_LIMIT } from '../../domain/agentic/explorationPolicy';

const exact = (v: unknown, keys: string): boolean => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === keys.split(',').sort().join(',');
export function requireTravel(ok: unknown): asserts ok { if (!ok) throw new Error('Invalid or unavailable RPG travel record.'); }
const control = (v: SaveControl) => exact(v, 'owner,epoch,revision') && validId(v.owner) && integer(v.epoch, 1) && integer(v.revision, 0);
const address = (v: Parameters<typeof validAddress>[0]) => exact(v, 'floor,row,column') && validAddress(v);
export const validFrontier = (v: RpgFrontierTarget) => exact(v, 'anchor,direction,sourceId') && address(v.anchor)
  && directions.includes(v.direction) && validId(v.sourceId);
export const sameTravelPosition = (a: Parameters<typeof validAddress>[0], b: Parameters<typeof validAddress>[0]) =>
  a.floor === b.floor && a.row === b.row && a.column === b.column;

export function travelFingerprint(input: RpgTravelRequest) {
  requireTravel(exact(input, 'attemptId,operationId,gameId,control,deadlineAt,action') && validId(input.attemptId)
    && validId(input.operationId) && validId(input.gameId) && control(input.control) && integer(input.deadlineAt, 0));
  const action = input.action;
  requireTravel(action && typeof action === 'object');
  if (action.type === 'start') {
    requireTravel(exact(action, 'type,target,limits') && address(action.target));
    snapshotDestinationLimits(action.limits);
  } else if (action.type === 'explore') {
    requireTravel(exact(action, `type,frontier,limits${Object.hasOwn(action, 'continuation') ? ',continuation' : ''}`)
      && (!Object.hasOwn(action, 'continuation') || action.continuation === 'corridor-v1') && validFrontier(action.frontier));
    snapshotDestinationLimits(action.limits);
  } else if (action.type === 'step') requireTravel(exact(action, 'type,sequence') && integer(action.sequence, 0));
  else requireTravel(exact(action, 'type') && ['cancel', 'adopt'].includes(action.type));
  return canonicalJson(input);
}

export function sealTravel<T extends object>(value: T): T & { witness: string } {
  return { ...value, witness: canonicalJson(value) };
}
function witness<T extends { witness: string }>(value: T) {
  requireTravel(value && typeof value === 'object' && typeof value.witness === 'string');
  const { witness: proof, ...body } = value;
  requireTravel(proof === canonicalJson(body));
}
export function validateTravel(record: RpgTravelRecord, id: string) {
  witness(record);
  requireTravel(exact(record, `version,id,gameId,control,position,sourceHead,operation,witness${record.frontier ? ',frontier' : ''}${record.exploration ? ',exploration' : ''}`) && record.version === 1
    && record.id === id && validId(id) && validId(record.gameId) && control(record.control)
    && address(record.position) && validId(record.sourceHead));
  const op = record.operation;
  requireTravel(!record.frontier || validFrontier(record.frontier)
    && (record.exploration?.phase === 'corridor' || sameTravelPosition(record.frontier.anchor, op.target)));
  requireTravel(exact(op, 'id,target,status,epoch,steps,replans,nextStep,route,reason,startedAt,deadline,limits')
    && op.id === id && address(op.target) && op.target.floor === record.position.floor
    && op.epoch === record.control.epoch && typeof op.reason === 'string' && op.reason.length <= 512
    && ['running', 'arrived', 'cancelled', 'interrupted'].includes(op.status));
  validateDestinationBudget(op);
  requireTravel(op.route.length <= 256 && op.route.every(p => exact(p, 'spaceId,row,column')
    && p.spaceId === `rpg:${record.position.floor}` && validAddress({ floor: record.position.floor, row: p.row, column: p.column })));
  requireTravel(op.status === 'running' || op.route.length === 0);
  requireTravel(op.status !== 'arrived' || sameTravelPosition(record.position, op.target));
  if (record.exploration) {
    const state = record.exploration;
    requireTravel(record.frontier && record.frontier.anchor.floor === record.position.floor
      && exact(state, `policy,phase,trail${state.decision ? ',decision' : ''}`)
      && state.policy === 'corridor-v1' && ['approach', 'corridor'].includes(state.phase)
      && Array.isArray(state.trail) && state.trail.length > 0 && state.trail.length <= EXPLORATION_TRAIL_LIMIT
      && state.trail.every(p => address(p) && p.floor === record.position.floor)
      && state.trail.some(p => sameTravelPosition(p, record.position))
      && new Set(state.trail.map(p => `${p.row},${p.column}`)).size === state.trail.length);
    if (state.decision) requireTravel(exact(state.decision, 'kind,at,sourceId')
      && ['junction', 'object', 'changed', 'visibility', 'loop', 'capacity', 'boundary'].includes(state.decision.kind)
      && address(state.decision.at) && state.decision.at.floor === record.position.floor
      && state.decision.sourceId === record.sourceHead && op.status === 'interrupted');
  }
  return record;
}
export function validateTravelReceipt(receipt: RpgTravelReceipt, request: RpgTravelRequest, fingerprint: string) {
  witness(receipt);
  requireTravel(exact(receipt, `version,attemptId,fingerprint,committedAt,disposition,reason,witness${receipt.travel ? ',travel' : ''}${receipt.command ? ',command' : ''}`)
    && receipt.version === 1 && receipt.attemptId === request.attemptId && receipt.fingerprint === fingerprint
    && integer(receipt.committedAt, 0) && ['applied', 'refused', 'conflict', 'unavailable', 'settled'].includes(receipt.disposition)
    && typeof receipt.reason === 'string' && receipt.reason.length <= 512);
  if (receipt.travel) {
    const travel = validateTravel(receipt.travel, request.operationId);
    if (request.action.type === 'explore') requireTravel(canonicalJson(travel.frontier) === canonicalJson(request.action.frontier)
      && travel.exploration?.policy === request.action.continuation);
    if (request.action.type === 'start') requireTravel(!travel.frontier && !travel.exploration
      && sameTravelPosition(travel.operation.target, request.action.target));
  }
  if (receipt.command) {
    const command: GameCommandRequest = JSON.parse(receipt.command.fingerprint);
    requireTravel(receipt.travel && receipt.disposition === 'applied' && request.action.type === 'step'
      && command.attemptId === request.attemptId && command.gameId === request.gameId
      && command.command.type === 'move' && command.command.triggerStairs === false
      && canonicalJson(command.control) === canonicalJson(request.control));
    validateCommandReceipt(receipt.command, command, commandFingerprint(command));
    requireTravel(receipt.travel.control.revision === receipt.command.afterRevision);
  }
  return receipt;
}
