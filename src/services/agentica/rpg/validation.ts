import { integer, validAddress, validId } from '../../../domain/agentic/knowledge/shared';
import type { RpgAddress } from '../../../domain/agentic/knowledge/types';
import { snapshotDestinationLimits } from '../../../domain/directed/destinationLimits';
import { validKey } from '../../../persistence/rpgMemory/treeTypes';
import type { AgenticaAction } from '../contracts';
import type { RpgAgenticaBinding, RpgCommand, RpgContextCommand } from './contracts';

export function requireRpg(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RPG Agentica: ${message}`);
}

/** Exact JSON data properties, including rejection of hidden keys and accessors. */
export function rpgShape(value: unknown, required: string, optional = ''): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = required ? required.split(',') : [], allowed = [...keys, ...optional.split(',').filter(Boolean)];
  return keys.every(key => Object.hasOwn(value, key)) && Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return typeof key === 'string' && allowed.includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}

const id = (value: unknown): value is string => typeof value === 'string' && validId(value)
  && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
export const rpgScopeId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const address = (value: unknown): value is RpgAddress => rpgShape(value, 'floor,row,column')
  && validAddress(value as unknown as RpgAddress);

export function validateRpgBinding(binding: unknown): asserts binding is RpgAgenticaBinding {
  requireRpg(rpgShape(binding, 'protocolVersion,hostId,sessionId,sessionEpoch,scopeId,perspectiveId,gameId,floor,objectiveId,objective,runId,manifestHash,control,completionTarget,travelLimits', 'parentOperationId')
    && binding.protocolVersion === 1 && binding.hostId === 'maze-battle' && binding.perspectiveId === 'party', 'invalid binding shape');
  requireRpg([binding.sessionId, binding.sessionEpoch, binding.gameId, binding.objectiveId, binding.runId].every(id)
    && rpgScopeId(binding.scopeId) && binding.sessionId === binding.scopeId, 'invalid binding identity');
  requireRpg(typeof binding.objective === 'string' && binding.objective.trim().length > 0 && binding.objective.length <= 4000
    && (!Object.hasOwn(binding, 'parentOperationId') || id(binding.parentOperationId)), 'invalid objective or parent operation');
  const control = binding.control;
  requireRpg(rpgShape(control, 'owner,epoch,revision') && id(control.owner) && integer(control.epoch as number, 1)
    && integer(control.revision as number, 0) && binding.sessionEpoch === String(control.epoch), 'invalid ownership fence');
  requireRpg(typeof binding.manifestHash === 'string' && /^sha256:[0-9a-f]{64}$/.test(binding.manifestHash), 'invalid manifest hash');
  requireRpg(integer(binding.floor as number, 1) && address(binding.completionTarget)
    && binding.completionTarget.floor === binding.floor, 'invalid completion target');
  requireRpg(rpgShape(binding.travelLimits, 'steps,replans,durationMs'), 'invalid travel limits');
  snapshotDestinationLimits(binding.travelLimits);
}

export function validateRpgContext(command: unknown): asserts command is RpgContextCommand {
  requireRpg(rpgShape(command, 'type', 'target,roomId,limit,snapshotId,after'), 'invalid context command');
  if (command.type === 'inspect') {
    requireRpg(rpgShape(command, 'type,target') && address(command.target), 'invalid inspection target');
    return;
  }
  requireRpg((command.type === 'room' && rpgShape(command, 'type,roomId,limit', 'snapshotId,after') && id(command.roomId))
    || (command.type === 'map' && rpgShape(command, 'type,limit', 'snapshotId,after')), 'invalid context kind');
  requireRpg(integer(command.limit as number, 1, command.type === 'room' ? 32 : 12), 'invalid context limit');
  requireRpg((!Object.hasOwn(command, 'snapshotId') || id(command.snapshotId))
    && (!Object.hasOwn(command, 'after') || validKey(command.after) && id(command.snapshotId)), 'invalid context cursor');
}

/** Same SDK envelope custody as the legacy parser; expiry/revision conflicts belong to reconciled admission. */
export function parseRpgAction(action: AgenticaAction, binding: RpgAgenticaBinding): RpgCommand {
  validateRpgBinding(binding);
  requireRpg(rpgShape(action, 'actionId,runId,runnerRunId,stepId,sessionId,sessionEpoch,capabilityId,manifestHash,arguments,expectedRevision,deadlineAt')
    && [action.actionId, action.runId, action.runnerRunId, action.stepId, action.sessionId, action.sessionEpoch, action.capabilityId].every(id), 'invalid action envelope');
  requireRpg(action.runId === binding.runId && action.sessionId === binding.sessionId && action.sessionEpoch === binding.sessionEpoch
    && action.manifestHash === binding.manifestHash, 'action binding changed');
  requireRpg(integer(action.expectedRevision, 0) && typeof action.deadlineAt === 'string'
    && Number.isFinite(Date.parse(action.deadlineAt)), 'invalid action revision or deadline');
  const args = action.arguments;
  if (action.capabilityId === 'maze.observe') {
    requireRpg(rpgShape(args, ''), 'observe takes no arguments');
    return { type: 'observe' };
  }
  if (action.capabilityId === 'maze.navigate' || action.capabilityId === 'maze.inspect') {
    requireRpg(rpgShape(args, 'row,column'), 'invalid target arguments');
    const target = { floor: binding.floor, row: args.row, column: args.column } as RpgAddress;
    requireRpg(validAddress(target), 'invalid target');
    return { type: action.capabilityId === 'maze.navigate' ? 'navigate' : 'inspect', target };
  }
  const room = action.capabilityId === 'maze.room';
  requireRpg((room || action.capabilityId === 'maze.map')
    && rpgShape(args, room ? 'roomId,limit' : 'limit', 'snapshotId,after'), 'unbound capability or arguments');
  const command = { type: room ? 'room' : 'map', ...args };
  validateRpgContext(command);
  return command;
}
