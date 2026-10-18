// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalPages } from '../pages';
import { sealOperation } from '../operationValidation';
import { validateReceipt } from '../receipts';
import { MIN_TERMINAL_BYTES, type CanonicalReceipt, type CanonicalRecord, type CanonicalRequest, type JsonObject } from '../types';
import { interactionKey, loadInteraction, saveInteraction } from './records';
import type { InteractionProgress } from './types';
import { createInteractionBinding } from './validation';

const identity = { generation: 'generation', gameId: 'game' };
function request(attemptId: string, operation: string, revision: number, input: JsonObject): CanonicalRequest {
  return { attemptId, operation, input, expected: { ...identity, owner: 'owner', epoch: 1, revision }, deadlineAt: null };
}
function alterSource(receipt: CanonicalReceipt, change: (source: CanonicalRequest) => void) {
  const source = JSON.parse(receipt.fingerprint) as CanonicalRequest;
  change(source); receipt.fingerprint = canonicalJson(source);
}

async function fixture(sequence: 0 | 1 = 1, options: { admissionRevision?: number; owner?: string; epoch?: number } = {}) {
  const binding = createInteractionBinding({ kind: 'open-chest', chestId: 'chest' },
    { level: 1, cell: { spaceId: 'entry', row: 1, column: 1 } });
  const admission = request('admit', 'operation.admit', options.admissionRevision ?? 10,
    { operationId: 'open', binding: binding as unknown as JsonObject, terminalBytes: MIN_TERMINAL_BYTES });
  const apply = request('apply', 'interaction.apply', 11, { operationId: 'open', sequence: 0 });
  apply.expected.owner = options.owner ?? 'owner'; apply.expected.epoch = options.epoch ?? 1;
  const receipts = new Map<string, CanonicalReceipt>();
  let row: CanonicalRecord;
  // Only storage is doubled: the actual writer produces each progress body and its exact witness.
  async function persist(progress: InteractionProgress, source: CanonicalRequest) {
    const set = vi.fn(async (area, key, value) => {
      row = { ...identity, area, key, value, indexes: [], id: `${source.attemptId}-record`, revision: source.expected.revision + 1 };
      return structuredClone(row);
    });
    const saved = await saveInteraction({ set } as unknown as CanonicalPages, progress, source);
    receipts.set(source.attemptId, { ...identity, attemptId: source.attemptId, fingerprint: canonicalJson(source),
      beforeRevision: source.expected.revision, afterRevision: source.expected.revision + 1,
      committedAt: '2026-10-18T00:00:00.000Z', result: saved.result });
    return saved.progress;
  }
  let progress = await persist({ schema: 1, operationId: 'open', binding, sourceAttemptId: 'admit', owner: 'owner', epoch: 1,
    sequence: 0, status: 'pending', reason: null, result: null }, admission);
  if (sequence === 1) progress = await persist({ ...progress, sequence: 1, status: 'applied',
    result: { kind: 'open-chest', outcome: 'applied', chestId: 'chest', lootIds: ['loot-a', 'loot-b'] } }, apply);
  const operation = sealOperation({ ...identity, schema: 1, id: 'open', binding: binding as unknown as JsonObject,
    admissionAttemptId: 'admit', owner: 'owner', epoch: 1, revision: admission.expected.revision + 1,
    state: 'admitted', terminalBytes: MIN_TERMINAL_BYTES });
  const get = vi.fn(async () => structuredClone(row));
  const sourceReceipt = vi.fn(async (attemptId: string) => {
    const receipt = receipts.get(attemptId), source = validateReceipt(receipt, identity);
    expect(receipt!.attemptId).toBe(attemptId);
    return structuredClone({ receipt: receipt!, source });
  });
  const load = () => loadInteraction({ get, sourceReceipt }, operation);
  return { load, operation, progress, get, sourceReceipt, receipts, row: row!,
    admissionReceipt: receipts.get('admit')!, applyReceipt: receipts.get('apply') };
}

