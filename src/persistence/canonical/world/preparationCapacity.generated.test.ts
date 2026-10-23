// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preparationCapacity } from './preparationCapacity';
import { preparationMemory } from './preparationCapacity.test-support';
import { DEFAULT_MODULE_POLICY } from '../../../domain/expedition/topology/modules/policy';

function valueBound(key: string) {
  if (key === 'dungeon') return 512;
  if (key.startsWith('game/preparation/')) return 128;
  if (key.startsWith('contract/')) return 4140;
  if (/\/quality\/node\//.test(key)) return 2048;
  if (/\/quality|\/roles|^dungeon\/\d+$|\/content$/.test(key)) return 4096;
  if (/\/content\/|\/join\/|\/chest\//.test(key)) return 512;
  if (/\/frontier\//.test(key)) return 2048;
  if (/\/space\/|\/ports\/|\/connection\/|\/stairs$/.test(key)) return 1024;
  throw new Error(`Unclassified writer key: ${key}`);
}

function assertValues(f: ReturnType<typeof preparationMemory>, level: number, rooms: number) {
  for (const call of f.measurements.filter(m => m.level === level)) {
    const buckets = call.values.filter(v => v.bucketEntries !== undefined);
    expect(buckets.length).toBeLessThanOrEqual(25);
    expect(buckets.reduce((sum, v) => sum + v.bucketEntries!, 0)).toBeLessThanOrEqual(6 * rooms - 2);
    for (const value of call.values.filter(v => v.bucketEntries === undefined))
      expect(value.valueBytes, value.key).toBeLessThanOrEqual(valueBound(value.key));
  }
}

function retain(name: string, value: unknown) {
  const directory = resolve('test-results/private-capacity-final');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${name}.json`), JSON.stringify(value, null, 2));
}

it.each([42, 781])('bounds actual retained writers through 16 floors, seed %s', async seed => {
  const f = preparationMemory(seed), summary = [];
  for (let level = 1; level <= 16; level++) {
    const { version, roomBudget, policy } = await f.floor(level);
    const cap = preparationCapacity({ version, level, roomBudget, policy });
    const actual = f.measurements.filter(m => m.level === level);
    assertValues(f, level, roomBudget);
    for (const [phase, bound] of Object.entries(cap.phases)) {
      const calls = actual.filter(m => m.phase === phase);
      expect(calls.length).toBe(bound.calls);
      for (const field of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
        expect(calls.reduce((sum, m) => sum + m[field], 0), `${level}/${phase}/${field}`).toBeLessThanOrEqual(bound[field]);
    }
    const bytes = actual.reduce((sum, m) => sum + m.bytes, 0);
    summary.push({ level, actualBytes: bytes, reservedBytes: cap.budgetBytes, ratio: cap.budgetBytes / bytes });
  }
  const result = { seed, summary, actualBytes: summary.reduce((n, m) => n + m.actualBytes, 0),
    reservedBytes: summary.reduce((n, m) => n + m.reservedBytes, 0) };
  retain(`seed-${seed}`, { ...result, method: 'real writers / CanonicalPages / flush; in-memory store', measurements: f.measurements });
  console.info(JSON.stringify(result));
}, 120_000);

it.each(['direct', 'passage'] as const)('bounds the opposite public join policy: %s', async joins => {
  const f = preparationMemory(42), policy = { ...DEFAULT_MODULE_POLICY, joins, attempts: 32 };
  const recipe = await f.floor(1, { policy });
  const cap = preparationCapacity({ version: recipe.version, level: 1, roomBudget: recipe.roomBudget, policy });
  assertValues(f, 1, recipe.roomBudget);
  for (const [phase, bound] of Object.entries(cap.phases)) for (const field of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
    expect(f.measurements.filter(m => m.phase === phase).reduce((sum, m) => sum + m[field], 0)).toBeLessThanOrEqual(bound[field]);
  const result = { joins, actualBytes: f.measurements.reduce((n, m) => n + m.bytes, 0), reservedBytes: cap.budgetBytes };
  retain(`policy-${joins}`, { ...result, measurements: f.measurements });
  console.info(JSON.stringify(result));
});
