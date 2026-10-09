import type { StreamCommand } from '../../domain/expedition/streaming/types';
import type { Direction } from '../../domain/types';
import type { AgenticaAction, AgenticaGameBinding } from './contracts';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const only = (value: object, fields: string) => Object.keys(value).every(key => fields.split(',').includes(key));
const id = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
const natural = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(`Agentica host: ${message}`); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAgenticaBinding(binding: AgenticaGameBinding) {
  check(object(binding) && only(binding, 'protocolVersion,hostId,sessionId,sessionEpoch,scopeId,perspectiveId,worldId,floorId,objectiveId,objective,runId,manifestHash,control')
    && binding.protocolVersion === 1 && binding.hostId === 'maze-battle' && binding.perspectiveId === 'party'
    && ['first-chest', 'explore-collect-return'].includes(binding.objective), 'invalid run binding');
  for (const value of [binding.sessionId, binding.sessionEpoch, binding.scopeId, binding.worldId, binding.floorId, binding.objectiveId, binding.runId]) check(id(value), 'invalid binding identity');
  check(uuid.test(binding.scopeId) && binding.sessionId === binding.scopeId, 'session requires the public scope UUID');
  check(object(binding.control) && only(binding.control, 'sessionId,epoch') && id(binding.control.sessionId) && natural(binding.control.epoch)
    && binding.sessionEpoch === String(binding.control.epoch), 'invalid ownership fence');
  check(typeof binding.manifestHash === 'string' && /^sha256:[0-9a-f]{64}$/.test(binding.manifestHash), 'invalid manifest hash');
}

/** The caller checks expiry only for NEW attempts, after exact result reconciliation. */
export function parseAgenticaCommand(action: AgenticaAction, binding: AgenticaGameBinding): StreamCommand | { type: 'observe' } {
  validateAgenticaBinding(binding);
  check(object(action) && only(action, 'actionId,runId,runnerRunId,stepId,sessionId,sessionEpoch,capabilityId,manifestHash,arguments,expectedRevision,deadlineAt'), 'invalid action');
  for (const value of [action.actionId, action.runId, action.runnerRunId, action.stepId, action.sessionId, action.sessionEpoch, action.capabilityId]) check(id(value), 'invalid action identity');
  check(action.runId === binding.runId && action.sessionId === binding.sessionId && action.sessionEpoch === binding.sessionEpoch
    && action.manifestHash === binding.manifestHash, 'action binding changed');
  check(natural(action.expectedRevision) && typeof action.deadlineAt === 'string' && Number.isFinite(Date.parse(action.deadlineAt)), 'invalid action revision or deadline');
  const args = action.arguments;
  check(object(args) && natural(args.topologyRevision), 'missing topology revision');
  if (action.capabilityId === 'maze.move') {
    check(only(args, 'topologyRevision,direction') && ['north', 'east', 'south', 'west'].includes(args.direction as string), 'invalid movement');
    return { type: 'move', direction: args.direction as Direction };
  }
  if (action.capabilityId === 'maze.prepare') {
    check(only(args, 'topologyRevision,frontierId') && id(args.frontierId), 'invalid frontier');
    return { type: 'prepare', frontierId: args.frontierId as string };
  }
  check(only(args, 'topologyRevision'), 'unexpected capability arguments');
  if (action.capabilityId === 'maze.observe') return { type: 'observe' };
  if (action.capabilityId === 'maze.collect') return { type: 'collect' };
  if (action.capabilityId === 'maze.finish') return { type: 'finish' };
  throw new Error('Agentica host: unbound capability');
}
