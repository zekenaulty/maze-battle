import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { completeInitialDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';
import { reloadDecision } from './canonical-start-service.decision-adoption.steps';
import { pulseError, terminalWindow } from './canonical-start-service.decision-recovery.steps';

test('lost real adopt reply replays the exact retained adoption in the same ownership without another planner', async ({ page, wire }) => {
  const { before, original } = await completeInitialDecision(page, 'terminal');
  await reloadDecision(page, original.originals[3]!.reference);
  await page.evaluate(() => window.canonicalStartService.prepareDecision());
  await page.evaluate(() => window.canonicalStartService.decisionReplyAfterOutcome());
  await page.evaluate(() => window.canonicalStartService.loseDecisionReply());
  for (const status of ['connected', 'prefix-delivered'])
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe(status);
  expect((await pulseError(page)).message).toContain('discarded the real correlated decision-wake reply');
  const lost = await page.evaluate(() => window.canonicalStartService.readDecision()), intent = lost.intent!;
  const counters = await serviceProof();
  expect(counterDelta(counters, before)).toEqual({ created: 2, initial: scriptedWindow, successor: terminalWindow });
  expect(lost.claim).toBeNull(); expect(lost.grant).toBeNull(); expect(lost.replies).toHaveLength(1);
  expect(lost.adoptions).toEqual([{ event: intent.data.event, adoption: intent.data.adoption }]);
  expect(lost.actions).toEqual([]); expect(lost.selection).toEqual(original.selection);
  await page.evaluate(() => window.canonicalStartService.attachDecisionController());
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('connected');
  expect(await serviceProof()).toEqual(counters);
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('claimed');
  expect(await page.evaluate(() => window.canonicalStartService.pulseDecision())).toMatchObject({ status: 'successor-settled', state: 'blocked' });
  const replayed = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(replayed.head.owner).toBe(lost.head.owner); expect(replayed.head.epoch).toBe(lost.head.epoch);
  expect(replayed.intent).toEqual(lost.intent);
  expect(replayed.adoptions).toEqual([lost.adoptions[0], lost.adoptions[0]]);
  expect(replayed.replies).toHaveLength(2); expect(replayed.replies[0]).toEqual(lost.replies[0]);
  // Service snapshot metadata advances; the replay's run and authority bindings must not.
  for (const key of ['runId', 'manifestHash', 'hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'])
    expect(replayed.replies[1][key]).toEqual(lost.replies[0][key]);
  expect(replayed.claim!.data).toMatchObject({ started: replayed.replies[1], state: 'blocked' });
  expect(replayed.grant).toBeNull(); expect(replayed.selection).toEqual(original.selection);
  expect(replayed.launch!.guard).toEqual(original.launch!.guard); expect(replayed.actions).toEqual([]);
  expect(await serviceProof()).toEqual(counters);
  await page.evaluate(() => window.canonicalStartService.cancelDecision());
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
  const settled = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(settled.operation!.operation.state).toBe('acknowledged'); expect(settled.launch!.guard.state).toBe('acknowledged');
  expect(settled.originals).toEqual([original.originals[3]]);
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
  expect((await page.evaluate(() => window.canonicalStartService.readDecision())).head).toEqual(settled.head);
  expect(await serviceProof()).toEqual(counters);
  expect(wire.sent.filter(frame => frame.type === 'operation.adopt').map(frame => frame.payload))
    .toEqual(Array(2).fill({ decision: intent.data.event, adoption: intent.data.adoption }));
  expect(wire.sent.filter(frame => ['resume', 'operation.wake'].includes(frame.type))).toEqual([]);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
});
