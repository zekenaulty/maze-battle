import { streamActionSignature } from '../../../persistence/streamValidation';
import type { StreamActionRequest } from '../../../domain/expedition/streaming/types';
import { PLANNING_PROTOCOL, type PlanningAction, type PlanningBinding, type PlanningLimits, type ServiceMessage } from './contracts';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const only = (value: object, keys: string) => Object.keys(value).every(key => keys.split(',').includes(key));
const natural = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const id = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const check = (value: unknown, message: string) => { if (!value) throw new Error(`Planning protocol: ${message}`); };
const BINDING_KEYS = 'sessionId,epoch,runId,objectiveId,actorId,worldId,floorId,scopeId';

export function validateBinding(value: PlanningBinding) {
  check(object(value) && only(value, BINDING_KEYS) && natural(value.epoch)
    && BINDING_KEYS.split(',').filter(key => key !== 'epoch').every(key => id(value[key as keyof PlanningBinding])), 'invalid binding');
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.scopeId), 'scope must be opaque');
}
export function sameBinding(value: PlanningBinding, expected: PlanningBinding) {
  return BINDING_KEYS.split(',').every(key => value[key as keyof PlanningBinding] === expected[key as keyof PlanningBinding]);
}
export function validateLimits(value: PlanningLimits) {
  check(object(value) && only(value, 'actions,elapsedMs,frameBytes') && natural(value.actions) && value.actions >= 1 && value.actions <= 4096
    && natural(value.elapsedMs) && value.elapsedMs >= 1 && value.elapsedMs <= 900_000
    && natural(value.frameBytes) && value.frameBytes >= 1024 && value.frameBytes <= 131_072, 'invalid run limits');
}
export function actionRequest(message: PlanningAction): StreamActionRequest {
  const result: StreamActionRequest = { version: 2, actionId: message.actionId, sessionId: message.binding.sessionId, epoch: message.binding.epoch,
    expectedRevision: message.expectedRevision, expectedTopologyRevision: message.expectedTopologyRevision, command: structuredClone(message.command) };
  streamActionSignature(result);
  return result;
}

/** Only complete, bounded JSON messages enter the command path. Progress is never executable. */
export function parseServiceMessage(text: string): ServiceMessage {
  check(typeof text === 'string' && text.length <= 16_384 && new TextEncoder().encode(text).byteLength <= 16_384, 'message too large');
  const value: unknown = JSON.parse(text);
  check(object(value), 'invalid envelope');
  const message = value as ServiceMessage;
  check(message.protocol === PLANNING_PROTOCOL, 'unsupported protocol');
  validateBinding(message.binding);
  const common = 'protocol,binding,type';
  if (message.type === 'action.request' || message.type === 'action.query') {
    check(only(message, `${common},actionId,expectedRevision,expectedTopologyRevision,command`), 'unknown action fields');
    actionRequest(message);
  } else if (message.type === 'observe') {
    check(only(message, common), 'unknown observation fields');
  } else if (message.type === 'progress') {
    check(only(message, `${common},sequence,stage,summary`) && natural(message.sequence)
      && ['planning', 'executing', 'evaluating'].includes(message.stage)
      && typeof message.summary === 'string' && message.summary.length <= 512, 'invalid progress');
  } else if (message.type === 'outcome') {
    check(only(message, `${common},status,resultActionId,summary`) && ['complete', 'budget', 'blocked', 'cancelled'].includes(message.status)
      && typeof message.summary === 'string' && message.summary.length <= 512
      && (message.resultActionId === undefined || id(message.resultActionId)), 'invalid outcome');
  } else throw new Error('Planning protocol: unsupported message type');
  return message;
}
