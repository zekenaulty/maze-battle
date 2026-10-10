import type { ExpeditionCommand, ExpeditionObservation } from './types';

export interface ExpeditionActionRequest {
  version: 1;
  sessionId: string;
  epoch: number;
  actionId: string;
  expectedRevision: number;
  command: ExpeditionCommand;
}

export interface ExpeditionActionResult {
  actionId: string;
  disposition: 'applied' | 'refused' | 'conflict' | 'unavailable' | 'unresolved';
  beforeRevision: number;
  afterRevision: number;
  reason: string;
  observation?: ExpeditionObservation;
}

export function commandSignature(command: ExpeditionCommand): string {
  if (!command || typeof command !== 'object') throw new Error('Invalid command.');
  const keys = Object.keys(command).sort().join(',');
  if (command.type === 'move' && keys === 'direction,type' && ['north', 'east', 'south', 'west'].includes(command.direction)) return `move:${command.direction}`;
  if ((command.type === 'collect' || command.type === 'finish') && keys === 'type') return command.type;
  throw new Error('Invalid command.');
}
