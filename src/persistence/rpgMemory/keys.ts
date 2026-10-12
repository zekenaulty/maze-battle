import type { RpgAddress } from '../../domain/agentic/knowledge/types';
import { integer, validAddress, validId } from '../../domain/agentic/knowledge/shared';
import { requireMemory } from './types';

const number = (n: number) => n.toString(16).padStart(14, '0');
const room = (id: string) => id.split('').map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
export function cellMemoryKey(address: RpgAddress) {
  requireMemory(validAddress(address));
  return `c${number(address.floor)}${number(address.row)}${number(address.column)}`;
}
export function roomsMemoryPrefix(floor: number) {
  requireMemory(integer(floor, 1));
  return `m${number(floor)}`;
}
export function roomMemoryKey(floor: number, id: string) {
  requireMemory(validId(id));
  return `${roomsMemoryPrefix(floor)}${room(id)}`;
}
export const membersMemoryPrefix = (floor: number, id: string) => `${roomMemoryKey(floor, id).replace(/^m/, 'r')}|`;
export const memberMemoryKey = (address: RpgAddress, id: string) => `${membersMemoryPrefix(address.floor, id)}${number(address.row)}${number(address.column)}`;
