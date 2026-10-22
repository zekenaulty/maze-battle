// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { accountHead, appendedBytes } from '../accounting';
import { protocolHead } from '../agentica/types.test-support';
import { workBudget } from '../budget';
import { checkpointJson, gameCheckpoint } from '../game/checkpoint';
import { CanonicalPages } from '../pages';
import type { CanonicalWork } from '../transaction';
import { DEFAULT_WORK_LIMITS, type CanonicalHead, type CanonicalIndexNode, type CanonicalRead,
  type CanonicalRecord, type CanonicalWrite } from '../types';
import { blockKey } from './keys';
import { loadMemoryBlock } from './memory';
import { memoryIntegrityKey } from './memory.integrity';
import { observePositionEvidence } from './observe';
import { earnedCell } from './region.test-support';
import type { ObservedCell } from './types';
import { recordGameObservation } from './write';

vi.mock('./observe', () => ({ observePositionEvidence: vi.fn() }));
afterEach(() => vi.clearAllMocks());

function harness() {
  let head = protocolHead(), initialized = false, proofs = 0;
  const records = new Map<string, CanonicalRecord>(), nodes = new Map<string, CanonicalIndexNode>();
  function view(mode: 'readwrite' | 'readonly', captured: CanonicalHead) {
    const budget = workBudget(), tx = { mode, objectStore: (name: string) => ({ get: async (key: string[]) =>
      structuredClone(name === 'records' ? records.get(key[1]) : nodes.get(key[1])) }) } as unknown as CanonicalWrite | CanonicalRead;
    return { pages: new CanonicalPages(tx, captured, budget), budget };
  }
  return { snapshot: () => structuredClone(head), records, nodes, proofs: () => proofs,
    fund(full = false) {
      head.allocations.obligation = { revision: head.revision, bytes: 147456 };
      head.quota.reservedBytes = 147456; head.quota.reservations = 1;
      if (full) head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    },
    async observe(cell: ObservedCell, fault?: 'storage' | 'writes' | 'bytes') {
      vi.mocked(observePositionEvidence).mockResolvedValue({ cells: [structuredClone(cell)],
        spaces: [{ spaceId: cell.at.cell.spaceId, kind: 'room', index: 0 }] });
      const v = view('readwrite', head), set = v.pages.set.bind(v.pages);
      v.pages.set = async (area, key, value, indexes) => {
        if (key === memoryIntegrityKey(blockKey(cell.at))) {
          proofs++;
          if (fault === 'storage') throw new DOMException('Injected memory proof failure', 'QuotaExceededError');
          // Exhaust the existing limits only after the new block has been staged.
          if (fault === 'writes') while (v.budget.snapshot().writes <= DEFAULT_WORK_LIMITS.writes) v.budget.write(0);
          if (fault === 'bytes') v.budget.write(DEFAULT_WORK_LIMITS.bytes);
        }
        return set(area, key, value, indexes);
      };
      const checkpoint = gameCheckpoint(head.checkpoint); checkpoint.position = structuredClone(cell.at);
      const next = await recordGameObservation({ head, pages: v.pages } as CanonicalWork, checkpoint);
      const ready = await v.pages.prepare(), candidate = { ...head, revision: head.revision + 1,
        roots: ready.roots, checkpoint: checkpointJson(next) };
      const accounted = accountHead(initialized ? head : undefined, candidate, appendedBytes(ready.records, ready.nodes));
      for (const row of ready.records) records.set(row.id, row);
      for (const row of ready.nodes) nodes.set(row.node.id, row);
      head = accounted; initialized = true; return v.budget.snapshot();
    },
    async read(cell: ObservedCell, captured = head) {
      const v = view('readonly', captured), block = await loadMemoryBlock(v.pages, cell.at);
      const proof = await v.pages.get('knowledge', memoryIntegrityKey(blockKey(cell.at)));
      v.pages.finishRead(); return { block, proof, stats: v.budget.snapshot() };
    },
  };
}

it('retains exact historical memory/proof roots and unchanged sight identities in real canonical pages', async () => {
  const h = harness(), cell = earnedCell(); await h.observe(cell);
  const initial = h.snapshot(), first = await h.read(cell, initial), proofs = h.proofs();
  await h.observe(cell);
  expect(h.proofs()).toBe(proofs); expect((await h.read(cell)).proof).toEqual(first.proof);
  await h.observe({ ...cell, chests: [{ id: 'chest', opened: true }] });
  expect((await h.read(cell)).block!.cells['0:0'].chests[0].opened).toBe(true);
  const historical = await h.read(cell, initial); expect(historical.block).toEqual(first.block); expect(historical.proof).toEqual(first.proof);
  expect(historical.stats.writes).toBe(0);
});

it.each(['storage', 'writes', 'bytes', 'quota'] as const)('atomically refuses %s exhaustion after staging memory without consuming funded custody', async fault => {
  const h = harness(), cell = earnedCell(); await h.observe(cell); h.fund(fault === 'quota');
  const before = h.snapshot(), records = structuredClone(h.records), nodes = structuredClone(h.nodes), proofs = h.proofs();
  await expect(h.observe({ ...cell, chests: [] }, fault === 'quota' ? undefined : fault)).rejects.toThrow(
    fault === 'storage' ? 'Injected memory proof failure' : fault === 'quota' ? 'storage quota' : 'write budget exhausted');
  expect(h.proofs()).toBe(proofs + 1); expect(h.snapshot()).toEqual(before);
  expect(h.records).toEqual(records); expect(h.nodes).toEqual(nodes);
  expect(h.snapshot().allocations.obligation.bytes).toBe(147456);
  expect((await h.read(cell)).block!.cells['0:0'].chests).toEqual(cell.chests);
});
