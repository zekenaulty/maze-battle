// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { gameCheckpoint } from '../game/checkpoint';
import { loadInteraction, saveInteraction } from '../interaction/records';
import type { InteractionProgress } from '../interaction/types';
import { createInteractionBinding } from '../interaction/validation';
import { operationRecordRef } from '../operationHost';
import { sealOperation } from '../operationValidation';
import type { CanonicalPages } from '../pages';
import { validateReceipt } from '../receipts';
import { MIN_TERMINAL_BYTES, type CanonicalReceipt, type CanonicalRecord, type CanonicalRequest, type JsonObject } from '../types';
import { eventKey, loadOperationEvent, type ConfirmedOperation } from './event.records';
import { interactionObservationData, interactionSummary } from './event.interaction';
import { loadOperationCustodyAck } from './operation.custody';
import type { OperationEvent, OperationRead } from './operation.types';
import { prepareAction } from './validation';
import { protocolAction, protocolHead } from './types.test-support';

vi.mock('./operation.custody', () => ({ loadOperationCustodyAck: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(status: 'applied' | 'unchanged' | 'blocked' = 'applied') {
  const identity = await prepareAction({ ...protocolAction(), capabilityId: 'maze.interact', arguments: { chest: 'public-selection' } });
  const head = protocolHead(), cp = gameCheckpoint(head.checkpoint), base = { generation: head.generation, gameId: head.gameId };
  const binding = createInteractionBinding({ kind: 'open-chest', chestId: 'private-chest' }, cp.position);
  const request = (attemptId: string, operation: string, revision: number, input: JsonObject): CanonicalRequest => ({
    attemptId, operation, input, expected: { ...base, owner: head.owner, epoch: head.epoch, revision }, deadlineAt: null });
  const admission = request('admit', 'operation.admit', 10,
    { operationId: 'interact', binding: binding as unknown as JsonObject, terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' });
  const apply = request('apply', 'interaction.apply', 13, { operationId: 'interact', sequence: 0 });
  const rows = new Map<string, CanonicalRecord>(), receipts = new Map<string, CanonicalReceipt>();
  const write = (source: CanonicalRequest, area: string, key: string, value: unknown) => {
    const row = { ...base, area, key, value, indexes: [], id: `${source.attemptId}-${rows.size}`, revision: source.expected.revision + 1 } as CanonicalRecord;
    rows.set(key, row); return row;
  };
  async function persist(p: InteractionProgress, source: CanonicalRequest) {
    const saved = await saveInteraction({ set: async (area, key, value) => write(source, area, key, value) } as CanonicalPages, p, source);
    receipts.set(source.attemptId, { ...base, attemptId: source.attemptId, fingerprint: canonicalJson(source),
      beforeRevision: source.expected.revision, afterRevision: source.expected.revision + 1,
      committedAt: '2026-10-18T00:00:00.000Z', result: saved.result });
    return saved.progress;
  }
  const pending = await persist({ schema: 1, operationId: 'interact', binding, owner: 'owner', epoch: 1,
    sourceAttemptId: 'admit', sequence: 0, status: 'pending', reason: null, result: null }, admission);
  const progress = await persist({ ...pending, sequence: 1, status, reason: status === 'blocked' ? 'position-changed' : null,
    result: status === 'blocked' ? null : { kind: 'open-chest', outcome: status, chestId: 'private-chest',
      lootIds: status === 'applied' ? ['private-item-a', 'private-item-b'] : [] } }, apply);
  const confirmation = { key: 'confirmation', id: 'confirmation-id' }, custody = { key: 'custody', id: 'custody-id' };
  const data: OperationEvent = { confirmation, custody, previous: { kind: 'custody-probe', reference: confirmation }, event: {
    hostId: 'host', sessionId: identity.action.sessionId, sessionEpoch: '1', actionId: identity.action.actionId, operationId: 'interact',
    sequence: 2, eventId: 'apply', kind: 'progress', observation: { observationId: 'event-apply', revision: 14,
      observedAt: cp.updatedAt, data: interactionObservationData(progress, cp, { sequence: 1, id: 'earned-sight', revision: 14 }) },
    summary: interactionSummary(progress), usage: {},
  } };
  const row = write(apply, 'execution', eventKey(identity, 1), { schema: 1, kind: 'agentica-interaction-event', sourceAttemptId: 'apply', data });
  const receipt = receipts.get('apply')!, result = receipt.result as JsonObject;
  const witness = () => { result.host = { event: operationRecordRef(row, 'apply') } as unknown as JsonObject; };
  witness();
  const operation = sealOperation({ ...base, schema: 1, id: 'interact', binding: binding as unknown as JsonObject,
    admissionAttemptId: 'admit', owner: 'owner', epoch: 1, revision: 11, state: 'admitted', terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' });
  const pages = { get: vi.fn(async (_area, key) => rows.get(key) ?? null), sourceReceipt: vi.fn(async id => {
    const receipt = receipts.get(id)!; return { receipt, source: validateReceipt(receipt, base) };
  }) } as unknown as OperationRead;
  vi.mocked(loadOperationCustodyAck).mockResolvedValue({ reference: custody, row: { revision: 12 } } as unknown as NonNullable<Awaited<ReturnType<typeof loadOperationCustodyAck>>>);
  async function load() {
    const confirmed = { reference: confirmation, source: admission, data: { operationId: 'interact' }, bound: {
      kind: 'interaction', progress: await loadInteraction(pages, operation), launch: { binding: { start: { hostId: 'host' } } },
    } } as unknown as ConfirmedOperation;
    return loadOperationEvent(pages, identity, confirmed, 1);
  }
  return { load, data, row, receipt, result, witness, pages, progress };
}

it.each(['applied', 'unchanged', 'blocked'] as const)('retains one exact %s event with bounded source reads and sanitized outcome', async status => {
  const f = await fixture(status), loaded = await f.load();
  expect(loaded.data.event.observation.data).toMatchObject({ scope: 'actor', source: { id: 'earned-sight' },
    interaction: { kind: 'open-chest', outcome: status, itemsReceived: status === 'applied' ? 2 : 0 } });
  expect(JSON.stringify(loaded.data)).not.toMatch(/private-chest|private-item|lootIds|chestId|binding|questId/);
  expect(loaded.data.event.usage).toEqual({});
  expect(f.pages.sourceReceipt).toHaveBeenCalledTimes(3);
});

it('rejects an event body changed without its immutable receipt witness', async () => {
  const f = await fixture(); f.data.event.summary = 'changed';
  await expect(f.load()).rejects.toThrow('operation event source changed');
});

it.each(['kind', 'source-operation', 'source-sequence', 'owner', 'epoch', 'event-id', 'foreign-action', 'foreign-operation',
  'status', 'raw-id', 'usage', 'authority', 'previous', 'revision', 'missing-custody'])(
  'rejects %s even with a matching event-record witness', async defect => {
    const f = await fixture(), source = JSON.parse(f.receipt.fingerprint) as CanonicalRequest;
    if (defect === 'kind') (f.row.value as JsonObject).kind = 'agentica-operation-event';
    if (defect === 'source-operation') source.operation = 'navigation.advance';
    if (defect === 'source-sequence') (source.input as JsonObject).sequence = 1;
    if (defect === 'owner') source.expected.owner = 'foreign';
    if (defect === 'epoch') source.expected.epoch = 2;
    if (defect === 'event-id') f.data.event.eventId = 'foreign';
    if (defect === 'foreign-action') f.data.event.actionId = 'foreign';
    if (defect === 'foreign-operation') f.data.event.operationId = 'foreign';
    if (defect === 'status') (f.data.event.observation.data!.interaction as JsonObject).outcome = 'unchanged';
    if (defect === 'raw-id') (f.data.event.observation.data!.interaction as JsonObject).chestId = 'private-chest';
    if (defect === 'usage') f.data.event.usage = { steps: 1 };
    if (defect === 'authority') f.data.authority = { key: 'transfer', id: 'transfer' };
    if (defect === 'previous') f.data.previous.reference = { ...f.data.previous.reference, id: 'foreign' };
    if (defect === 'revision') f.data.event.observation.revision++;
    if (defect === 'missing-custody') vi.mocked(loadOperationCustodyAck).mockResolvedValue(null);
    f.receipt.fingerprint = canonicalJson(source); f.witness();
    await expect(f.load()).rejects.toThrow();
  });

it('propagates missing source evidence rather than synthesizing a no-effect observation', async () => {
  const f = await fixture(); vi.mocked(f.pages.sourceReceipt).mockRejectedValue(new Error('missing source receipt'));
  await expect(f.load()).rejects.toThrow('missing source receipt');
});
