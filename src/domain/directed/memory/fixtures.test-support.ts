import { addressKey } from '../../expedition/address';
import type { CellAddress } from '../../expedition/types';
import { emptyDirectedKnowledge } from '../knowledge';
import type { DirectedCell, KnowledgeProjection, Remembered } from '../types';

export const identity = { worldId: 'remembered-world', observerId: 'actor', floorId: 'floor' };
export const at = (spaceId: string, column = 0): CellAddress => ({ spaceId, row: 0, column });
export const remembered = <T>(value: T, sequence = 2): Remembered<T> => ({
  value, observationId: `observation-${sequence}`, observedAt: sequence,
});
export function memoryFixture(): KnowledgeProjection {
  const knowledge = emptyDirectedKnowledge(identity.worldId, identity.observerId);
  knowledge.revision = 5;
  for (const [id, x, z] of [['S', 4, 0], ['N', 4, -1], ['M', 0, -1], ['D', 0, 0], ['U', 10, 10]] as const) {
    knowledge.spaces[id] = remembered({ id, name: `Room ${id}`, originX: x, originZ: z, rows: 1, columns: id === 'S' ? 2 : 1 });
  }
  const cells: DirectedCell[] = [
    { address: at('S'), exits: { north: at('N'), east: at('S', 1) } },
    { address: at('S', 1), exits: { west: at('S') } },
    { address: at('N'), exits: { south: at('S'), west: at('M') } },
    { address: at('M'), exits: { east: at('N'), south: at('D') } },
    { address: at('D'), exits: { north: at('M') } },
    { address: at('U'), exits: {} },
  ];
  for (const cell of cells) knowledge.cells[addressKey(cell.address)] = remembered(cell, cell.address.spaceId === 'S' ? 5 : 2);
  knowledge.features.lever = remembered({ id: 'lever', name: 'Distant lever', kind: 'lever', state: 'idle', position: at('D') });
  knowledge.features.local = remembered({ id: 'local', name: 'Local chest', kind: 'chest', state: 'closed', position: at('S', 1) }, 5);
  return knowledge;
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
