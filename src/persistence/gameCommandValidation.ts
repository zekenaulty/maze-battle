import { canonicalJson } from '../services/agentica/sdk/agentica-host.mjs';
import type { GameCommandReceipt, GameCommandRequest } from './gameCommandTypes';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, fields: string): value is Record<string, unknown> => object(value)
  && Object.keys(value).sort().join(',') === fields.split(',').sort().join(',');
const text = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128;
const integer = (value: unknown, minimum = 0) => Number.isSafeInteger(value) && (value as number) >= minimum;
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid game command or receipt.');
}

export function commandFingerprint(input: GameCommandRequest): string {
  check(exact(input, 'attemptId,gameId,floor,position,control,deadlineAt,command'));
  check(text(input.attemptId) && text(input.gameId) && integer(input.floor, 1) && integer(input.deadlineAt));
  check(exact(input.position, 'row,column') && integer(input.position.row) && integer(input.position.column));
  check(exact(input.control, 'owner,epoch,revision') && text(input.control.owner)
    && integer(input.control.epoch, 1) && integer(input.control.revision));
  check(object(input.command));
  const command = input.command;
  check(command.type === 'move' ? exact(command, 'type,direction,triggerStairs')
    && ['north', 'east', 'south', 'west'].includes(command.direction as string) && typeof command.triggerStairs === 'boolean'
    : command.type === 'open-chest' && exact(command, 'type,chestId') && text(command.chestId));
  return canonicalJson(input);
}

/** Fail closed on corrupt originals; never reinterpret a receipt as an unexecuted command. */
export function validateCommandReceipt(value: unknown, request: GameCommandRequest, fingerprint: string): GameCommandReceipt {
  check(object(value));
  const hasHead = Object.hasOwn(value, 'observationHead');
  check(exact(value, `version,attemptId,fingerprint,gameId,beforeRevision,afterRevision,committedAt,outcome${hasHead ? ',observationHead' : ''}`));
  check(!hasHead || text(value.observationHead));
  check(value.version === 1 && value.attemptId === request.attemptId && value.gameId === request.gameId
    && value.fingerprint === fingerprint && integer(value.beforeRevision) && integer(value.afterRevision)
    && integer(value.committedAt) && exact(value.outcome, 'status,reason'));
  const { status, reason } = value.outcome;
  const applied = status === 'applied' && (reason === 'moved' && request.command.type === 'move'
    || reason === 'opened' && request.command.type === 'open-chest');
  const refused = status === 'refused' && ['blocked', 'ineligible'].includes(reason as string);
  const settled = status === 'not-applied' && ['conflict', 'expired', 'settled'].includes(reason as string);
  check(applied || refused || settled);
  check(!settled || !hasHead);
  check(settled ? value.afterRevision === value.beforeRevision
    : value.beforeRevision === request.control.revision && value.afterRevision === (value.beforeRevision as number) + 1);
  return value as unknown as GameCommandReceipt;
}
