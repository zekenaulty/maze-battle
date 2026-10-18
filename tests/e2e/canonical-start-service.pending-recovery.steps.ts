import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';
import { fundedQuota, dischargeAfterRootStop } from './canonical-start-service.decision-stop.steps';
import type { retainPendingSuccessor } from './canonical-start-service.pending.steps';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { actionFingerprint, canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { equivalentOperationWire } from '../../src/persistence/canonical/agentica/operation.wire';

export type PendingSetup = Awaited<ReturnType<typeof retainPendingSuccessor>>;
export const canonicalEvidence = (page: Page) => page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
export function tryPendingRecovery(page: Page, action: AgenticaAction, loseReply = false) {
  return page.evaluate(async ({ action, loseReply }) => {
    try { return { value: await window.canonicalStartService.recoverPendingNoEffect(action, loseReply), error: null }; }
    catch (error) { return { value: null, error: { message: String(error), code: String((error as { code?: unknown }).code ?? '') } }; }
  }, { action, loseReply });
}

export function recoveryEnvelope(wire: DecisionWire, action: AgenticaAction) {
  const sent = wire.http.filter(item => item.method === 'POST' && new URL(item.url).pathname === '/api/recovery'
    && (item.body as { result?: AgenticaResult })?.result?.actionId === action.actionId).at(-1)!;
  expect(sent.serializedBody).toBeDefined();
  expect(Buffer.byteLength(sent.serializedBody!)).toBeLessThanOrEqual(64 * 1024);
  const envelope = JSON.parse(sent.serializedBody!) as { hostId: string; sessionId: string; result: AgenticaResult };
  expect(envelope).toEqual({ hostId: 'maze-battle', sessionId: action.sessionId, result: envelope.result });
  return { serialized: sent.serializedBody!, envelope };
}

export async function assertNoEffectResult(page: Page, setup: PendingSetup, result: AgenticaResult) {
  const { root } = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  const cancellation = root.terminal!, action = setup.action;
  const identity = { schema: 1, kind: 'pregrant-unavailable', generation: root.operation.generation, gameId: root.operation.gameId,
    cancellation: cancellation.source.attemptId, claim: setup.retained.claim!.reference, action: actionFingerprint(action) };
  expect(result).toEqual({ actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
    disposition: 'unavailable', beforeRevision: cancellation.receipt.afterRevision, afterRevision: cancellation.receipt.afterRevision,
    evidenceId: 'pregrant-unavailable:' + createHash('sha256').update(canonicalJson(identity)).digest('hex'),
    summary: 'Root cancelled before successor execution authority was granted. No host effect was performed.' });
}

export async function assertRetainedRecovery(page: Page, setup: PendingSetup, result: AgenticaResult) {
  const transactions = await page.evaluate(() => window.canonicalStartService.readPendingRecoveryTransactions());
  expect(transactions.length).toBeGreaterThan(0); expect(transactions.every(mode => mode === 'readonly')).toBe(true);
  const row = await page.evaluate(action => window.canonicalStartService.readExactPendingCustody(action), setup.action);
  const original = setup.custody.entries[0];
  expect(row).toMatchObject({ request: setup.action, hostId: original.hostId, sessionId: original.sessionId,
    sessionEpoch: original.sessionEpoch, runId: original.runId, objectiveId: original.objectiveId,
    requestHash: original.requestHash, capabilityHash: original.capabilityHash, reservedAt: original.reservedAt, recoveryRetention: 'http' });
  expect(equivalentOperationWire(row.result, result, 'result')).toBe(true);
  expect(row.resultHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), setup.action))
    .toEqual({ entries: [], canonical: null, reconciled: null });
  return row;
}

export async function assertPendingQuiescent(page: Page, wire: DecisionWire, setup: PendingSetup,
  counters = setup.counters) {
  const canonical = await canonicalEvidence(page), state = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(canonical.effects).toEqual(setup.canonical.effects); expect(canonical.publications).toEqual(setup.canonical.publications);
  expect(state.head.checkpoint).toEqual(setup.retained.head.checkpoint); expect(state.selection).toEqual(setup.original.selection);
  expect(state.grant).toBeNull(); expect(state.intent!.data).toEqual(setup.retained.intent!.data);
  expect(state.claim!.data).toEqual(setup.retained.claim!.data); expect(state.originals).toEqual(setup.retained.originals);
  expect(state.actions).toEqual([]); expect(state.results).toEqual([]);
  expect(wire.sent.slice(setup.sentBeforeReload)).toEqual([]);
  expect(wire.received.filter(item => item.frame.type === 'action.request' && item.frame.runId === setup.runId)).toHaveLength(1);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
  expect(await serviceProof()).toEqual(counters);
  return { state, canonical };
}

export async function settlePendingAtQuota(page: Page) {
  await fundedQuota(page, true);
  const before = await page.evaluate(() => window.canonicalStartService.readDecision());
  const receipts = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  const rootId = before.launch!.guard.id, navigationId = before.operation!.operation.id;
  expect(receipts.root.acknowledgement).toBeNull(); expect(receipts.navigation.acknowledgement).toBeNull();
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  const rootAcked = await page.evaluate(() => window.canonicalStartService.readDecision());
  const acknowledged = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  expect(rootAcked.launch!.guard.state).toBe('acknowledged'); expect(rootAcked.operation!.operation.state).toBe('settled');
  expect(rootAcked.head.revision).toBe(before.head.revision + 1);
  expect(rootAcked.head.quota.reservations).toBe(before.head.quota.reservations - 1);
  expect(rootAcked.head.quota.reservedBytes).toBe(before.head.quota.reservedBytes - before.head.allocations[rootId].bytes);
  const { [rootId]: released, ...retained } = before.head.allocations;
  expect(released).toBeDefined(); expect(rootAcked.head.allocations).toEqual(retained);
  expect(rootAcked.head.allocations[navigationId]).toEqual(before.head.allocations[navigationId]);
  expect(rootAcked.head.checkpoint).toEqual(before.head.checkpoint);
  expect(acknowledged.root.terminal).toEqual(receipts.root.terminal); expect(acknowledged.navigation).toEqual(receipts.navigation);
  const discharged = await dischargeAfterRootStop(page, true);
  expect(discharged.after.head.quota.reservedBytes)
    .toBe(discharged.before.head.quota.reservedBytes - discharged.before.head.allocations[navigationId].bytes);
  expect(discharged.after.intent!.data).toEqual(before.intent!.data); expect(discharged.after.claim!.data).toEqual(before.claim!.data);
  expect(discharged.after.head.allocations).toEqual({});
  return { rootBefore: before, rootAcked, ...discharged };
}
