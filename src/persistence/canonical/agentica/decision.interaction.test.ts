// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { loadDecisionClaim } from './decision.claim';
import { decisionKey } from './decision.records';
import { interactionDecisionFixture } from './decision.interaction.test-support';
import { loadAgenticaTerminal } from './terminal';
import { loadAgenticaTerminalBase } from './terminal.base';
import { decisionHandoffEvidence, validateDecisionHandoffProof } from './terminal.decision';
import { decisionRootStopEvidence, validateDecisionRootStopProof } from './terminal.root-stop';
import { snapshotPrepared } from './validation';
import type { CanonicalRequest, JsonObject } from '../types';

// The upstream terminal is the test boundary, not a mocked decision predicate, intent, claim, or ACK validator.
vi.mock('./terminal.base', () => ({ loadAgenticaTerminalBase: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
async function fixture(kind: 'interaction' | 'navigation' = 'interaction') {
  const f = await interactionDecisionFixture(kind);
  vi.mocked(loadAgenticaTerminalBase).mockImplementation(async () => ({ ...structuredClone(f.terminal), identity: snapshotPrepared(f.identity) }));
  return f;
}

describe('interaction decisions and recovery proofs', () => {
  it.each(['interaction', 'navigation'] as const)('writes, rereads and reloads a valid %s intent without mutation', async kind => {
    const f = await fixture(kind), ref = await f.intent(), before = structuredClone({ records: f.records, receipts: f.receipts });
    expect((await f.read())?.reference).toEqual(ref); f.reload();
    const read = await f.read(); expect(read?.reference).toEqual(ref);
    expect(read?.terminal.terminal.disposition).toBe(kind === 'interaction' ? 'decision' : 'completed');
    expect({ records: f.records, receipts: f.receipts }).toEqual(before);
    expect(await f.intent()).toEqual(ref); expect(f.records.size).toBe(before.records.size);
  });
  it.each(['interaction', 'navigation'] as const)('validates %s handoff ACK and historical reload after a later root Stop', async kind => {
    const f = await fixture(kind); await f.intent(); const entry = await f.remote(); await f.claim(entry);
    const claim = await loadDecisionClaim(f.pages, f.identity); expect(claim?.data.started.runId).toBe('successor');
    const ack = await f.ack(entry, 'decision-handoff'); f.reload();
    expect((await loadAgenticaTerminal(f.pages, f.identity, f.binding))?.bound.operation.state).toBe('acknowledged');
    await validateDecisionHandoffProof(f.pages, f.terminal, ack.evidence.decision, ack.evidence.remote, ack.request.expected.revision);
    f.stopRoot(); f.reload();
    expect((await loadAgenticaTerminal(f.pages, f.identity, f.binding))?.event.kind).toBe('decision');
  });
  it.each([{ kind: 'interaction', claimed: false }, { kind: 'interaction', claimed: true },
    { kind: 'navigation', claimed: false }, { kind: 'navigation', claimed: true }] as const)(
    'validates root-stop ACK and historical reload: %j', async ({ kind, claimed }) => {
    const f = await fixture(kind); await f.intent(); const entry = await f.remote(claimed);
    if (claimed) {
      await f.claim(entry); entry.state = 'cancelled'; entry.stopDecision = entry.latestEvent;
    }
    f.stopRoot();
    const ack = await f.ack(entry, 'decision-root-stop'); f.reload();
    await validateDecisionRootStopProof(f.pages, f.terminal, ack.evidence.decision, ack.evidence.remote, ack.request.expected.revision);
    expect((await loadAgenticaTerminal(f.pages, f.identity, f.binding))?.bound.operation.state).toBe('acknowledged');
    expect(ack.evidence.decision).toHaveProperty('rootAcknowledgement');
  });
  it.each(['interaction', 'navigation'] as const)('rejects the other domain disposition for the %s intent reader', async kind => {
    const f = await fixture(kind); await f.intent(); const entry = await f.remote(); await f.claim(entry);
    f.terminal.terminal.disposition = kind === 'interaction' ? 'completed' : 'decision';
    await expect(f.read()).rejects.toThrow();
    await expect(decisionHandoffEvidence(f.pages, f.terminal, entry)).rejects.toThrow();
    f.stopRoot(); entry.state = 'cancelled'; entry.stopDecision = entry.latestEvent;
    await expect(decisionRootStopEvidence(f.pages, f.terminal, entry)).rejects.toThrow();
  });
  it.each(['interaction', 'navigation'] as const)('independently checks the outer %s terminal in both ACK paths', async kind => {
    const f = await fixture(kind); await f.intent(); const entry = await f.remote(); await f.claim(entry);
    const wrong = { ...f.terminal, terminal: structuredClone(f.terminal.terminal) };
    wrong.terminal.disposition = kind === 'interaction' ? 'completed' : 'decision';
    await expect(decisionHandoffEvidence(f.pages, wrong, entry)).rejects.toThrow('handoff lacks exact');
    f.stopRoot(); entry.state = 'cancelled'; entry.stopDecision = entry.latestEvent;
    await expect(decisionRootStopEvidence(f.pages, wrong, entry)).rejects.toThrow('root settlement lacks original');
    expect(await f.read()).not.toBeNull();
  });
  it.each(['decision-handoff', 'decision-root-stop'] as const)('revalidates the actual retained %s ACK source after reload', async delivery => {
    const f = await fixture(); await f.intent(); const entry = await f.remote(delivery === 'decision-handoff');
    if (delivery === 'decision-handoff') await f.claim(entry); else f.stopRoot();
    const ack = await f.ack(entry, delivery), receipt = f.receipts.get(ack.request.attemptId)!;
    const request = JSON.parse(receipt.fingerprint) as CanonicalRequest;
    const proof = (request.input as JsonObject).proof as JsonObject;
    ((proof.remote as JsonObject).usage as JsonObject).steps = 99;
    receipt.fingerprint = canonicalJson(request); f.reload();
    await expect(loadAgenticaTerminal(f.pages, f.identity, f.binding)).rejects.toThrow();
  });
  it.each(['blocked', 'cancelled'] as const)('does not reinterpret an interaction %s as a continuation decision', async disposition => {
    const f = await fixture(); await f.intent();
    f.terminal.terminal.disposition = disposition; f.terminal.event.kind = disposition;
    await expect(f.read()).rejects.toThrow(); await expect(f.intent()).rejects.toThrow();
  });
  it.each(['missing-source', 'invalid-receipt', 'row-witness', 'foreign-publication'] as const)('fails closed on %s after reload', async defect => {
    const f = await fixture(); await f.intent(); const row = f.records.get(decisionKey(f.identity))!, value = row.value as JsonObject;
    const receipt = f.receipts.get(value.sourceAttemptId as string)!;
    if (defect === 'missing-source') f.receipts.delete(receipt.attemptId);
    if (defect === 'invalid-receipt') receipt.afterRevision++;
    if (defect === 'row-witness') (receipt.result as JsonObject).agenticaOperation = { key: row.key, id: row.id, recordWitness: '{}' };
    if (defect === 'foreign-publication') f.records.delete(f.publication.key);
    f.reload(); await expect(f.read()).rejects.toThrow();
  });
  it.each(['references', 'epoch', 'usage', 'state', 'claim-revision'] as const)('rejects changed handoff proof %s', async defect => {
    const f = await fixture(); await f.intent(); const entry = await f.remote(); await f.claim(entry);
    const proof = await decisionHandoffEvidence(f.pages, f.terminal, entry);
    if (defect === 'references') proof.decision.claim.id = 'foreign';
    if (defect === 'epoch') proof.remote.activeEpoch = '2';
    if (defect === 'usage') proof.remote.usage.steps++;
    if (defect === 'state') proof.remote.state = 'completed';
    await expect(validateDecisionHandoffProof(f.pages, f.terminal, proof.decision, proof.remote,
      f.head.revision - (defect === 'claim-revision' ? 1 : 0))).rejects.toThrow();
  });
  it.each(['references', 'usage', 'still-waking', 'root-revision', 'unacknowledged-root'] as const)('rejects changed root-stop proof %s', async defect => {
    const f = await fixture(); await f.intent(); const entry = await f.remote(false); f.stopRoot();
    const proof = await decisionRootStopEvidence(f.pages, f.terminal, entry);
    if (defect === 'references') proof.decision.rootAcknowledgement = 'foreign';
    if (defect === 'usage') proof.remote.usage.steps++;
    if (defect === 'still-waking') { proof.remote.state = 'waking'; proof.remote.stopped = false; }
    if (defect === 'unacknowledged-root') f.terminal.bound.launch.guard.state = 'settled';
    await expect(validateDecisionRootStopProof(f.pages, f.terminal, proof.decision, proof.remote,
      f.head.revision - (defect === 'root-revision' ? 1 : 0))).rejects.toThrow();
  });
});
