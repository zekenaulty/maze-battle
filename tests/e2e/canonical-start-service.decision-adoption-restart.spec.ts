import { test, expect, service, serviceProof } from './canonical-start-service.decision.test';
import { completeInitialDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';
import { reloadDecision } from './canonical-start-service.decision-adoption.steps';
import { pulseError, terminalWindow } from './canonical-start-service.decision-recovery.steps';

test('service restart refuses exact lost-adoption replay and root Stop discharges navigation without a fabricated claim', async ({ page, wire }, info) => {
  const { before, original } = await completeInitialDecision(page, 'terminal');
  await reloadDecision(page, original.originals[3]!.reference);
  await page.evaluate(() => window.canonicalStartService.prepareDecision());
  await page.evaluate(() => window.canonicalStartService.decisionReplyAfterOutcome());
  await page.evaluate(() => window.canonicalStartService.loseDecisionReply());
  for (const status of ['connected', 'prefix-delivered'])
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe(status);
  expect((await pulseError(page)).message).toContain('discarded the real correlated decision-wake reply');
  const lost = await page.evaluate(() => window.canonicalStartService.readDecision());
  const beforeRestart = await serviceProof();
  expect(counterDelta(beforeRestart, before)).toEqual({ created: 2, initial: scriptedWindow, successor: terminalWindow });
  expect(lost.claim).toBeNull(); expect(lost.grant).toBeNull(); expect(lost.replies).toHaveLength(1);
  const restarted = await service.restart();
  expect(restarted.processId).not.toBe(beforeRestart.processId); expect(restarted.created).toBe(0);
  await page.evaluate(() => window.canonicalStartService.attachDecisionController());
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('connected');
  expect((await pulseError(page)).code).toBe('operation.wake_interrupted');
  const refused = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(refused.head).toEqual(lost.head); expect(refused.intent).toEqual(lost.intent);
  expect(refused.claim).toBeNull(); expect(refused.grant).toBeNull(); expect(refused.selection).toEqual(original.selection);
  expect(refused.adoptions).toEqual([lost.adoptions[0], lost.adoptions[0]]); expect(refused.replies).toEqual(lost.replies);
  expect(refused.actions).toEqual([]); expect(await serviceProof()).toEqual(restarted);
  await page.evaluate(() => window.canonicalStartService.cancelDecision());
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
  const settled = await page.evaluate(() => window.canonicalStartService.readDecision());
  const receipts = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
  expect(settled.claim).toBeNull(); expect(settled.grant).toBeNull(); expect(settled.selection).toEqual(original.selection);
  expect(settled.launch!.guard.state).toBe('acknowledged'); expect(settled.operation!.operation.state).toBe('acknowledged');
  expect(settled.head.allocations[settled.launch!.guard.id]).toBeUndefined();
  expect(settled.head.allocations[settled.operation!.operation.id]).toBeUndefined();
  expect(receipts.navigation.acknowledgement!.source.input).toMatchObject({ proof: { delivery: 'decision-root-stop',
    decision: { intent: lost.intent!.reference, claim: null, rootAcknowledgement: receipts.root.acknowledgement!.source.attemptId } } });
  expect(await serviceProof()).toEqual(restarted);
  expect(wire.sent.filter(frame => frame.type === 'operation.adopt').map(frame => frame.payload))
    .toEqual(Array(2).fill({ decision: lost.intent!.data.event, adoption: lost.intent!.data.adoption }));
  expect(wire.sent.filter(frame => ['resume', 'operation.wake'].includes(frame.type))).toEqual([]);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.received.filter(item => item.frame.type === 'error').map(item => item.frame.payload.code)).toEqual(['operation.wake_interrupted']);
  await info.attach('adoption-restart-boundary.json', { body: JSON.stringify({ beforeRestart, restarted, after: await serviceProof(), receipts }, null, 2),
    contentType: 'application/json' });
});
