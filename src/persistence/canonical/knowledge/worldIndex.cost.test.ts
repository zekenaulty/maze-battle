// @vitest-environment node
import { expect, it } from 'vitest';
import { CanonicalPages } from '../pages';
import { workBudget } from '../budget';
import { protocolHead } from '../agentica/types.test-support';
import type { CanonicalIndexNode, CanonicalRecord, CanonicalWorkStats, CanonicalWrite, Json } from '../types';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { worldIndexDigest, worldIndexEvidenceKey } from './worldIndex.evidence';
import { worldBlockAddress, worldBlockKey, worldCellKey, type WorldIndexBlock } from './worldIndex';

type Strategy = 'none' | 'body' | 'digest';
const sourceId = '11111111-1111-4111-8111-111111111111';
function blocks(sparse = false, longIds = false) {
  const result = new Map<string, WorldIndexBlock>(); let index = 0;
  for (let row = -7; row <= 7; row++) for (let column = -7; column <= 7; column++) {
    if (Math.abs(row) + Math.abs(column) > 7) continue;
    const world = sparse ? { row: index * 8, column: index * 8 } : { row, column: column + 1 };
    const key = worldBlockKey(1, world);
    if (!result.has(key)) result.set(key, { schema: 1, ...worldBlockAddress(1, world), cells: {} });
    result.get(key)!.cells[worldCellKey(world)] = { world,
      at: { level: 1, cell: { spaceId: longIds ? 'r'.repeat(128) : 'room', row: row + 8, column: column + 8 } },
      source: { sequence: 1, id: longIds ? 's'.repeat(128) : sourceId, index: index++ } };
  }
  return result;
}
function canonicalHarness() {
  const head = protocolHead(), records = new Map<string, CanonicalRecord>(), nodes = new Map<string, CanonicalIndexNode>();
  head.roots = { world: null, knowledge: null, execution: null };
  async function commit(work: (pages: CanonicalPages) => Promise<void>) {
    const budget = workBudget({ reads: 100_000, writes: 100_000, bytes: 64 * 1024 * 1024 });
    const tx = { mode: 'readwrite', objectStore: (name: string) => ({ get: async (key: string[]) =>
      structuredClone(name === 'records' ? records.get(key[1]) : nodes.get(key[1])) }) } as unknown as CanonicalWrite;
    const pages = new CanonicalPages(tx, head, budget);
    await work(pages); const ready = await pages.prepare();
    for (const row of ready.records) records.set(row.id, row);
    for (const row of ready.nodes) nodes.set(row.node.id, row);
    head.roots = ready.roots; head.revision++;
    return { ...budget.snapshot(), records: ready.records.length, nodes: ready.nodes.length };
  }
  return { commit };
}
async function measure(strategy: Strategy, input: Map<string, WorldIndexBlock>) {
  const h = canonicalHarness();
  async function write(pages: CanonicalPages, key: string, value: WorldIndexBlock) {
    const row = await pages.set('knowledge', key, value as unknown as Json);
    if (strategy !== 'none') await pages.set('knowledge', worldIndexEvidenceKey(key), { schema: 1, recordId: row.id,
      revision: row.revision, ...(strategy === 'body' ? { witness: canonicalJson(row.value) } : { digest: worldIndexDigest(row.value) }) });
  }
  async function read(pages: CanonicalPages, key: string) {
    const row = await pages.get('knowledge', key); expect(row).toBeDefined();
    if (strategy !== 'none') {
      const proof = await pages.get('knowledge', worldIndexEvidenceKey(key));
      expect(proof!.value).toMatchObject({ recordId: row!.id, revision: row!.revision });
      expect(proof!.value).toHaveProperty(strategy === 'body' ? 'witness' : 'digest',
        strategy === 'body' ? canonicalJson(row!.value) : worldIndexDigest(row!.value));
    }
  }
  const seed = await h.commit(async pages => { for (const [key, value] of input) await write(pages, key, value); });
  const unchanged = await h.commit(async pages => { for (const key of input.keys()) await read(pages, key); });
  const changed = await h.commit(async pages => {
    for (const [key, value] of input) {
      await read(pages, key); const next = structuredClone(value);
      for (const cell of Object.values(next.cells)) cell.source.sequence++;
      await write(pages, key, next);
    }
  });
  return { seed, unchanged, changed };
}
const delta = (a: CanonicalWorkStats, b: CanonicalWorkStats) => Object.fromEntries(
  (['reads', 'writes', 'readBytes', 'writeBytes'] as const).map(k => [k, a[k] - b[k]]));

it('measures spatial-only record and radix-path overhead for at most 113 changed cells', async () => {
  // Real CanonicalPages/MemoryTree accounting over an in-memory store, not native IDB timing.
  // Other observation/memory/receipt/head writes are deliberately excluded from this delta.
  for (const [name, input] of [['radius7', blocks()], ['radius7-max-ids', blocks(false, true)],
    ['sparse113-stress', blocks(true, true)]] as const) {
    const none = await measure('none', input), body = await measure('body', input), digest = await measure('digest', input);
    const phases = Object.fromEntries((['seed', 'unchanged', 'changed'] as const).map(phase => [phase, {
      baseline: none[phase], bodyAdded: delta(body[phase], none[phase]), digestAdded: delta(digest[phase], none[phase]),
    }]));
    console.info(JSON.stringify({ scenario: name, cells: 113, blocks: input.size, phases }));
    expect(digest.seed.records - none.seed.records).toBe(input.size);
    expect(digest.seed.nodes - none.seed.nodes).toBe(input.size);
    expect(digest.unchanged.writes).toBe(0);
    expect(digest.changed.writeBytes).toBeLessThan(body.changed.writeBytes);
    expect(digest.changed.writes).toBe(body.changed.writes);
    expect(digest.unchanged.reads - none.unchanged.reads).toBe(input.size * 2);
    expect(digest.changed.writes - none.changed.writes).toBe(input.size * 2);
    if (name !== 'sparse113-stress') {
      expect(input.size).toBe(14);
      expect(digest.changed.writeBytes - none.changed.writeBytes).toBeLessThan(12 * 1024);
      expect(digest.changed.readBytes - none.changed.readBytes).toBeLessThan(12 * 1024);
    }
  }
});
