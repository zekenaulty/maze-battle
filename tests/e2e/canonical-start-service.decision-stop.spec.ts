import { test, expect, service, serviceProof } from './canonical-start-service.decision.test';
import { initialDecision, claimDecision, counterDelta, scriptedWindow, absentWindow } from './canonical-start-service.decision.steps';
import { loseTerminalReply } from './canonical-start-service.decision-recovery.steps';
import { refuseBeforeRootAck, fundedQuota, dischargeAfterRootStop } from './canonical-start-service.decision-stop.steps';
import { equivalentOperationWire } from '../../src/persistence/canonical/agentica/operation.wire';

test('real lost wake claim survives service restart and discharges only navigation after exact root Stop', async ({ page, wire }, info) => {
  const { original, lost } = await loseTerminalReply(page), beforeRestart = await serviceProof();
  const counters = await service.restart();
  expect(counters.processId).not.toBe(beforeRestart.processId); expect(counters.created).toBe(0);
  expect(counters.decision).toEqual({ created: 0, initial: absentWindow, successor: absentWindow });
  await fundedQuota(page);
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
  await refuseBeforeRootAck(page);
  const unresolved = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(unresolved.operation!.operation.state).toBe('settled'); expect(unresolved.claim).toBeNull();
  expect(unresolved.head.allocations[unresolved.operation!.operation.id]).toBeDefined();
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  const { after } = await dischargeAfterRootStop(page, true);
  expect(after.claim).toBeNull();
  for (const key of ['data', 'reference', 'source', 'row'] as const) expect(after.intent![key]).toEqual(lost.intent![key]);
  expect(after.selection).toEqual(lost.selection); expect(after.actions).toEqual(lost.actions);
  expect(after.replies).toEqual(lost.replies); expect(after.wakes).toEqual(lost.wakes);
  expect(after.launch!.run).toEqual(original.launch!.run); expect(after.launch!.grant).toEqual(original.launch!.grant);
  expect(after.statuses.filter(item => item.state.endsWith('.error'))).toEqual([]);
  expect(await serviceProof()).toEqual(counters);
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(1);
  expect(wire.sent.filter(frame => ['resume', 'operation.adopt'].includes(frame.type))).toEqual([]);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
  const stops = wire.http.filter(request => request.url.endsWith('/api/starts/stop'));
  expect(stops).toHaveLength(1);
  expect(stops[0].body).toMatchObject({ runId: original.started.runId, attemptId: original.launch!.dispatch!.source.attemptId,
    acceptedRequestHash: original.launch!.run!.value.data.admission.acceptedRequestHash });
  await info.attach('lost-claim-restart-counters.json', {
    body: JSON.stringify({ beforeRestart, restarted: counters, after: await serviceProof() }), contentType: 'application/json',
  });
});

test('real admitted child is recovered before root Stop discharges its unacknowledged predecessor', async ({ page, wire }) => {
  const { before, original } = await initialDecision(page);
  await claimDecision(page);
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('attached');
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.readDecision())).messages
    .some(item => item.window === 'successor' && item.message.type === 'outcome'), { timeout: 15_000 }).toBe(true);
  const admitted = await page.evaluate(() => window.canonicalStartService.readDecision());
  const child = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  expect(child.action!.runId).toBe(admitted.claim!.data.started.runId);
  expect(child.operation).toBeNull(); expect(child.terminal).toBeNull();
  expect(admitted.operation!.operation.state).toBe('settled');
  expect(admitted.results.map(item => item.result.disposition)).toEqual(Array(8).fill('applied'));
  const remote = await page.evaluate(() => window.canonicalStartService.remoteDecision());
  const parent = remote.find(entry => entry.action.actionId === original.actions[3].action.actionId)!;
  const successor = remote.find(entry => entry.action.actionId === child.action!.actionId)!;
  expect(parent.state).toBe('continued'); expect(parent.wakeRunId).toBe(child.action!.runId);
  expect(equivalentOperationWire(parent.latestEvent, admitted.intent!.data.event, 'event')).toBe(true);
  expect(parent.stopDecision).toBeUndefined();
  expect(successor.state).toBe('parked'); expect(successor.admission!.operation).toBeDefined();
  expect(counterDelta(await serviceProof(), before)).toEqual({ created: 2, initial: scriptedWindow, successor: scriptedWindow });
  const counters = await serviceProof();
  await fundedQuota(page);
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
  await refuseBeforeRootAck(page);
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
  const pending = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(pending.launch!.guard.state).toBe('settled'); expect(pending.operation!.operation.state).toBe('settled');
  await refuseBeforeRootAck(page);
  await page.evaluate(() => window.canonicalStartService.cancelDecisionSuccessor());
  expect(await page.evaluate(() => window.canonicalStartService.pulseDecisionSuccessor())).toMatchObject({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  const childStopped = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  if (childStopped.terminal?.bound.kind !== 'navigation') throw Error('Expected stopped navigation');
  expect(childStopped.terminal!.bound.operation.state).toBe('acknowledged');
  expect(childStopped.terminal!.bound.progress.steps).toBe(0);
  await refuseBeforeRootAck(page);
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  const { after } = await dischargeAfterRootStop(page, true);
  expect(after.claim!.data).toEqual(admitted.claim!.data); expect(after.intent!.data).toEqual(admitted.intent!.data);
  expect(after.head.checkpoint).toEqual(admitted.head.checkpoint); expect(after.originals).toEqual(admitted.originals);
  const settled = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  // Recreated controller has no successor attachment; historical reads above still validate the original ACK.
  expect(settled.binding).toBeUndefined();
  const finalRemote = await page.evaluate(() => window.canonicalStartService.remoteDecision());
  expect(finalRemote.find(entry => entry.action.actionId === parent.action.actionId)).toEqual(parent);
  expect(finalRemote.find(entry => entry.action.actionId === successor.action.actionId)).toMatchObject({
    action: successor.action, admission: successor.admission, request: successor.request, state: 'cancelled',
  });
  expect(await serviceProof()).toEqual(counters);
  expect(wire.http.filter(request => request.url.endsWith('/api/operations/stop-decision'))).toEqual([]);
  const stops = wire.http.filter(request => request.url.endsWith('/api/starts/stop'));
  expect(stops).toHaveLength(2); expect(stops[0].body).toEqual(stops[1].body);
  expect(stops[0].body).toMatchObject({ runId: original.started.runId, attemptId: original.launch!.dispatch!.source.attemptId,
    acceptedRequestHash: original.launch!.run!.value.data.admission.acceptedRequestHash });
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(1);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
});
