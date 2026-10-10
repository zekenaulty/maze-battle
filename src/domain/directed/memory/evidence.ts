import type { Remembered } from '../types';
import type { MemoryEvidence, MemoryFact } from './types';

type Source = { observationId: string; observedAt: number };
export const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function evidence(sources: Source[], revision: number): MemoryEvidence {
  if (!sources.length || sources.some(source => !source.observationId || !Number.isSafeInteger(source.observedAt)
    || source.observedAt < 1 || source.observedAt > revision)) throw new Error('Invalid memory evidence.');
  const oldest = sources.reduce((minimum, source) => Math.min(minimum, source.observedAt), Infinity);
  const latest = sources.reduce((maximum, source) => Math.max(maximum, source.observedAt), 0);
  return {
    sourceIds: [...new Set(sources.map(source => source.observationId))].sort(compareIds),
    oldestObservedAt: oldest, latestObservedAt: latest,
    status: oldest === revision ? 'current' : 'stale',
  };
}
export function fact<T>(entry: Remembered<T>, revision: number): MemoryFact<T> {
  return { value: structuredClone(entry.value), observationId: entry.observationId, observedAt: entry.observedAt,
    evidence: evidence([entry], revision) };
}
export function own<T>(records: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(records, key) ? records[key] : undefined;
}
/** Collect only emitted evidence, never all sources in the input projection. */
export function collectSourceIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) { item.forEach(visit); return; }
    for (const [key, child] of Object.entries(item)) {
      if (key === 'evidence') for (const id of (child as MemoryEvidence).sourceIds) ids.add(id);
      else if (key !== 'sourceIds' && key !== 'value') visit(child);
    }
  };
  visit(value);
  return [...ids].sort(compareIds);
}
