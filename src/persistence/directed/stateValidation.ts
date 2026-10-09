import type { DirectedSession } from '../../domain/directed/operationTypes';
import { addressKey } from '../../domain/expedition/address';
import type { CellAddress } from '../../domain/expedition/types';
import type { DirectedCell, DirectedSpace, DirectedWorld, KnowledgeProjection, ObservationReceipt, ObservedFeature } from '../../domain/directed/types';
import { DIRECTED_VERSION } from '../../domain/directed/types';
import { address, operation } from './requestValidation';
import { check, entries, id, integer, keys, list, object, serializable, text } from './values';

function cell(value: unknown): asserts value is DirectedCell {
  object(value); keys(value, ['address', 'exits']); address(value.address);
  for (const [direction, destination] of entries(value.exits)) {
    check(['north', 'east', 'south', 'west'].includes(direction), 'invalid exit direction'); address(destination);
  }
}
function edge(value: unknown): asserts value is { from: CellAddress; to: CellAddress } {
  object(value); keys(value, ['from', 'to']); address(value.from); address(value.to);
}
function space(value: unknown): asserts value is DirectedSpace {
  object(value); keys(value, ['id', 'name', 'originX', 'originZ', 'rows', 'columns']); id(value.id); text(value.name);
  check(Number.isSafeInteger(value.originX) && Number.isSafeInteger(value.originZ), 'invalid space origin');
  integer(value.rows, 512); integer(value.columns, 512);
  check(value.rows > 0 && value.columns > 0 && value.rows * value.columns <= 512, 'invalid space dimensions');
  check(Number.isSafeInteger((value.originX as number) + (value.columns - 1))
    && Number.isSafeInteger((value.originZ as number) + (value.rows - 1)), 'invalid space extent');
}
function feature(value: unknown, truth = false): asserts value is ObservedFeature {
  object(value); keys(value, ['id', 'kind', 'name', 'position', 'state'], truth ? ['hidden'] : []);
  id(value.id); text(value.name); address(value.position);
  check(['lever', 'door', 'trap', 'chest', 'altar'].includes(value.kind as string), 'invalid feature kind');
  check(['idle', 'active', 'locked', 'closed', 'open'].includes(value.state as string), 'invalid feature state');
  check(value.hidden === undefined || typeof value.hidden === 'boolean', 'invalid hidden marker');
}
function worldPosition(position: CellAddress, current: DirectedWorld) {
  check(Object.hasOwn(current.spaces, position.spaceId), 'world position references missing space');
  const space = current.spaces[position.spaceId];
  check(position.row < space.rows && position.column < space.columns, 'world position outside space dimensions');
  check(Object.hasOwn(current.cells, addressKey(position)), 'world position references missing cell');
  return { x: space.originX + position.column, z: space.originZ + position.row };
}
export function world(value: unknown): asserts value is DirectedWorld {
  serializable(value); object(value); keys(value, ['id', 'floorId', 'revision', 'spaces', 'cells', 'features']);
  id(value.id); id(value.floorId); integer(value.revision);
  for (const [key, item] of entries(value.spaces)) { space(item); check(item.id === key, 'space key mismatch'); }
  for (const [key, item] of entries(value.cells)) { cell(item); check(addressKey(item.address) === key, 'cell key mismatch'); }
  for (const [key, item] of entries(value.features)) { feature(item, true); check(item.id === key, 'feature key mismatch'); }
  const current = value as unknown as DirectedWorld;
  const offsets = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
  for (const item of Object.values(current.cells)) {
    const from = worldPosition(item.address, current);
    for (const [direction, destination] of Object.entries(item.exits)) {
      const to = worldPosition(destination, current);
      const [dx, dz] = offsets[direction as keyof typeof offsets];
      check(to.x - from.x === dx && to.z - from.z === dz, 'exit direction coordinate mismatch');
    }
  }
  for (const item of Object.values(current.features)) worldPosition(item.position, current);
}
export function projection(value: unknown): asserts value is KnowledgeProjection {
  serializable(value); object(value); keys(value, ['worldId', 'observerId', 'revision', 'cells', 'spaces', 'features', 'absent'], ['blockedEdges']);
  id(value.worldId); id(value.observerId); integer(value.revision);
  // Remembered exits can reach unobserved cells; do not reconcile them with live truth.
  for (const name of ['cells', 'spaces', 'features'] as const) {
    for (const [key, item] of entries(value[name])) {
      object(item); keys(item, ['value', 'observationId', 'observedAt']);
      id(item.observationId); integer(item.observedAt);
      check(item.observedAt > 0 && item.observedAt <= value.revision, 'invalid projection evidence sequence');
      if (name === 'cells') { cell(item.value); check(addressKey(item.value.address) === key, 'remembered cell key mismatch'); }
      else {
        if (name === 'spaces') space(item.value); else feature(item.value);
        check(item.value.id === key, 'remembered identity key mismatch');
      }
    }
  }
  for (const [key, item] of entries(value.absent)) {
    id(key); object(item); keys(item, ['observationId', 'observedAt']); id(item.observationId); integer(item.observedAt);
    check(item.observedAt > 0 && item.observedAt <= value.revision, 'invalid absence evidence sequence');
  }
  if (value.blockedEdges !== undefined) for (const [key, item] of entries(value.blockedEdges)) {
    object(item); keys(item, ['value', 'observationId', 'observedAt']); edge(item.value);
    check(key === `${addressKey(item.value.from)}>${addressKey(item.value.to)}`, 'blocked edge key mismatch');
    id(item.observationId); integer(item.observedAt);
    check(item.observedAt > 0 && item.observedAt <= value.revision, 'invalid blocked edge evidence sequence');
  }
}
export function session(value: unknown): asserts value is DirectedSession {
  serializable(value); object(value); keys(value, ['version', 'revision', 'epoch', 'world', 'actor', 'knowledge'], ['owner', 'operation']);
  check(value.version === DIRECTED_VERSION, 'unsupported save version'); integer(value.revision); integer(value.epoch);
  if (value.owner !== undefined) id(value.owner);
  world(value.world); projection(value.knowledge);
  object(value.actor); keys(value.actor, ['id', 'position']); id(value.actor.id); address(value.actor.position);
  worldPosition(value.actor.position as unknown as CellAddress, value.world);
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
  object(value.scene); keys(value.scene, ['position', 'cells', 'spaces', 'features', 'absentFeatureIds'], ['traversal']); address(value.scene.position);
  for (const name of ['cells', 'spaces', 'features', 'absentFeatureIds']) list(value.scene[name]);
  (value.scene.cells as unknown[]).forEach(cell); (value.scene.spaces as unknown[]).forEach(space);
  (value.scene.features as unknown[]).forEach(item => feature(item)); (value.scene.absentFeatureIds as unknown[]).forEach(id);
  if (value.scene.traversal !== undefined) {
    object(value.scene.traversal); keys(value.scene.traversal, ['from', 'to', 'passable']);
    address(value.scene.traversal.from); address(value.scene.traversal.to);
    check(typeof value.scene.traversal.passable === 'boolean', 'invalid traversal passability');
  }
}
