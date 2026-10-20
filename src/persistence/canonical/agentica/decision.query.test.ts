// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readActionResult } from './actions.result';
import { assertLaunchGrant } from './launch.grant';
import { loadOperationBinding } from './operation.binding';
import { readRunGrantCertificate } from './run-grant.certificate';
import { prepareAction, restoreRetainedAction, snapshotPrepared } from './validation';
import { queryDecision, snapshotPreparedDecision } from './decision.query.prepare';
import { decisionQueryProof, validateDecisionQueryResult } from './decision.query.proof';
import { decisionPages, MAX_DECISION_LOOKUPS, MAX_DECISION_READS, readPreviousDecision } from './decision.query.read';
import { decisionQueryFixture } from './decision.query.test-support';
import type { JsonObject } from '../types';
import type { ProtocolRead } from './types';

vi.mock('./launch.grant', () => ({ assertLaunchGrant: vi.fn() }));
vi.mock('./run-grant.certificate', () => ({ readRunGrantCertificate: vi.fn() }));
vi.mock('./operation.binding', async original => ({ ...await original<typeof import('./operation.binding')>(), loadOperationBinding: vi.fn() }));
vi.mock('./terminal.base', () => ({ loadAgenticaTerminalBase: vi.fn() }));
vi.mock('./validation', async original => ({ ...await original<typeof import('./validation')>(), restoreRetainedAction: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
async function fixture(options: Parameters<typeof decisionQueryFixture>[0] = {}) {
  const f = await decisionQueryFixture(options);
  vi.mocked(restoreRetainedAction).mockImplementation(async () => snapshotPrepared(f.predecessor));
  return f;
}

describe('explicit historical decision inspection', () => {
  it.each([{ adopted: false }, { adopted: true }, { newerPublication: true }])('keeps the original observation exact (%j)', async options => {
    const f = await fixture(options), before = structuredClone({ records: f.records, receipts: f.receipts });
    const checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    expect(checked.result.observation!.data).toEqual({ scope: 'decision', state: 'historical', event: f.terminal.event });
    expect(checked.result.observation!.revision).toBe(f.authorized.publication.wireRevision);
    expect(checked.result.observation!.observationId).not.toBe(f.terminal.event.observation.observationId);
    expect(checked.result.operation).toBeUndefined(); expect(checked.result.completion).toBeUndefined();
    expect({ records: f.records, receipts: f.receipts }).toEqual(before);
    expect(f.intent.data.adoption?.observation.data ?? f.intent.data.event.observation.data).not.toHaveProperty('navigation');
    const ref = await f.store(checked.result, checked.proof);
    expect(await readActionResult(f.pages, f.queryIdentity, ref)).toEqual(checked.result);
  });

  it('returns unavailable for an initial grant without following a predecessor', async () => {
    const f = await fixture({ initial: true }), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    expect(checked.result.observation!.data).toEqual({ scope: 'decision', state: 'unavailable', reason: 'initial-window' });
    expect(loadOperationBinding).not.toHaveBeenCalled(); expect(restoreRetainedAction).not.toHaveBeenCalled();
    expect(await readActionResult(f.pages, f.queryIdentity, await f.store(checked.result, checked.proof))).toEqual(checked.result);
  });

  it.each(['progress', 'probe', 'transfer'] as const)('replays immutable %s evidence with live authority unavailable', async source => {
    const f = await fixture({ source }), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    const ref = await f.store(checked.result, checked.proof);
    vi.mocked(assertLaunchGrant).mockRejectedValue(Error('Stopped or taken over'));
    vi.mocked(readRunGrantCertificate).mockRejectedValue(Error('No current grant'));
    vi.mocked(loadOperationBinding).mockRejectedValue(Error('No live operation'));
    f.head.epoch++; f.head.owner = 'next-owner'; f.head.revision += 100;
    expect(await readActionResult(f.pages, f.queryIdentity, ref)).toEqual(checked.result);
  });

  it.each(['old-scope', 'write', 'handoff', 'required', 'arguments', 'live-grant'] as const)('refuses %s', async defect => {
    const f = await fixture();
    if (defect === 'old-scope') f.authorized.capability.inputSchema.fields[0].allowedValues = ['room', 'objects'];
    if (defect === 'write') f.authorized.capability.effect = 'writesLocalState';
    if (defect === 'handoff') f.authorized.capability.durableHandoff = true;
    if (defect === 'required') f.authorized.capability.inputSchema.fields[1].required = true;
    if (defect === 'live-grant') vi.mocked(assertLaunchGrant).mockRejectedValue(Error('No live grant'));
    const identity = defect === 'arguments' ? await prepareAction({ ...f.queryIdentity.action, arguments: { scope: 'decision', target: 'other' } }) : f.queryIdentity;
    await expect(queryDecision(f.tx, identity, f.queryBinding)).rejects.toThrow();
    expect(readRunGrantCertificate).not.toHaveBeenCalled();
  });

  it.each(['clone', 'changed', 'other-action', 'other-head'] as const)('rejects a %s prepared witness', async defect => {
    const f = await fixture(), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    const proof = defect === 'clone' ? decisionQueryProof(checked.proof) : checked.proof;
    if (defect === 'changed') proof.grant.id = 'changed';
    const identity = defect === 'other-action' ? await prepareAction({ ...f.queryIdentity.action, actionId: 'other' }) : f.queryIdentity;
    expect(() => snapshotPreparedDecision(proof, identity, defect === 'other-head' ? { ...f.head, revision: f.head.revision + 1 } : f.head)).toThrow('not prepared');
  });

  it('captures identity, binding and head before authorization yields', async () => {
    const f = await fixture(), original = { identity: snapshotPrepared(f.queryIdentity), head: structuredClone(f.head) };
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(assertLaunchGrant).mockImplementationOnce(async () => { await wait; return structuredClone(f.authorized); });
    const pending = queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    Object.assign(f.queryIdentity.action, { actionId: 'changed' }); f.queryBinding.grant.id = 'changed'; f.head.owner = 'changed';
    release(); const checked = await pending;
    expect(checked.result.actionId).toBe(original.identity.action.actionId);
    expect(snapshotPreparedDecision(checked.proof, original.identity, original.head)).toEqual(checked.proof);
  });

  it('refuses an oversized historical event without truncating or rewriting the intent', async () => {
    const f = await fixture({ padding: 2200 }), before = structuredClone(f.records);
    await expect(queryDecision(f.tx, f.queryIdentity, f.queryBinding)).rejects.toThrow('no evidence was truncated');
    expect(f.records).toEqual(before);
  });

  it.each([false, true])('does not strand an existing material intent on root Stop (claimed=%s)', async claimed => {
    const f = await fixture(), before = structuredClone(f.records.get(f.intent.reference.key));
    const checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding), ref = await f.store(checked.result, checked.proof);
    const entry = await f.remote(claimed);
    if (claimed) { await f.claim(entry); entry.state = 'cancelled'; entry.stopDecision = entry.latestEvent; }
    f.stopRoot(); await f.ack(entry, 'decision-root-stop');
    expect(f.terminal.bound.operation.state).toBe('acknowledged');
    expect(f.records.get(f.intent.reference.key)).toEqual(before);
    expect(await readActionResult(f.pages, f.queryIdentity, ref)).toEqual(checked.result);
  });
});

describe('retained decision source proof', () => {
  it('preserves prototype methods and their receiver for real canonical page readers', async () => {
    const f = await fixture(), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    class Pages implements ProtocolRead {
      private readonly source: ProtocolRead;
      constructor(source: ProtocolRead) { this.source = source; }
      get(area: Parameters<ProtocolRead['get']>[0], key: string) { return this.source.get(area, key); }
      sourceReceipt(id: string) { return this.source.sourceReceipt(id); }
      savedSnapshot(key: string) { return this.source.savedSnapshot(key); }
    }
    const pages = new Pages(f.pages);
    expect(Object.hasOwn(pages, 'get')).toBe(false);
    expect(await validateDecisionQueryResult(pages, checked.proof, f.queryIdentity, f.pending, checked.result)).toEqual(checked.proof);
    const ref = await f.store(checked.result, checked.proof);
    expect(await readActionResult(pages, f.queryIdentity, ref)).toEqual(checked.result);
  });

  it.each(['grant', 'intent', 'anchor', 'terminal', 'witness', 'game', 'output', 'operation', 'completion', 'missing'] as const)(
    'rejects %s tampering', async defect => {
      const f = await fixture(), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
      if (defect === 'grant') checked.proof.grant.id = 'foreign';
      if (defect === 'intent') checked.proof.previous!.intent.id = 'foreign';
      if (defect === 'anchor') checked.proof.previous!.observation.reference.id = 'foreign';
      if (defect === 'terminal') f.receipts.delete(f.terminal.event.eventId);
      if (defect === 'witness') (f.eventRow.value as JsonObject).data = {};
      if (defect === 'game') f.pending.publication.snapshot.gameId = 'foreign';
      if (defect === 'output') checked.result.observation!.data = { scope: 'decision', state: 'unavailable' };
      if (defect === 'operation') checked.result.operation = { operationId: 'invented', summary: 'invented' };
      if (defect === 'completion') checked.result.completion = { objectiveId: 'invented', evidenceId: 'invented', summary: 'invented' };
      await expect(validateDecisionQueryResult(f.pages, defect === 'missing' ? undefined : checked.proof,
        f.queryIdentity, f.pending, checked.result)).rejects.toThrow();
    });

  it('does not allow a manufactured historical result through the shared result writer', async () => {
    const f = await fixture(), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    await expect(f.store(checked.result, structuredClone(checked.proof))).rejects.toThrow('not prepared');
    await expect(f.store(checked.result)).rejects.toThrow();
  });

  it.each(['intent', 'admission', 'launch'] as const)('rejects mismatched immediate predecessor %s', async defect => {
    const f = await fixture();
    if (defect === 'intent') (f.certified.record.value.data as { intent: { id: string } }).intent.id = 'foreign';
    if (defect === 'admission') f.terminal.bound.original.reference.id = 'foreign';
    if (defect === 'launch') f.prior.launch.binding.launchId = 'foreign';
    await expect(readPreviousDecision(f.pages, f.queryBinding.grant)).rejects.toThrow();
  });
});

describe('bounded decision reads', () => {
  it('has identical reads with zero or 1000 unrelated historical records and passes the predecessor certificate explicitly', async () => {
    const f = await fixture();
    const first = decisionPages(f.pages); await readPreviousDecision(first.pages, f.queryBinding.grant);
    for (let i = 0; i < 1000; i++) f.records.set(`history-${i}`, { ...f.eventRow, key: `history-${i}` });
    const second = decisionPages(f.pages); await readPreviousDecision(second.pages, f.queryBinding.grant);
    expect(second.usage).toEqual(first.usage);
    expect(first.usage.reads).toBe(3); // Real intent record/receipt and its publication; upstream authority is a fixture boundary.
    expect(loadOperationBinding).toHaveBeenLastCalledWith(second.pages, f.predecessor, f.intent.data.binding, f.prior);
  });

  it('replay has a seven-read ceiling independent of retained history, without live-operation reads', async () => {
    const f = await fixture(), checked = await queryDecision(f.tx, f.queryIdentity, f.queryBinding);
    const first = decisionPages(f.pages);
    await validateDecisionQueryResult(first.pages, checked.proof, f.queryIdentity, f.pending, checked.result);
    for (let i = 0; i < 1000; i++) f.records.set(`history-${i}`, { ...f.eventRow, key: `history-${i}` });
    const second = decisionPages(f.pages);
    await validateDecisionQueryResult(second.pages, checked.proof, f.queryIdentity, f.pending, checked.result);
    expect(first.usage.reads).toBe(7); expect(second.usage).toEqual(first.usage);
    console.info(`decision proof replay: ${first.usage.reads} reads / ${first.usage.bytes} bytes; unchanged with 1000 unrelated records`);
  });

  it('forbids domain reads and enforces count/byte caps before returning partial evidence', async () => {
    const f = await fixture(), bounded = decisionPages(f.pages);
    expect(() => bounded.pages.get('world', 'room')).toThrow('forbids domain');
    expect(() => bounded.pages.get('knowledge', 'cell')).toThrow('forbids domain');
    for (let i = 0; i < MAX_DECISION_READS; i++) await bounded.pages.get('execution', `absent-${i}`);
    await expect(bounded.pages.get('execution', 'absent')).rejects.toThrow('read budget');
    f.eventRow.value = { padding: 'x'.repeat(1024 * 1024) };
    await expect(decisionPages(f.pages).pages.get('execution', f.eventRow.key)).rejects.toThrow('byte budget');
  });

  it('isolates cached records and bounds repeated validation lookups', async () => {
    const f = await fixture(), bounded = decisionPages(f.pages);
    const row = (await bounded.pages.get('execution', f.eventRow.key))!; row.id = 'caller-mutated';
    expect((await bounded.pages.get('execution', f.eventRow.key))!.id).toBe(f.eventRow.id);
    for (let i = 2; i < MAX_DECISION_LOOKUPS; i++) await bounded.pages.get('execution', f.eventRow.key);
    expect(bounded.usage.reads).toBe(1);
    await expect(bounded.pages.get('execution', f.eventRow.key)).rejects.toThrow('lookup budget');
  });
});
