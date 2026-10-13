import type { WorldPosition } from '../world/types';
import { position } from '../world/records';
import { check, integer, validId } from '../validation';
import { MEMORY_BLOCK_SIDE } from './types';

export const KNOWLEDGE_PREFIX = 'perception/';
export function observationKey(sequence: number) {
  check(integer(sequence, 1), 'invalid observation sequence');
  return `${KNOWLEDGE_PREFIX}observation/${String(sequence).padStart(16, '0')}`;
}
export function roomKey(level: number, spaceId: string) {
  check(integer(level, 1) && validId(spaceId), 'invalid known room');
  return `${KNOWLEDGE_PREFIX}room/${level}/${spaceId}`;
}
export function blockAddress(at: WorldPosition) {
  position(at);
  return { level: at.level, spaceId: at.cell.spaceId,
    row: Math.floor(at.cell.row / MEMORY_BLOCK_SIDE), column: Math.floor(at.cell.column / MEMORY_BLOCK_SIDE) };
}
export function blockKey(at: WorldPosition) {
  const b = blockAddress(at); return `${KNOWLEDGE_PREFIX}cell/${b.level}/${b.spaceId}/${b.row}:${b.column}`;
}
export const localKey = (at: WorldPosition) => `${at.cell.row}:${at.cell.column}`;
export const cellKey = (at: WorldPosition) => `${at.level}/${at.cell.spaceId}/${localKey(at)}`;
