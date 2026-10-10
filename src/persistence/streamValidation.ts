import { sameAddress } from '../domain/expedition/address';
import type { CellAddress } from '../domain/expedition/types';
import type { TopologyHeader } from '../domain/expedition/topology/types';
import type { StreamActionReceipt, StreamActionRequest, StreamCheckpoint, StreamControl } from '../domain/expedition/streaming/types';
import { validId } from './topology/validation';

export function streamCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stream persistence: ${message}`);
}
export const natural = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
export const only = (value: object, keys: string) => Object.keys(value).every(key => keys.split(',').includes(key));
export const direction = (value: unknown) => ['north', 'east', 'south', 'west'].includes(value as string);

export function validAddress(value: unknown): asserts value is CellAddress {
  streamCheck(object(value) && only(value, 'spaceId,row,column'), 'invalid address');
  validId(value.spaceId as string);
  streamCheck(natural(value.row) && value.row < 15 && natural(value.column) && value.column < 15, 'invalid local coordinates');
}
export function streamActionSignature(request: StreamActionRequest): string {
  streamCheck(object(request) && only(request, 'version,actionId,sessionId,epoch,expectedRevision,expectedTopologyRevision,command')
    && request.version === 2 && natural(request.epoch) && natural(request.expectedRevision) && natural(request.expectedTopologyRevision), 'invalid request');
  validId(request.actionId); validId(request.sessionId);
  const command = request.command;
  streamCheck(object(command), 'invalid command');
  let signature: string;
  if (command.type === 'move' && only(command, 'type,direction') && direction(command.direction)) signature = `move:${command.direction}`;
  else if (command.type === 'prepare' && only(command, 'type,frontierId')) { validId(command.frontierId); signature = `prepare:${command.frontierId}`; }
  else if ((command.type === 'collect' || command.type === 'finish') && only(command, 'type')) signature = command.type;
  else throw new Error('Stream persistence: invalid command');
  return JSON.stringify([2, request.actionId, request.sessionId, request.epoch, request.expectedRevision, request.expectedTopologyRevision, signature]);
}
export function validateStreamControl(control: StreamControl) {
  streamCheck(object(control) && only(control, 'sessionId,epoch') && natural(control.epoch), 'invalid control');
  validId(control.sessionId);
}
export function validateStreamCheckpoint(value: StreamCheckpoint, header: TopologyHeader) {
  streamCheck(object(value) && only(value, 'version,worldId,floorId,scopeId,revision,topologyRevision,position,home,phase,moves,visitedSpaces,clearedSpaces,collectedChests')
    && value.version === 2 && value.worldId === header.recipe.worldId && value.floorId === header.recipe.floorId && value.scopeId === header.scopeId
    && natural(value.revision) && value.topologyRevision === header.revision && ['exploring', 'complete'].includes(value.phase)
    && natural(value.moves) && value.moves <= value.revision && natural(value.visitedSpaces) && value.visitedSpaces >= 1
    && value.visitedSpaces <= value.moves + 1 && value.moves + value.collectedChests + value.topologyRevision <= value.revision
    && value.visitedSpaces <= 2 * header.rooms - 1 && natural(value.clearedSpaces) && value.clearedSpaces <= value.visitedSpaces
    && natural(value.collectedChests) && value.collectedChests < header.rooms
    && value.collectedChests <= Math.floor((value.visitedSpaces - 1) / 2), 'invalid checkpoint identity or counters');
  validAddress(value.position); validAddress(value.home);
  streamCheck(sameAddress(value.home, header.start), 'home changed');
  if (value.phase === 'complete') streamCheck(header.seal && sameAddress(value.position, value.home)
    && value.clearedSpaces === 2 * header.rooms - 1 && value.collectedChests === header.rooms - 1, 'invalid completion');
}
export function validateStreamReceipt(receipt: StreamActionReceipt, actionId: string, checkpoint: StreamCheckpoint) {
  streamCheck(object(receipt) && only(receipt, 'request,signature,result') && receipt.signature === streamActionSignature(receipt.request)
    && receipt.request.actionId === actionId, 'invalid action receipt identity');
  const result = receipt.result;
  streamCheck(object(result) && only(result, 'actionId,disposition,beforeRevision,afterRevision,topologyRevision,reason')
    && result.actionId === actionId && ['applied', 'refused'].includes(result.disposition)
    && result.beforeRevision === receipt.request.expectedRevision
    && natural(result.afterRevision) && result.afterRevision === result.beforeRevision + (result.disposition === 'applied' ? 1 : 0)
    && result.afterRevision <= checkpoint.revision && natural(result.topologyRevision) && result.topologyRevision <= checkpoint.topologyRevision
    && result.topologyRevision >= receipt.request.expectedTopologyRevision
    && result.topologyRevision <= receipt.request.expectedTopologyRevision + (result.disposition === 'applied' && receipt.request.command.type === 'prepare' ? 1 : 0)
    && typeof result.reason === 'string' && result.reason.length <= 2048, 'invalid compact action result');
}
