import type { Direction } from '../../types';
import { cellKey } from '../../maze/key';
import { movePosition, opposite } from '../../maze/movement';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgAddress, type RpgKnowledge,
  type RpgObservationIdentity, type RpgRefusalReason, type RpgRefusal, type RpgSource } from './types';

export const directions: readonly Direction[] = ['north', 'east', 'south', 'west'];
export const roomKey = (id: string) => JSON.stringify(id);
export const integer = (value: number, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
export const validId = (id: string) => typeof id === 'string' && id.length > 0 && id.length <= LIMITS.idLength;
export const validTime = (time: string) => typeof time === 'string' && time.length <= 40 && Number.isFinite(Date.parse(time));
export const validAddress = (address: RpgAddress) => !!address && integer(address.floor, 1)
  && integer(address.row, 0, Number.MAX_SAFE_INTEGER - 1) && integer(address.column, 0, Number.MAX_SAFE_INTEGER - 1);
export const refused = (reason: RpgRefusalReason): RpgRefusal => ({ status: 'refused', reason });
export const cellAt = (knowledge: RpgKnowledge, address: RpgAddress) =>
  knowledge.floors[address.floor]?.cells[cellKey(address)];

export function validIdentity(identity: RpgObservationIdentity) {
  return !!identity && validId(identity.id) && validTime(identity.observedAt) && !!identity.revision
    && validId(identity.revision.owner) && integer(identity.revision.epoch, 0) && integer(identity.revision.revision, 0);
}

export function sourceOf(source: RpgSource): RpgSource {
  return { id: source.id, gameId: source.gameId, observedAt: source.observedAt,
    revision: { owner: source.revision.owner, epoch: source.revision.epoch, revision: source.revision.revision } };
}

/** Freeze only owned data. Callers must copy any shared input before using this. */
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function knownNeighbours(knowledge: RpgKnowledge, from: RpgAddress) {
  const cell = cellAt(knowledge, from);
  return directions.flatMap(direction => {
    if (cell?.edges[direction]?.state !== 'open') return [];
    const address = { floor: from.floor, ...movePosition(from, direction) };
    return cellAt(knowledge, address)?.edges[opposite(direction)]?.state === 'open' ? [{ direction, address }] : [];
  });
}
