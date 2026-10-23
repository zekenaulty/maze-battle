// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { JsonObject } from '../types';
import { readActionResult } from './actions.result';
import { queryDecision } from './decision.query.prepare';
import { validateDecisionQueryResult } from './decision.query.proof';
import { readDecisionObservation } from './decision.query.source';
import { decisionQueryFixture } from './decision.query.test-support';
import { assertLaunchGrant } from './launch.grant';
import { loadOperationBinding } from './operation.binding';
import { readRunGrantCertificate } from './run-grant.certificate';
import { restoreRetainedAction, snapshotPrepared } from './validation';

vi.mock('./launch.grant', () => ({ assertLaunchGrant: vi.fn() }));
vi.mock('./run-grant.certificate', () => ({ readRunGrantCertificate: vi.fn() }));
vi.mock('./operation.binding', async original => ({ ...await original<typeof import('./operation.binding')>(), loadOperationBinding: vi.fn() }));
vi.mock('./terminal.base', () => ({ loadAgenticaTerminalBase: vi.fn() }));
vi.mock('./validation', async original => ({ ...await original<typeof import('./validation')>(), restoreRetainedAction: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture() {
  const f = await decisionQueryFixture({ source: 'probe' });
  vi.mocked(restoreRetainedAction).mockImplementation(async () => snapshotPrepared(f.predecessor));
  const anchor = { kind: 'probe' as const, reference: { key: f.eventRow.key, id: f.eventRow.id } };
  const source = (await f.pages.sourceReceipt((f.eventRow.value as JsonObject).sourceAttemptId as string)).source;
  // Deliberately source-witness an invalid candidate to isolate semantic checks from byte-tamper checks.
  const witnessCandidate = () => f.receipt(source, { agenticaOperation: { ...anchor.reference, recordWitness: canonicalJson(f.eventRow) } });
  return { ...f, anchor, source, witnessCandidate };
}

it('keeps a real zero-step custody identity, original publication and operation through query/replay', async () => {
  const f = await fixture(), before = structuredClone({ records: f.records, receipts: f.receipts });
  const read = await readDecisionObservation(f.pages, f.anchor, f.predecessor.storageKey);
  expect(read.source).toEqual(f.source);
  expect(read.event).toEqual(f.previous);
  expect(read.event).toMatchObject({ eventId: `custody-${f.source.attemptId}`, sequence: 1,
    operationId: f.terminal.bound.result.operation!.operationId, usage: { steps: 0 },
    observation: f.terminal.bound.result.observation });
  const checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
  expect(checked.proof.previous!.observation).toEqual(f.anchor);
  expect(checked.result.observation!.data).toEqual({ scope: 'decision', state: 'historical', event: f.terminal.event });
  expect(f.terminal.event).toMatchObject({ sequence: 2, eventId: f.terminal.terminal.terminal.source.attemptId, usage: { steps: 0 } });
  expect({ records: f.records, receipts: f.receipts }).toEqual(before);
  const ref = await f.store(checked.result, checked.proof);
  f.head.owner = 'next-owner'; f.head.epoch++; f.head.revision += 100;
  vi.mocked(assertLaunchGrant).mockRejectedValue(Error('No current authority'));
  vi.mocked(readRunGrantCertificate).mockRejectedValue(Error('No current grant'));
  vi.mocked(loadOperationBinding).mockRejectedValue(Error('No live operation'));
  const retained = structuredClone({ records: f.records, receipts: f.receipts });
  expect(await readActionResult(f.pages, f.queryIdentity, ref)).toEqual(checked.result);
  expect({ records: f.records, receipts: f.receipts }).toEqual(retained);
});

it.each(['bare', 'foreign', 'double-prefix'] as const)('rejects a source-witnessed probe with %s attempt identity', async defect => {
  const f = await fixture();
  f.previous.eventId = defect === 'bare' ? f.source.attemptId
    : defect === 'foreign' ? 'custody-other-attempt' : `custody-custody-${f.source.attemptId}`;
  (f.eventRow.value as JsonObject).data = { probe: f.previous } as unknown as JsonObject;
  f.witnessCandidate();
  await expect(readDecisionObservation(f.pages, f.anchor, f.predecessor.storageKey)).rejects.toThrow('historical observation event changed');
});

it.each(['action', 'row-id', 'revision', 'command', 'witness', 'missing-source'] as const)('rejects wrong probe %s source', async defect => {
  const f = await fixture();
  if (defect === 'row-id') f.anchor.reference.id = 'foreign';
  if (defect === 'revision') f.eventRow.revision++;
  if (defect === 'command') { f.source.operation = 'navigation.advance'; f.witnessCandidate(); }
  if (defect === 'witness') (f.eventRow.value as JsonObject).data = {};
  if (defect === 'missing-source') f.receipts.delete(f.source.attemptId);
  const action = defect === 'action' ? `agentica/actions/${'0'.repeat(64)}` : f.predecessor.storageKey;
  await expect(readDecisionObservation(f.pages, f.anchor, action)).rejects.toThrow();
});

it.each(['publication', 'operation', 'terminal-attempt'] as const)('rejects a zero-step historical proof with wrong %s', async defect => {
  const f = await fixture(), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
  if (defect === 'publication') (f.pending.original.sourceRequest.input as JsonObject).publication = { key: 'agentica/publications/foreign', id: 'foreign' };
  if (defect === 'operation') {
    f.previous.operationId = 'foreign-operation';
    (f.eventRow.value as JsonObject).data = { probe: f.previous } as unknown as JsonObject;
    f.witnessCandidate();
  }
  if (defect === 'terminal-attempt') f.receipts.delete(f.terminal.event.eventId);
  await expect(validateDecisionQueryResult(f.pages, checked.proof, f.queryIdentity, f.pending, checked.result)).rejects.toThrow();
});

it.each(['progress', 'transfer'] as const)('does not admit a custody-prefixed %s event', async kind => {
  const f = await decisionQueryFixture({ source: kind });
  const source = (await f.pages.sourceReceipt((f.eventRow.value as JsonObject).sourceAttemptId as string)).source;
  f.previous.eventId = `custody-${source.attemptId}`;
  (f.eventRow.value as JsonObject).data = { event: f.previous } as unknown as JsonObject;
  f.receipt(source, kind === 'progress' ? { host: { event: { key: f.eventRow.key, recordId: f.eventRow.id,
    revision: f.eventRow.revision, sourceAttemptId: source.attemptId, recordWitness: canonicalJson(f.eventRow) } } }
    : { transferIntent: { key: f.eventRow.key, id: f.eventRow.id, witness: canonicalJson(f.eventRow) } });
  await expect(readDecisionObservation(f.pages, { kind, reference: { key: f.eventRow.key, id: f.eventRow.id } },
    f.predecessor.storageKey)).rejects.toThrow('historical observation event changed');
});
