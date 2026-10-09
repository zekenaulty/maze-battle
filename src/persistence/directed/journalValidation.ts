import type { DirectedReceipt, DirectedSession } from '../../domain/directed/operationTypes';
import { DIRECTED_LIMITS, DIRECTED_VERSION, type PresentedContext, type WorldEvent } from '../../domain/directed/types';
import { address, operation, request } from './requestValidation';
import { check, id, integer, keys, list, object, serializable, text, utf8Bytes } from './values';

export function event(value: unknown, current: DirectedSession): asserts value is WorldEvent {
  serializable(value); object(value); keys(value, ['id', 'revision', 'type', 'subjectId'], ['position', 'before', 'after']);
  id(value.id); id(value.subjectId); integer(value.revision);
  check(value.revision > 0 && value.revision <= current.world.revision, 'invalid event revision');
  check(['move', 'interact', 'fixture-change'].includes(value.type as string), 'invalid event type');
  if (value.position !== undefined) address(value.position);
  if (value.before !== undefined) text(value.before);
  if (value.after !== undefined) text(value.after);
}
export function context(value: unknown, current: DirectedSession): asserts value is PresentedContext {
  serializable(value, DIRECTED_LIMITS.bytes * 2); object(value);
  keys(value, ['id', 'observerId', 'knowledgeRevision', 'purpose', 'observationIds', 'json', 'bytes']);
  id(value.id); integer(value.knowledgeRevision); integer(value.bytes, DIRECTED_LIMITS.bytes);
  check(value.observerId === current.actor.id && value.knowledgeRevision <= current.knowledge.revision, 'context scope mismatch');
  check(value.purpose === 'human-view' || value.purpose === 'decision-fixture', 'invalid context purpose');
  list(value.observationIds, DIRECTED_LIMITS.history); value.observationIds.forEach(id);
  check(new Set(value.observationIds).size === value.observationIds.length, 'duplicate context evidence');
  check(typeof value.json === 'string' && utf8Bytes(value.json) === value.bytes, 'context byte mismatch');
  const body: unknown = JSON.parse(value.json);
  object(body);
  check(body.version === DIRECTED_VERSION && body.worldId === current.world.id && body.floorId === current.world.floorId
    && body.observerId === value.observerId && body.knowledgeRevision === value.knowledgeRevision, 'presented context envelope mismatch');
}
export function receipt(value: unknown, current: DirectedSession): asserts value is DirectedReceipt {
  serializable(value); object(value); keys(value, ['request', 'result', 'revision', 'observationIds', 'eventIds']);
  request(value.request); integer(value.revision);
  check(value.revision <= current.revision && value.revision >= value.request.expectedRevision
    && value.request.epoch <= current.epoch, 'receipt sequence mismatch');
  object(value.result); keys(value.result, ['status', 'reason', 'position'], ['operation']);
  check(value.result.status === 'applied' || value.result.status === 'refused', 'invalid receipt outcome');
  text(value.result.reason); address(value.result.position);
  if (value.result.operation !== undefined) {
    operation(value.result.operation);
    check(value.result.operation.epoch <= value.request.epoch, 'receipt operation epoch mismatch');
  }
  for (const values of [value.observationIds, value.eventIds]) {
    list(values, DIRECTED_LIMITS.history); values.forEach(id);
    check(new Set(values).size === values.length, 'duplicate receipt evidence');
  }
}
