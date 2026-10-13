import { check, validId } from '../validation';
import { levelKey } from './records';
import type { WorldRead } from './types';

// Canonical records/index nodes are immutable under the single-writer kernel.
// Pin their primary subtree identities, not optional secondary-index membership.
export async function qualityNamespace(pages: WorldRead, prefix: string): Promise<string | null> {
  check(typeof pages.witness === 'function', 'quality requires primary namespace witnesses');
  const witness = await pages.witness('world', prefix);
  check(witness === null || validId(witness), 'invalid quality namespace witness');
  return witness;
}

export async function qualityTopology(pages: WorldRead, level: number) {
  const witnesses = { space: '', ports: '', join: '', connection: '' };
  for (const kind of ['space', 'ports', 'join', 'connection'] as const) {
    const witness = await qualityNamespace(pages, `${levelKey(level)}/${kind}/`);
    check(witness !== null, 'missing established quality topology namespace');
    witnesses[kind] = witness;
  }
  return witnesses;
}

export const qualityScratchPrefix = (level: number) => `${levelKey(level)}/quality/node/`;
