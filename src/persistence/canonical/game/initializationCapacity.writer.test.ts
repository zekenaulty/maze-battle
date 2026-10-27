// @vitest-environment node
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendedBytes } from '../accounting';
import { jsonBytes } from '../validation';
import type { CanonicalIndexNode, CanonicalRecord } from '../types';
import { INITIALIZATION_BOOT_POLICY, initializationCapacity } from './initializationCapacity';
import { isPublicBirth, measureBirth, publicPolicyWitness, type UUIDPattern } from './initializationCapacity.test-support';

const cases: [UUIDPattern, number, boolean][] = [
  ['late', 0, false], ['late', 0, true], ['early', 42, false], ['early', 42, true],
  ['split', 0xffffffff, false], ['split', 0xffffffff, true],
];
const edgeCount = (nodes: CanonicalIndexNode[]) => nodes.reduce((n, r) => n + Object.keys(r.node.children).length, 0);
const content = (rows: CanonicalRecord[]) => rows.map(r => ({ key: r.key, value: r.value, indexes: r.indexes }))
  .sort((a, b) => a.key.localeCompare(b.key));
const policyHashOf = (rows: CanonicalRecord[]) => createHash('sha256').update(publicPolicyWitness(rows)).digest('hex');
const policyGolden = '78a38ee21dbbef923e2d77d97cb5ddda319cd0f080fab5d4d37baa2c0c8141b9';

it.each(cases)('bounds the actual complete initializer: UUID %s seed %s wide %s', async (pattern, seed, wide) => {
  const f = await measureBirth(pattern, seed, wide), { version, level, roomBudget, policy, spatial, architecture } = f.recipe;
  const cap = initializationCapacity({ floor: { version, level, roomBudget, policy, ...(spatial ? { spatial } : {}),
    ...(architecture ? { architecture } : {}) }, bootPolicy: INITIALIZATION_BOOT_POLICY });
  const publicRows = f.complete.records.filter(isPublicBirth);
  const publicRecordsBytes = appendedBytes(publicRows, []), nodesBytes = appendedBytes([], f.complete.nodes);
  const baseNodesBytes = appendedBytes([], f.baseline.nodes), recordsBytes = appendedBytes(f.complete.records, []);
  const witness = publicPolicyWitness(publicRows), policyHash = createHash('sha256').update(witness).digest('hex');
  const summary = { pattern, seed, wide, recordsBytes, nodesBytes, publicRecordsBytes, baseNodesBytes,
    addedNodes: f.complete.nodes.length - f.baseline.nodes.length,
    addedEdges: edgeCount(f.complete.nodes) - edgeCount(f.baseline.nodes),
    unionNodeDeltaBytes: nodesBytes - baseNodesBytes, policyHash, stats: f.stats, bound: cap };
  const directory = resolve('test-results/initialization-capacity'); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${pattern}-${wide ? 'wide' : 'normal'}.json`),
    JSON.stringify({ summary, policyWitness: JSON.parse(witness), complete: f.complete }, null, 2));
  console.info(JSON.stringify(summary));

  expect(f.flushes).toBe(1); expect(f.stats.reads).toBe(0);
  expect(f.current.roots).toEqual({ world: null, knowledge: null, execution: null });
  expect(f.complete.roots.world).not.toBeNull(); expect(f.complete.roots.knowledge).toBeNull();
  expect(f.complete.roots.execution).toBeNull(); expect(f.complete.snapshot).toBeUndefined();
  expect(content(f.complete.records.filter(r => !isPublicBirth(r)))).toEqual(content(f.baseline.records));
  expect(publicRows).toHaveLength(11);
  expect(publicRows.flatMap(r => r.indexes)).toHaveLength(3);
  expect(publicRows.filter(r => r.key.startsWith('roster/actor/')).map(r => r.key)).toEqual(
    ['warrior', 'mage', 'healer'].map(role => `roster/actor/${f.recipe.worldId}-${role}`));
  const items = publicRows.filter(r => r.key.startsWith('roster/item/'));
  expect(items.every(r => /^roster\/item\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.key))).toBe(true);
  expect(new Set(items.map(r => r.key)).size).toBe(3);
  const publicPaths = publicRows.flatMap(r => [`record/${r.key}`, ...r.indexes.map(i => `index/${i}`)]);
  expect(publicPaths).toHaveLength(14); expect(Math.max(...publicPaths.map(p => p.length))).toBe(77);
  expect(summary.addedNodes).toBeLessThanOrEqual(28); expect(summary.addedEdges).toBeLessThanOrEqual(28);
  expect(publicRecordsBytes).toBeLessThanOrEqual(cap.publicBirth.recordsBytes);
  if (wide) {
    expect(publicRecordsBytes).toBe(cap.publicBirth.recordsBytes);
    expect(f.complete.records.every(r => r.revision === Number.MAX_SAFE_INTEGER && r.gameId.length === 128
      && r.generation.length === 128 && r.id.length === 36)).toBe(true);
  }
  expect(summary.unionNodeDeltaBytes).toBeLessThanOrEqual(cap.publicBirth.nodesBytes);
  expect(recordsBytes).toBeLessThanOrEqual(cap.privateFloor.phases.bootstrap.recordsBytes + cap.publicBirth.recordsBytes);
  expect(nodesBytes).toBeLessThanOrEqual(cap.privateFloor.phases.bootstrap.nodesBytes + cap.publicBirth.nodesBytes);
  // Full policy values, keys and indexes: only the declared UUID-derived identities
  // are normalized. Same-byte changes to defaults must also invalidate this version.
  expect(policyHash).toBe(policyGolden);
}, 30_000);

it('detects same-byte public policy drift and retains unexpected policy fields', async () => {
  const f = await measureBirth('late', 0, false), rows = f.complete.records.filter(isPublicBirth);
  expect(policyHashOf(rows)).toBe(policyGolden);
  const changed = structuredClone(rows), settings = changed.find(r => r.key === 'game/settings')!;
  const bytes = jsonBytes(settings.value);
  settings.value = { schema: 1, autoThrottleMs: 501 };
  expect(jsonBytes(settings.value)).toBe(bytes); expect(policyHashOf(changed)).not.toBe(policyGolden);
  const extra = structuredClone(rows), stash = extra.find(r => r.key === 'roster/stash')!;
  stash.value = { ...(stash.value as object), unexpected: true };
  expect(publicPolicyWitness(extra)).toContain('unexpected'); expect(policyHashOf(extra)).not.toBe(policyGolden);
});
