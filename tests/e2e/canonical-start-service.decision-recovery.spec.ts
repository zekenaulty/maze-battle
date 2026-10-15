import { test, expect, service, serviceProof } from './canonical-start-service.decision.test';
import { initialDecision, claimDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';
import { terminalWindow, loseTerminalReply, pulseError, stopSettledDecision } from './canonical-start-service.decision-recovery.steps';
import { dischargeAfterRootStop } from './canonical-start-service.decision-stop.steps';

test('real fast blocked successor is claimed but never granted or executed', async ({ page, wire }) => {
  const { before, retained } = await initialDecision(page, 'terminal');
  await page.evaluate(() => window.canonicalStartService.decisionReplyAfterOutcome());
  await claimDecision(page);
  const claimed = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(claimed.claim!.data).toMatchObject({ state: 'blocked', stopped: false, settledUsage: { continuations: 1 } });
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision()))).toMatchObject({ status: 'successor-settled', state: 'blocked' });
  expect((await page.evaluate(() => window.canonicalStartService.readDecisionController())).binding).toBeUndefined();
  expect(claimed.selection).toEqual(retained.selection); expect(claimed.actions).toHaveLength(4);
  const counters = await serviceProof();
  expect(counterDelta(counters, before)).toEqual({ created: 2, initial: scriptedWindow, successor: terminalWindow });
  const stopped = await stopSettledDecision(page);
  for (const key of ['data', 'reference', 'source', 'row'] as const) expect(stopped.claim![key]).toEqual(claimed.claim![key]);
  expect(stopped.selection).toEqual(retained.selection);
  expect(await serviceProof()).toEqual(counters); expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
});

test('real lost terminal wake reply replays the retained event and run without another planner', async ({ page, wire }) => {
  const { retained, lost } = await loseTerminalReply(page), counters = await serviceProof();
  await page.evaluate(() => window.canonicalStartService.attachDecisionController());
  expect(await serviceProof()).toEqual(counters);
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('connected');
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('claimed');
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision()))).toMatchObject({ status: 'successor-settled', state: 'blocked' });
  const replayed = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(replayed.intent).toEqual(lost.intent); expect(replayed.wakes).toEqual([retained.intent!.data.event, retained.intent!.data.event]);
  expect(replayed.replies.map(reply => reply.runId)).toEqual([lost.replies[0].runId, lost.replies[0].runId]);
  expect(replayed.claim!.data.started.runId).toBe(lost.replies[0].runId); expect(replayed.claim!.data.state).toBe('blocked');
  expect(replayed.selection).toEqual(lost.selection); expect(replayed.actions).toEqual(lost.actions);
  await stopSettledDecision(page); expect(await serviceProof()).toEqual(counters);
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(2);
  expect(wire.sent.filter(frame => ['resume', 'operation.adopt'].includes(frame.type))).toEqual([]);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
});

test('real service restart refuses wake and discharges navigation only after exact root Stop without a fabricated claim', async ({ page, wire }, info) => {
  const { lost } = await loseTerminalReply(page), beforeRestart = await serviceProof();
  const restarted = await service.restart();
  expect(restarted.processId).not.toBe(beforeRestart.processId); expect(restarted.created).toBe(0);
  await page.evaluate(() => window.canonicalStartService.attachDecisionController());
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('connected');
  expect((await pulseError(page)).code).toBe('operation.wake_interrupted');
  const refused = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(refused.claim).toBeNull(); expect(refused.intent).toEqual(lost.intent); expect(refused.selection).toEqual(lost.selection);
  expect(refused.wakes).toEqual([lost.intent!.data.event, lost.intent!.data.event]); expect(refused.replies).toEqual(lost.replies);
  expect(refused.actions).toEqual(lost.actions); expect(refused.head.checkpoint).toEqual(lost.head.checkpoint);
  expect((await page.evaluate(() => window.canonicalStartService.readDecisionController())).binding).toBeUndefined();
  expect(await page.evaluate(() => window.canonicalStartService.inspectDecisionRoot())).toMatchObject({ status: 'identified' });
  await page.evaluate(() => window.canonicalStartService.cancelDecision());
  const ackError = await page.evaluate(async () => {
    try { await window.canonicalStartService.acknowledgeDecision(); return ''; } catch (error) { return String(error); }
  });
  expect(ackError).toContain('retain the exact successor claim');
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  const stopped = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(stopped.operation!.operation.state).toBe('settled'); expect(stopped.head.allocations[stopped.operation!.operation.id]).toBeDefined();
  expect(stopped.launch!.guard.state).toBe('acknowledged'); expect(stopped.claim).toBeNull();
  expect(stopped.statuses.filter(item => item.state.endsWith('.error'))).toEqual([]);
  const { after } = await dischargeAfterRootStop(page);
  expect(after.claim).toBeNull(); expect(after.selection).toEqual(lost.selection);
  expect(after.actions).toEqual(lost.actions); expect(after.wakes).toEqual(stopped.wakes);
  expect(await serviceProof()).toEqual(restarted);
  expect(wire.received.filter(item => item.frame.type === 'error').map(item => item.frame.payload.code)).toEqual(['operation.wake_interrupted']);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(frame => ['resume', 'operation.adopt'].includes(frame.type))).toEqual([]);
  await info.attach('restart-counter-boundary.json', { body: JSON.stringify({ beforeRestart, restarted, after: await serviceProof() }), contentType: 'application/json' });
});
