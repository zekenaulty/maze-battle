// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { accountHead, storedBytes } from './accounting';
import { closePrivateCapacity, HEAD_CAPACITY_BYTES, reservePrivateCapacity } from './privateCapacity';
import { PrivatePreparation } from './privatePreparation';
import { preparationFixture, specification, worldKey } from './privatePreparation.test-support';
import { validateReceipt } from './receipts';

it('creates one source-bound unindexed anchor, charges the final flush once and never consumes head bytes', async () => {
  const f = preparationFixture(), w = f.stage(), source = vi.spyOn(w.pages, 'sourceReceipt');
  const handle = await w.controller.begin(specification(), worldKey);
  expect(w.controller.declared).toBe(true);
  await w.pages.set('world', 'dungeon/1', { prepared: true }); handle.close();
  const saved = await f.commit(w), anchor = saved.staged.records.find(r => r.area === 'execution')!;
  expect(anchor.key).toBe('private-capacity/floor-1'); expect(anchor.indexes).toEqual([]);
  expect(anchor.value).toEqual({ ...specification(), sourceAttemptId: w.source.attemptId });
  expect(saved.receipt.result).toMatchObject({ privateAllocation: { recordId: anchor.id, witness: canonicalJson(anchor) } });
  expect(validateReceipt(saved.receipt, saved.head, w.source)).toEqual(w.source); expect(source).not.toHaveBeenCalled();
  expect(saved.head.quota.privateCapacity).toEqual({ version: 'private-world-v1', allocatedBytes: specification().budgetBytes,
    consumedBytes: saved.addedBytes, active: null });
  expect(saved.head.quota.usedBytes).toBe(saved.addedBytes + storedBytes('heads', saved.head.gameId, saved.head));
  expect(w.head.quota.privateCapacity?.allocatedBytes).toBe(0);
});

it('continues using one exact receipt and never rewrites or repeats the anchor witness', async () => {
  const f = preparationFixture(), first = await f.established(), original = [...f.records.values()].find(r => r.area === 'execution')!;
  const w = f.stage(); f.reads.length = 0;
  const handle = await w.controller.begin(specification(), worldKey);
  expect(f.reads.filter(r => r.store === 'receipts')).toEqual([{ store: 'receipts', id: first.receipt.attemptId }]);
  await w.pages.set('world', 'dungeon/1', { prepared: 'ready' }); handle.close();
  const final = await f.commit(w, { phase: 'ready' });
  expect(final.receipt.result).toEqual({ phase: 'ready' }); expect(final.staged.records.every(r => r.area === 'world')).toBe(true);
  expect(f.records.get(original.id)).toEqual(original);
  expect(final.head.quota.privateCapacity).toMatchObject({ allocatedBytes: specification().budgetBytes,
    consumedBytes: first.addedBytes + final.addedBytes, active: null });
});

it('continues under a new current owner without replacing the original creation source', async () => {
  const f = preparationFixture(), first = await f.established(), head = f.head();
  head.owner = 'successor'; head.epoch++; head.revision++;
  const w = f.stage(accountHead(f.head(), head, 0));
  const handle = await w.controller.begin(specification(), worldKey);
  handle.close(); const final = await f.commit(w, { phase: 'ready' });
  expect(final.head.owner).toBe('successor'); expect(final.head.epoch).toBe(2);
  expect(final.receipt.result).toEqual({ phase: 'ready' });
  expect(f.receipts.get(first.receipt.attemptId)).toEqual(first.receipt);
  expect(f.reads.filter(r => r.store === 'receipts')).toEqual([{ store: 'receipts', id: first.receipt.attemptId }]);
});

it('snapshots head/source/specification before reads and snapshots the decorated result', async () => {
  const f = preparationFixture(), w = f.stage(), spec = specification(), original = structuredClone(spec);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), get = w.pages.get.bind(w.pages);
  vi.spyOn(w.pages, 'get').mockImplementationOnce(async (area, key) => { await gate; return get(area, key); });
  const pending = w.controller.begin(spec, worldKey);
  spec.id = 'changed'; spec.budgetBytes = 1; spec.policy.recipe = { seed: 99 }; w.source.attemptId = 'changed';
  w.head.gameId = 'changed'; w.head.quota.privateCapacity!.allocatedBytes = 1;
  release(); await pending;
  const outcome = { nested: { original: true } }, decorated = w.controller.decorate(outcome);
  outcome.nested.original = false;
  const staged = await w.pages.prepare(), anchor = staged.records[0];
  expect(anchor.value).toEqual({ ...original, sourceAttemptId: 'attempt-1' }); expect(anchor.gameId).toBe('game');
  expect(decorated).toMatchObject({ nested: { original: true } });
  expect(w.controller.finish(10)).toMatchObject({ allocatedBytes: original.budgetBytes, consumedBytes: 10 });
});

it('does not gate undeclared cleanup on private policy and seals its unused handle', async () => {
  const f = preparationFixture(), w = f.stage(); delete w.head.quota.privateCapacity;
  const controller = new PrivatePreparation(w.head, w.pages, w.source);
  controller.assertUsable(); expect(controller.declared).toBe(false); expect(controller.decorate(null)).toBeNull();
  await expect(controller.begin(specification(), worldKey)).rejects.toThrow('sealed');
  expect(() => controller.assertUsable()).toThrow('not usable');
});

it('preserves a closed allocation rather than reopening it after restored preparation', async () => {
  const f = preparationFixture(); await f.established(); const head = f.head();
  head.quota.privateCapacity = closePrivateCapacity(head.quota.privateCapacity!, specification().id);
  const w = f.stage(accountHead(f.head(), head, 0));
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('closed');
  expect(() => w.controller.assertUsable()).toThrow();
});

it.each(['foreign', 'missing'])('refuses an absent anchor with an active %s allocation', async which => {
  const f = preparationFixture(), h = f.head();
  h.quota.privateCapacity = reservePrivateCapacity(h.quota.privateCapacity!, which === 'foreign' ? 'floor-2' : 'floor-1', 100_000);
  const w = f.stage(accountHead(f.head(), h, 0));
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('missing active');
  expect((await w.pages.prepare()).records).toEqual([]);
});

it('checks new reservations plus operation reserves against normal capacity before any anchor write', async () => {
  const f = preparationFixture(), h = f.head(), budget = specification().budgetBytes;
  h.allocations.op = { revision: 1, bytes: 16_384 }; h.revision = 1;
  h.quota.reservedBytes = 16_384; h.quota.reservations = 1;
  h.quota.limitBytes = h.quota.reserveBytes + HEAD_CAPACITY_BYTES + budget + h.quota.reservedBytes - 1;
  const w = f.stage(accountHead(f.head(), h, 0)), set = vi.spyOn(w.pages, 'set');
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('storage quota exhausted');
  expect(set).not.toHaveBeenCalled(); expect(() => w.controller.assertUsable()).toThrow();
});
