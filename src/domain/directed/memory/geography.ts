import type { CellAddress } from '../../expedition/types';
import type { KnowledgeProjection } from '../types';
import { evidence, own } from './evidence';
import type { GeographicBearing } from './types';

/** Room bearings refer to the remembered room center; cell bearings to the exact cell. */
export function geographicBearing(knowledge: KnowledgeProjection, from: CellAddress,
  to: CellAddress | string): GeographicBearing {
  const origin = own(knowledge.spaces, from.spaceId);
  const target = own(knowledge.spaces, typeof to === 'string' ? to : to.spaceId);
  if (!origin || !target) return { direction: 'unknown', basis: 'remembered-coordinates' };
  const column = typeof to === 'string' ? (target.value.columns - 1) / 2 : to.column;
  const row = typeof to === 'string' ? (target.value.rows - 1) / 2 : to.row;
  const dx = target.value.originX + column - origin.value.originX - from.column;
  const dz = target.value.originZ + row - origin.value.originZ - from.row;
  if (![dx, dz].every(Number.isFinite)) return { direction: 'unknown', basis: 'remembered-coordinates' };
  const horizontal = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
  const vertical = dz > 0 ? 'south' : dz < 0 ? 'north' : '';
  const direction = (vertical && horizontal ? `${vertical}-${horizontal}` : vertical || horizontal || 'here') as GeographicBearing['direction'];
  return { direction, basis: 'remembered-coordinates', evidence: evidence([origin, target], knowledge.revision) };
}
