import type { MemoryContextSelection } from '../../domain/directed/contextSelection';
import { memoryBounds } from '../../domain/directed/memory/bounds';
import { address } from './requestValidation';
import { check, id, keys, object } from './values';

export function memorySelection(value: unknown): asserts value is MemoryContextSelection {
  object(value);
  if (value.kind === 'overview') keys(value, ['kind'], ['bounds']);
  else {
    check(value.kind === 'destination', 'unsupported memory context kind'); keys(value, ['kind', 'target'], ['bounds']);
    object(value.target);
    if (value.target.kind === 'cell') { keys(value.target, ['kind', 'address']); address(value.target.address); }
    else if (value.target.kind === 'room') { keys(value.target, ['kind', 'roomId']); id(value.target.roomId); }
    else {
      check(value.target.kind === 'feature', 'unsupported recall target'); keys(value.target, ['kind', 'featureId']); id(value.target.featureId);
    }
  }
  memoryBounds(value.bounds as Parameters<typeof memoryBounds>[0]);
}
