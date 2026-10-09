import type { DirectedSession } from '../../domain/directed/operationTypes';
import type { DirectedWorld, KnowledgeProjection, ObservationReceipt } from '../../domain/directed/types';
import { DIRECTED_VERSION } from '../../domain/directed/types';
import { address, operation } from './requestValidation';
import { check, entries, id, integer, keys, list, object, serializable, text } from './values';

function cell(value: unknown) {
  object(value); keys(value, ['address', 'exits']); address(value.address);
  for (const [direction, destination] of entries(value.exits)) {
    check(['north', 'east', 'south', 'west'].includes(direction), 'invalid exit direction'); address(destination);
  }
}
function space(value: unknown) {
  object(value); keys(value, ['id', 'name', 'originX', 'originZ', 'rows', 'columns']); id(value.id); text(value.name);
  check(Number.isSafeInteger(value.originX) && Number.isSafeInteger(value.originZ), 'invalid space origin');
  integer(value.rows, 512); integer(value.columns, 512);
  check(value.rows > 0 && value.columns > 0 && value.rows * value.columns <= 512, 'invalid space dimensions');
}
function feature(value: unknown, truth = false) {
  object(value); keys(value, ['id', 'kind', 'name', 'position', 'state'], truth ? ['hidden'] : []);
  id(value.id); text(value.name); address(value.position);
  check(['lever', 'door', 'trap', 'chest', 'altar'].includes(value.kind as string), 'invalid feature kind');
  check(['idle', 'active', 'locked', 'closed', 'open'].includes(value.state as string), 'invalid feature state');
  check(value.hidden === undefined || typeof value.hidden === 'boolean', 'invalid hidden marker');
}
export function world(value: unknown): asserts value is DirectedWorld {
  serializable(value); object(value); keys(value, ['id', 'floorId', 'revision', 'spaces', 'cells', 'features']);
  id(value.id); id(value.floorId); integer(value.revision);
  for (const [key, item] of entries(value.spaces)) { space(item); check((item as { id: string }).id === key, 'space key mismatch'); }
  for (const [, item] of entries(value.cells)) cell(item);
  for (const [key, item] of entries(value.features)) { feature(item, true); check((item as { id: string }).id === key, 'feature key mismatch'); }
}
export function projection(value: unknown): asserts value is KnowledgeProjection {
  serializable(value); object(value); keys(value, ['worldId', 'observerId', 'revision', 'cells', 'spaces', 'features', 'absent']);
  id(value.worldId); id(value.observerId); integer(value.revision);
  const validators = { cells: cell, spaces: space, features: feature };
  for (const [name, validate] of Object.entries(validators)) {
    for (const [, item] of entries(value[name])) {
      object(item); keys(item, ['value', 'observationId', 'observedAt']);
      id(item.observationId); integer(item.observedAt); check(item.observedAt <= value.revision, 'future projection evidence');
      validate(item.value);
    }
  }
  for (const [key, item] of entries(value.absent)) {
    id(key); object(item); keys(item, ['observationId', 'observedAt']); id(item.observationId); integer(item.observedAt);
    check(item.observedAt <= value.revision, 'future absence evidence');
  }
}
export function session(value: unknown): asserts value is DirectedSession {
  serializable(value); object(value); keys(value, ['version', 'revision', 'epoch', 'world', 'actor', 'knowledge'], ['owner', 'operation']);
  check(value.version === DIRECTED_VERSION, 'unsupported save version'); integer(value.revision); integer(value.epoch);
  if (value.owner !== undefined) id(value.owner);
  world(value.world); projection(value.knowledge);
  object(value.actor); keys(value.actor, ['id', 'position']); id(value.actor.id); address(value.actor.position);
  check(value.knowledge.worldId === value.world.id && value.knowledge.observerId === value.actor.id, 'save scope mismatch');
  if (value.operation !== undefined) {
    operation(value.operation); check(value.operation.epoch <= value.epoch, 'future operation epoch');
    check(value.operation.status !== 'running' || value.operation.epoch === value.epoch, 'unfenced running operation');
  }
}
export function observation(value: unknown, current: DirectedSession): asserts value is ObservationReceipt {
  serializable(value); object(value);
  keys(value, ['id', 'worldId', 'observerId', 'sequence', 'sourceWorldRevision', 'policyVersion', 'reason', 'coverage', 'scene']);
  id(value.id); integer(value.sequence); integer(value.sourceWorldRevision);
  check(value.worldId === current.world.id && value.observerId === current.actor.id, 'observation scope mismatch');
  check(value.sequence <= current.knowledge.revision && value.sourceWorldRevision <= current.world.revision, 'future observation');
  check(value.policyVersion === 'fixture-visibility-v1', 'unsupported observation policy');
  check(['prelude', 'look', 'travel', 'interaction', 'obstruction'].includes(value.reason as string), 'invalid observation reason');
  object(value.coverage); keys(value.coverage, ['radius', 'basis', 'complete']); integer(value.coverage.radius, 512);
  check(value.coverage.basis === 'connected-cells' && value.coverage.complete === true, 'invalid observation coverage');
  object(value.scene); keys(value.scene, ['position', 'cells', 'spaces', 'features', 'absentFeatureIds']); address(value.scene.position);
  for (const name of ['cells', 'spaces', 'features', 'absentFeatureIds']) list(value.scene[name]);
  (value.scene.cells as unknown[]).forEach(cell); (value.scene.spaces as unknown[]).forEach(space);
  (value.scene.features as unknown[]).forEach(item => feature(item)); (value.scene.absentFeatureIds as unknown[]).forEach(id);
}
