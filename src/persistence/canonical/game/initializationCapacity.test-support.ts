import { vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { workBudget } from '../budget';
import * as lifecycle from '../lifecycle';
import { CanonicalPages } from '../pages';
import { DEFAULT_QUOTA, type CanonicalHead, type CanonicalRecord, type CanonicalWrite, type Json } from '../types';
import { createWorldFloor } from '../world/generation';
import type { WorldFloor } from '../world/types';
import { createCanonicalGame } from './initialize';

export type UUIDPattern = 'late' | 'early' | 'split';
export const isPublicBirth = (r: CanonicalRecord) => r.key.startsWith('roster/') || r.key === 'game/settings';
type Staged = Awaited<ReturnType<CanonicalPages['prepare']>>;

/** Intercepts lifecycle only. Runs the actual complete createCanonicalGame callback,
 * real CanonicalPages and one flush; no kernel, IDB, allocation or recovery claim. */
export async function measureBirth(pattern: UUIDPattern, seed: number, wide: boolean) {
  let sequence = 0, complete!: Staged, current!: CanonicalHead, flushes = 0;
  const ids = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    const n = ++sequence, prefix = pattern === 'late' ? '00000000'
      : pattern === 'split' ? (n % 2 ? 'ffffffff' : '00000000') : ((n * 2654435761) >>> 0).toString(16).padStart(8, '0');
    return `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  });
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
    if (!(array instanceof Uint32Array) || array.length !== 1) throw new Error('unexpected initializer RNG request');
    array[0] = seed; return array;
  });
  const tx = { mode: 'readwrite', objectStore: () => { throw new Error('empty-root birth must not read retained storage'); } } as unknown as CanonicalWrite;
  const budget = workBudget();
  const initialize = vi.spyOn(lifecycle, 'initializeCanonical').mockImplementation(async (owner, checkpoint, write) => {
    current = { schema: 1, generation: 'g'.repeat(wide ? 128 : 36), gameId: 'i'.repeat(wide ? 128 : 36),
      owner, epoch: 1, revision: wide ? Number.MAX_SAFE_INTEGER - 1 : 0, status: 'ready', checkpoint,
      roots: { world: null, knowledge: null, execution: null }, allocations: {},
      quota: { ...DEFAULT_QUOTA, usedBytes: 0, reservedBytes: 0, reservations: 0 } };
    const pages = new CanonicalPages(tx, current, budget);
    await write!(pages); complete = await pages.prepare(); flushes++;
    return { head: { ...current, roots: complete.roots }, stats: budget.snapshot() };
  });
  try {
    await createCanonicalGame('owner');
    if (!complete) throw new Error('actual initializer callback was not intercepted');
    const floor = complete.records.find(r => r.key === 'dungeon/1')!.value as unknown as WorldFloor;
    const baseline = new CanonicalPages(tx, current, workBudget());
    await createWorldFloor(baseline, floor.generation.recipe);
    await baseline.set('world', 'game/preparation/1', { schema: 1, level: 1, phase: 'generation' });
    return { complete, baseline: await baseline.prepare(), recipe: floor.generation.recipe,
      stats: budget.snapshot(), flushes, current };
  } finally { initialize.mockRestore(); random.mockRestore(); ids.mockRestore(); }
}

/** Only exact dynamic actor/item identities are replaced; all policy values remain. */
export function publicPolicyWitness(records: CanonicalRecord[]) {
  const rows = records.filter(isPublicBirth), identities = new Map<string, string>();
  for (const r of rows) {
    const v = r.value as Record<string, Json>;
    if (r.key.startsWith('roster/actor/')) {
      const actor = v.actor as Record<string, Json>; identities.set(actor.id as string, `<actor:${actor.role}>`);
    } else if (r.key.startsWith('roster/item/')) {
      const item = v.item as Record<string, Json>; identities.set(item.id as string, `<item:${item.baseId}>`);
    }
  }
  const path = (key: string) => [...identities].reduce((s, [id, name]) => s.replace(id, name), key);
  function value(v: Json): Json {
    if (typeof v === 'string') return identities.get(v) ?? v;
    if (Array.isArray(v)) return v.map(value);
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) : v;
  }
  return canonicalJson(rows.map(r => ({ key: path(r.key), indexes: r.indexes.map(path), value: value(r.value) }))
    .sort((a, b) => a.key.localeCompare(b.key)));
}
