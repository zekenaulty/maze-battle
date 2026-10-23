// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { preparationFixture, specification, worldKey } from './privatePreparation.test-support';
import { PrivatePreparation, type PrivatePreparationSpec } from './privatePreparation';
import type { JsonObject } from './types';
import { jsonBytes } from './validation';

it.each(['descriptor', 'index', 'key', 'generation', 'revision', 'sourceAttemptId', 'extra'])('refuses a changed retained anchor: %s', async fault => {
  const f = preparationFixture(); await f.established();
  const row = [...f.records.values()].find(r => r.area === 'execution')!, value = row.value as JsonObject;
  if (fault === 'descriptor') value.policy = { other: true };
  if (fault === 'index') row.indexes = ['unexpected/index'];
  if (fault === 'key') row.key = 'private-capacity/foreign';
  if (fault === 'generation') row.generation = 'foreign';
  if (fault === 'revision') row.revision = 0;
  if (fault === 'sourceAttemptId') value.sourceAttemptId = 'missing';
  if (fault === 'extra') value.extra = true;
  const w = f.stage(), set = vi.spyOn(w.pages, 'set');
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow();
  expect(set).not.toHaveBeenCalled(); expect(() => w.controller.assertUsable()).toThrow('not usable');
});

it.each(['missing', 'recordId', 'witness', 'extra', 'result', 'generation', 'fingerprint', 'revision'])('requires exact retained source receipt: %s', async fault => {
  const f = preparationFixture(), first = await f.established(), receipt = f.receipts.get(first.receipt.attemptId)!;
  const proof = (receipt.result as JsonObject).privateAllocation as JsonObject;
  if (fault === 'missing') f.receipts.delete(receipt.attemptId);
  if (fault === 'recordId') proof.recordId = 'foreign';
  if (fault === 'witness') proof.witness = '{}';
  if (fault === 'extra') proof.extra = true;
  if (fault === 'result') receipt.result = {};
  if (fault === 'generation') receipt.generation = 'foreign';
  if (fault === 'fingerprint') receipt.fingerprint = '{}';
  if (fault === 'revision') receipt.afterRevision++;
  const w = f.stage(); await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow();
  expect(() => w.controller.assertUsable()).toThrow('not usable');
});

it.each([
  ['long key', { id: 'a'.repeat(80) }], ['slash', { id: 'a/b' }], ['escape', { id: 'quoted"' }], ['unicode', { id: 'nonascii\u00e9' }],
  ['zero', { budgetBytes: 0 }], ['NaN', { budgetBytes: NaN }], ['array', { policy: [] }],
  ['multibyte', { policy: { huge: '\u00e9'.repeat(2100) } }], ['extra', { extra: 1 }],
] as const)('refuses invalid or oversized declarations before any read/write: %s', async (_label, change) => {
  const f = preparationFixture(), w = f.stage();
  await expect(w.controller.begin({ ...specification(), ...change } as PrivatePreparationSpec, worldKey)).rejects.toThrow();
  expect(f.reads).toEqual([]); expect((await w.pages.prepare()).records).toEqual([]);
  expect(() => w.controller.assertUsable()).toThrow();
});

it('enforces the 4096-byte complete anchor bound including the original source attempt', async () => {
  const f = preparationFixture(), accepted = f.stage(), w = f.stage(), spec = specification();
  spec.policy = { padding: '' };
  const overhead = jsonBytes({ ...spec, sourceAttemptId: w.source.attemptId });
  spec.policy.padding = 'x'.repeat(4096 - overhead);
  expect(jsonBytes({ ...spec, sourceAttemptId: accepted.source.attemptId })).toBe(4096);
  await accepted.controller.begin(spec, worldKey);
  spec.policy.padding += 'x';
  expect(jsonBytes(spec, 4096)).toBeLessThan(4096);
  expect(jsonBytes({ ...spec, sourceAttemptId: w.source.attemptId }, 4097)).toBe(4097);
  await expect(w.controller.begin(spec, worldKey)).rejects.toThrow();
  expect((await w.pages.prepare()).records).toEqual([]);
});

it('accepts the exact 96-character nonescaping anchor key bound', async () => {
  const f = preparationFixture(), w = f.stage(), spec = specification(); spec.id = 'a'.repeat(79);
  await w.controller.begin(spec, worldKey);
  const anchor = (await w.pages.prepare()).records[0];
  expect(anchor.key).toHaveLength(96); expect(anchor.value).toEqual({ ...spec, sourceAttemptId: w.source.attemptId });
});

it.each(['gameId', 'generation', 'owner', 'epoch', 'revision'] as const)('requires the current source fence: %s', field => {
  const f = preparationFixture(), w = f.stage();
  if (field === 'epoch' || field === 'revision') w.source.expected[field]++;
  else w.source.expected[field] = 'foreign';
  expect(() => new PrivatePreparation(w.head, w.pages, w.source)).toThrow('source fence changed');
  expect(f.reads).toEqual([]);
});

it.each(['id', 'budget'])('requires exact active %s even with a valid retained anchor', async fault => {
  const f = preparationFixture(); await f.established(); const h = f.head();
  if (fault === 'id') h.quota.privateCapacity!.active!.id = 'floor-2';
  else h.quota.privateCapacity!.active!.budgetBytes--;
  const w = f.stage(h);
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('ownership changed');
});

it('requires an accounted birth head and refuses absent policy without synthesizing either', async () => {
  for (const fault of ['occupancy', 'policy']) {
    const f = preparationFixture(), h = f.head();
    if (fault === 'occupancy') h.quota.usedBytes = 0; else delete h.quota.privateCapacity;
    const w = f.stage(h);
    await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('private capacity');
    expect((await w.pages.prepare()).records).toEqual([]);
  }
});
