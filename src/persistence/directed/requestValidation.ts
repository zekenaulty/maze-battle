import type { DirectedRequest, NavigationOperation } from '../../domain/directed/operationTypes';
import { DIRECTED_LIMITS } from '../../domain/directed/types';
import { check, id, integer, keys, list, object, serializable, text } from './values';
import { validateDestinationBudget } from '../../domain/directed/destinationBudgetValidation';

export function address(value: unknown) {
  object(value); keys(value, ['spaceId', 'row', 'column']); id(value.spaceId);
  integer(value.row, 511); integer(value.column, 511);
}
export function target(value: unknown) {
  object(value);
  if (value.kind === 'cell') {
    keys(value, ['kind', 'address', 'arrival']); address(value.address);
    check(value.arrival === 'occupy', 'invalid cell arrival');
  } else {
    keys(value, ['kind', 'featureId', 'arrival']); id(value.featureId);
    check(value.kind === 'feature' && value.arrival === 'adjacent', 'invalid feature arrival');
  }
}
export function request(value: unknown): asserts value is DirectedRequest {
  serializable(value, DIRECTED_LIMITS.bytes); object(value);
  keys(value, ['attemptId', 'owner', 'epoch', 'expectedRevision', 'command']);
  id(value.attemptId); id(value.owner); integer(value.epoch); integer(value.expectedRevision);
  object(value.command);
  const command = value.command;
  switch (command.type) {
    case 'navigate': keys(command, ['type', 'operationId', 'target']); id(command.operationId); target(command.target); break;
    case 'step': keys(command, ['type', 'operationId', 'sequence']); id(command.operationId); integer(command.sequence); break;
    case 'cancel': keys(command, ['type', 'operationId']); id(command.operationId); break;
    case 'look': keys(command, ['type']); break;
    case 'inspect': keys(command, ['type', 'direction']);
      check(['here', 'north', 'east', 'south', 'west'].includes(command.direction as string), 'invalid inspection direction'); break;
    case 'retry-crossing': keys(command, ['type', 'to']); address(command.to); break;
    case 'interact': keys(command, ['type', 'featureId']); id(command.featureId); break;
    default: throw new Error('Directed storage: invalid command');
  }
}
export function operation(value: unknown): asserts value is NavigationOperation {
  object(value); keys(value, ['id', 'target', 'status', 'epoch', 'steps', 'replans', 'nextStep', 'route', 'reason', 'startedAt', 'deadline'], ['limits']);
  id(value.id); target(value.target); integer(value.epoch);
  check(['running', 'arrived', 'cancelled', 'interrupted'].includes(value.status as string), 'invalid operation status');
  validateDestinationBudget(value as unknown as NavigationOperation);
  list(value.route, DIRECTED_LIMITS.cells);
  value.route.forEach(address); text(value.reason);
}