describe('interaction source proof', () => {
  it.each([0, 1] as const)('loads valid sequence %i with bounded source reads and no mutation', async sequence => {
    const f = await fixture(sequence), before = structuredClone({ row: f.row, receipts: [...f.receipts] });
    expect(await f.load()).toEqual(f.progress);
    expect(f.get).toHaveBeenCalledExactlyOnceWith('execution', interactionKey('open'));
    expect(f.sourceReceipt.mock.calls).toEqual(sequence === 0 ? [['admit']] : [['apply'], ['admit']]);
    expect({ row: f.row, receipts: [...f.receipts] }).toEqual(before);
  });
  it('refuses a structurally valid apply receipt predating its admission', async () => {
    const f = await fixture(1, { admissionRevision: 20 });
    expect(f.applyReceipt!.beforeRevision).toBeLessThan(f.admissionReceipt.afterRevision);
    await expect(f.load()).rejects.toThrow('invalid interaction apply source');
  });
  it.each([{ owner: 'other-owner' }, { epoch: 2 }, { owner: 'other-owner', epoch: 2 }])(
    'refuses a self-consistent foreign apply source %j', async options => {
      const f = await fixture(1, options);
      await expect(f.load()).rejects.toThrow('interaction admission authority changed');
    });
  it('retains original apply evidence when the operation later changes custody', async () => {
    const f = await fixture();
    f.operation.owner = 'later-owner'; f.operation.epoch = 2; f.operation.revision = 20;
    const { witness: _, ...body } = f.operation; Object.assign(f.operation, sealOperation(body));
    expect(await f.load()).toEqual(f.progress);
  });
  it.each(['extra-field', 'sequence', 'operation'] as const)('refuses unsupported apply source %s', async defect => {
    const f = await fixture();
    alterSource(f.applyReceipt!, source => {
      if (defect === 'extra-field') (source.input as JsonObject).unexpected = true;
      if (defect === 'sequence') (source.input as JsonObject).sequence = 1;
      if (defect === 'operation') source.operation = 'content.command';
    });
    await expect(f.load()).rejects.toThrow(defect === 'extra-field' ? 'invalid roster fields' : 'invalid interaction apply source');
  });
  it.each(['missing', 'binding', 'operation-id'] as const)('refuses damaged admission %s', async defect => {
    const f = await fixture();
    if (defect === 'missing') f.receipts.delete('admit');
    else alterSource(f.admissionReceipt, source => {
      if (defect === 'operation-id') (source.input as JsonObject).operationId = 'other';
      else ((source.input as JsonObject).binding as JsonObject).position = { level: 1, cell: { spaceId: 'other', row: 1, column: 1 } };
    });
    await expect(f.load()).rejects.toThrow(defect === 'missing' ? 'missing source receipt' : 'interaction admission authority changed');
  });
  it.each(['status', 'reason', 'sequence', 'outcome'] as const)('refuses receipt outcome tamper: %s', async field => {
    const f = await fixture(), result = f.applyReceipt!.result as JsonObject;
    result[field] = field === 'status' ? 'unchanged' : field === 'reason' ? 'unavailable' : field === 'sequence' ? 0
      : { kind: 'open-chest', outcome: 'applied', chestId: 'chest', lootIds: ['different-a', 'different-b'] };
    await expect(f.load()).rejects.toThrow('interaction receipt outcome changed');
  });
  it.each(['witness', 'record-id', 'record-body'] as const)('refuses progress witness tamper: %s', async defect => {
    const f = await fixture(), result = f.applyReceipt!.result as JsonObject;
    if (defect === 'witness') result.recordWitness = '{}';
    if (defect === 'record-id') result.recordId = 'other-record';
    if (defect === 'record-body') ((f.row.value as JsonObject).result as JsonObject).lootIds = ['different-a', 'different-b'];
    await expect(f.load()).rejects.toThrow('interaction source changed');
  });
  it('propagates real receipt-validator failure without treating the source as absent or valid', async () => {
    const f = await fixture(); f.applyReceipt!.afterRevision++;
    await expect(f.load()).rejects.toThrow('invalid original receipt');
  });
});
