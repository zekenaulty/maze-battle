import type { Page, TestInfo } from '@playwright/test';
import { expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';
import { completeInitialDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';
import { reloadDecision } from './canonical-start-service.decision-adoption.steps';
import { pulseError } from './canonical-start-service.decision-recovery.steps';
import { readPendingRun } from './canonical-start-service.pending-run';
import type { AgenticaAction } from '../../src/services/agentica/contracts';

export async function retainPendingSuccessor(page: Page, wire: DecisionWire, info: TestInfo) {
  const { before, original } = await completeInitialDecision(page);
  const reference = original.originals[3]!.reference;
  await reloadDecision(page, reference);
  await page.evaluate(() => window.canonicalStartService.prepareDecision());
  for (const status of ['connected', 'prefix-delivered', 'claimed'])
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe(status);
  const retained = await page.evaluate(() => window.canonicalStartService.readDecision());
  const runId = retained.claim!.data.started.runId;
  expect(retained.claim!.data.state).toBe('waking'); expect(retained.grant).toBeNull();
  expect(retained.launch!.guard).toEqual(original.launch!.guard); expect(retained.results).toEqual([]);
  await expect.poll(() => wire.received.some(({ frame }) => frame.type === 'action.request' && frame.runId === runId)).toBe(true);
  const request = wire.received.find(({ frame }) => frame.type === 'action.request' && frame.runId === runId)!.frame;
  const action = request.payload as unknown as AgenticaAction;
  expect(action).toMatchObject({ runId, sessionId: original.started.sessionId, sessionEpoch: retained.claim!.data.started.sessionEpoch,
    capabilityId: 'maze.inspect', manifestHash: retained.claim!.data.started.manifestHash });
  const custody = await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), action);
  expect(custody.entries).toHaveLength(1);
  expect(custody.entries[0]).toMatchObject({ request: action, runId, sessionEpoch: action.sessionEpoch, result: null, resultHash: null });
  expect(custody.entries[0].requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(custody.entries[0].capabilityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(custody.canonical).toBeNull(); expect(custody.reconciled).toBeNull();
  expect(wire.sent.filter(frame => frame.type === 'action.result' && frame.runId === runId)).toEqual([]);
  expect(wire.received.filter(({ frame }) => frame.type === 'outcome' && frame.runId === runId)).toEqual([]);
  const canonical = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  const run = await readPendingRun(action);
  expect(run).toMatchObject({ terminal: false, completionCompleted: false, unresolved: true });
  const counters = await serviceProof(), sentBeforeReload = wire.sent.length;
  expect(counterDelta(counters, before)).toEqual({ created: 2, initial: scriptedWindow,
    successor: { instances: 1, createCalls: 1, refineCalls: 0, stepsPlanned: 1, emptyPlans: 0 } });
  await info.attach('pending-action-before-reload.json', { body: JSON.stringify({ request, custody, retained, canonical, run, counters }, null, 2), contentType: 'application/json' });
  return { original, reference, retained, runId, action, custody, canonical, counters, sentBeforeReload };
}

export async function reloadPendingSuccessor(page: Page, wire: DecisionWire,
  pending: Awaited<ReturnType<typeof retainPendingSuccessor>>) {
  const { reference, retained, original, sentBeforeReload, counters, action, custody } = pending;
  const reconstructed = await reloadDecision(page, reference);
  expect(reconstructed.head.owner).not.toBe(retained.head.owner); expect(reconstructed.head.epoch).toBeGreaterThan(retained.head.epoch);
  expect(reconstructed.head.checkpoint).toEqual(retained.head.checkpoint);
  expect(reconstructed.intent).toEqual(retained.intent); expect(reconstructed.claim).toEqual(retained.claim);
  expect(reconstructed.grant).toBeNull(); expect(reconstructed.selection).toEqual(original.selection);
  expect((await pulseError(page)).message).toContain('current-owner intention');
  expect(wire.sent.slice(sentBeforeReload)).toEqual([]); expect(await serviceProof()).toEqual(counters);
  expect(await page.evaluate(action => window.canonicalStartService.readPendingCustody(action), action)).toEqual(custody);
  const canonical = await page.evaluate(() => window.canonicalStartService.readPendingCanonicalEvidence());
  expect(canonical.effects).toEqual(pending.canonical.effects);
  expect(canonical.publications).toEqual(pending.canonical.publications);
  return reconstructed;
}
