import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { initialDecision, claimDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';
import type { HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';

test('real explicit decision wakes one successor navigation and exact Stop settles without extra cognition', async ({ page, wire }) => {
  const { before, original, retained } = await initialDecision(page);
  await claimDecision(page);
  const claimed = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(claimed.claim!.data).toMatchObject({ state: 'waking', stopped: false, settledUsage: null });
  expect(claimed.selection).toEqual(retained.selection);
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('attached');
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.readDecision())).messages
    .some(item => item.window === 'successor' && item.message.type === 'outcome'), { timeout: 15_000 }).toBe(true);
  const executed = await page.evaluate(() => window.canonicalStartService.readDecision());
  const successor = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  expect(executed.actions.map(item => item.action.capabilityId)).toEqual(
    ['maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate', 'maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate']);
  expect(executed.results.map(item => item.result.disposition)).toEqual(Array(8).fill('applied'));
  expect(executed.originals.slice(0, 4)).toEqual(original.originals);
  expect(executed.launch!.grant).toEqual(original.launch!.grant); expect(executed.launch!.run).toEqual(original.launch!.run);
  expect(successor.action!.runId).toBe(claimed.claim!.data.started.runId);
  expect(successor.action!.runId).not.toBe(original.started.runId);
  expect(successor.action!.sessionEpoch).toBe(original.started.sessionEpoch);
  expect(successor.binding!.grant).toEqual(executed.selection!.value.data.grant);
  expect(successor.binding!.grant).not.toEqual(original.binding.grant);
  expect(executed.wakes).toEqual([retained.intent!.data.event]);
  expect(wire.sent.filter(frame => frame.type === 'operation.adopt')).toEqual([]);
  expect(counterDelta(await serviceProof(), before)).toEqual({ created: 2, initial: scriptedWindow, successor: scriptedWindow });
  const counters = await serviceProof();
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toMatchObject({ status: 'navigation-acknowledged' });
  const handed = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(handed.operation!.operation.state).toBe('acknowledged');
  expect(handed.head.allocations[handed.operation!.operation.id]).toBeUndefined();
  expect(handed.launch!.guard.state).toBe('admitted');
  expect(handed.head.allocations[handed.launch!.guard.id]).toBeDefined();
  for (const status of ['confirmed', 'custody-confirmed', 'advanced'])
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecisionSuccessor())).status).toBe(status);
  const moved = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  expect(moved.operation!.progress).toMatchObject({ steps: 1, status: 'arrived' });
  expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toMatchObject({ status: 'locally-stopped' });
  await page.evaluate(() => window.canonicalStartService.cancelDecisionSuccessor());
  for (let pulse = 0; pulse < 3; pulse++) {
    const result = await page.evaluate(() => window.canonicalStartService.pulseDecisionSuccessor());
    if (result.status === 'terminal-acknowledged') break;
    expect(result.status).toBe('terminal-prefix-delivered');
  }
  expect((await page.evaluate(() => window.canonicalStartService.readDecisionController())).operation!.operation.state).toBe('acknowledged');
  await expect.poll(() => page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  const settled = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(settled.launch!.guard.state).toBe('acknowledged');
  expect(settled.head.allocations[settled.launch!.guard.id]).toBeUndefined();
  expect(settled.originals.slice(0, 4)).toEqual(original.originals);
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toMatchObject({ status: 'navigation-acknowledged' });
  expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
  const retried = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(retried.head.revision).toBe(settled.head.revision); expect(retried.head.quota).toEqual(settled.head.quota);
  expect(retried.terminal).toEqual(settled.terminal); expect(retried.launch!.guard).toEqual(settled.launch!.guard);
  expect(retried.statuses.filter(item => item.state.endsWith('.error'))).toEqual([]);
  const remote = await page.evaluate(() => window.canonicalStartService.remoteDecision());
  const parent = remote.find(entry => entry.action.actionId === original.actions[3].action.actionId)!;
  expect(parent.wakeRunId).toBe(successor.action!.runId);
  expect(parent.action).toEqual(original.actions[3].action);
  expect(parent.request).toEqual(original.operation!.confirmation.data.entry.request);
  expect(parent.admission).toEqual(original.operation!.confirmation.data.entry.admission);
  expect(remote.find(entry => entry.action.actionId === successor.action!.actionId)!.state).toBe('cancelled');
  expect(await serviceProof()).toEqual(counters);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(1);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
  const stop = wire.http.filter(request => request.url.endsWith('/api/starts/stop'));
  expect(stop).toHaveLength(1);
  expect(stop[0].body).toMatchObject({ runId: original.started.runId, attemptId: original.launch!.dispatch!.source.attemptId,
    acceptedRequestHash: original.launch!.run!.value.data.admission.acceptedRequestHash });
  const terminal = wire.http.filter(request => request.method === 'POST' && request.url.endsWith('/api/operations/events'))
    .map(request => request.body as HostOperationEvent).filter(event => event.kind === 'cancelled');
  expect(terminal).toHaveLength(1); expect(terminal[0].actionId).toBe(successor.action!.actionId);
});
