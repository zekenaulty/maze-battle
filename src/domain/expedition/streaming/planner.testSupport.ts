import { expect } from 'vitest';
import { movePosition } from '../../maze/movement';
import { addressKey, sameAddress } from '../address';
import type { CellAddress } from '../types';
import type { StreamCheckpoint, StreamCommand, StreamKnowledgePage } from './types';

export const control = { sessionId: 'runtime-a', epoch: 1 };
export const at = (column: number, spaceId = 'entry', row = 0): CellAddress => ({ spaceId, row, column });
export interface Fixture { checkpoint: StreamCheckpoint; page: StreamKnowledgePage }

/** Synthetic observations only; no generator, room manifest or canonical geometry. */
export function fixture(length = 3, chests: number[] = []): Fixture {
  const checkpoint: StreamCheckpoint = { version: 2, worldId: 'observed-world', floorId: 'floor', scopeId: 'scope',
    revision: 0, topologyRevision: 0, position: at(0), home: at(0), phase: 'exploring',
    moves: 0, visitedSpaces: 1, clearedSpaces: 0, collectedChests: 0 };
  const page: StreamKnowledgePage = { version: 1, spaceId: 'entry', revision: 0,
    cells: {}, chests: {}, openings: {}, frontiers: {}, completedExits: [], cleared: false };
  for (let column = 0; column < length; column++) {
    const address = at(column);
    page.cells[addressKey(address)] = { ...address, observedAt: 0,
      links: [...(column > 0 ? ['west' as const] : []), ...(column < length - 1 ? ['east' as const] : [])] };
  }
  for (const column of chests) page.chests[`loot-${column}`] = { ...at(column), id: `loot-${column}`, observedAt: 0, opened: false };
  return { checkpoint, page };
}

export function stamp(f: Fixture) {
  f.page.revision = f.checkpoint.revision;
  for (const kind of ['cells', 'chests', 'openings', 'frontiers'] as const) {
    for (const value of Object.values(f.page[kind])) value.observedAt = f.checkpoint.revision;
  }
}

export function applyLocal(f: Fixture, command: StreamCommand) {
  f.checkpoint.revision++;
  if (command.type === 'move') {
    const cell = f.page.cells[addressKey(f.checkpoint.position)];
    expect(cell.links).toContain(command.direction);
    f.checkpoint.position = { ...movePosition(f.checkpoint.position, command.direction), spaceId: f.page.spaceId };
    f.checkpoint.moves++;
  } else if (command.type === 'collect') {
    const chest = Object.values(f.page.chests).find(chest => sameAddress(chest, f.checkpoint.position) && !chest.opened);
    expect(chest).toBeDefined();
    chest!.opened = true;
    f.checkpoint.collectedChests++;
  } else if (command.type === 'prepare') {
    expect(f.page.frontiers[command.frontierId]).toBeDefined();
    f.checkpoint.topologyRevision++;
  } else f.checkpoint.phase = 'complete';
  stamp(f);
}

export function chooseInput(f: Fixture) {
  return [structuredClone(f.checkpoint), structuredClone(f.page), { ...control }] as const;
}
