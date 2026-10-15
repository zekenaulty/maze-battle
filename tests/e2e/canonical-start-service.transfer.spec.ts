import { test, expect, serviceProof, serviceOrigin } from './canonical-start-service.transfer.test';
import type { HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';

test('real service explicit unfinished-navigation takeover binds both receipts, moves, and settles without another planner call', async ({ page, wire }, info) => {
  const beforeStart = await serviceProof();
  await page.evaluate(() => window.canonicalStartService.startScript());
  await expect.poll(async () => {
    const script = await page.evaluate(() => window.canonicalStartService.readScript());
    const error = script.messages.find(m => m.type === 'error');
    return error ? error.payload : script.messages.some(m => m.type === 'operation.parked') ? 'parked' : 'pending';
  }, { timeout: 15_000 }).toBe('parked');
  await expect.poll(() => wire.received.some(r => r.frame.type === 'outcome'), { timeout: 15_000 }).toBe(true);
  const script = await page.evaluate(() => window.canonicalStartService.readScript());
  await info.attach('original-service-script.json', { body: JSON.stringify(script, null, 2), contentType: 'application/json' });
  expect(wire.received.filter(r => r.bytes > 64 * 1024), 'Requires compact real-service outcome, no exemption').toEqual([]);
  expect(script.statuses.filter(s => s.state.endsWith('.error'))).toEqual([]);
  expect(script.actions.map(a => a.capabilityId)).toEqual(['maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate']);
  expect(script.results.map(r => r.disposition)).toEqual(['applied', 'applied', 'applied', 'applied']);
  expect((await page.evaluate(() => window.canonicalStartService.pulseScript())).result.status).toBe('confirmed');
  const custody = await page.evaluate(() => window.canonicalStartService.pulseScript());
  expect(custody.result.status).toBe('custody-confirmed'); expect(custody.state!.progress).toMatchObject({ status: 'running', sequence: 0, steps: 0 });
  const original = await page.evaluate(() => window.canonicalStartService.snapshot());
  const action = script.actions[3], binding = { grant: original.launch!.grant!.ref, publication: original.launch!.binding.publication };
  const baseline = await serviceProof();
  expect(baseline.created - beforeStart.created).toBe(1); expect(baseline.scriptedCreated - beforeStart.scriptedCreated).toBe(1);
  expect(baseline.scriptedCreateCalls - beforeStart.scriptedCreateCalls).toBe(1);
  expect(baseline.scriptedRefineCalls - beforeStart.scriptedRefineCalls).toBe(3);
  expect(baseline.scriptedStepsPlanned - beforeStart.scriptedStepsPlanned).toBe(4); expect(baseline.paidProviderCalls).toBe(0);
  await page.evaluate(() => window.canonicalStartService.stop());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalStartService);
  await page.evaluate(() => window.canonicalStartService.boot());
  await page.evaluate(input => window.canonicalStartService.attachTransfer(input.action, input.binding), { action, binding });
  const owned = await page.evaluate(() => window.canonicalStartService.readTransfer());
  expect(owned.head.epoch).toBeGreaterThan(original.head.epoch); expect(owned.head.owner).not.toBe(original.head.owner);
  expect(owned.head.checkpoint).toEqual(original.head.checkpoint);
  expect(owned.value!.operation.owner).toBe(original.head.owner); expect(owned.launch.guard.owner).toBe(original.head.owner);
  const prepared = await page.evaluate(() => window.canonicalStartService.prepareTransfer());
  const retained = (await page.evaluate(() => window.canonicalStartService.readTransfer())).records.intent!;
  expect(retained.data.publication).toEqual(prepared.publication);
  expect(retained.publication).toMatchObject({ owner: owned.head.owner, epoch: owned.head.epoch, snapshot: { checkpoint: original.head.checkpoint } });
  expect(retained.data.event).toMatchObject({ kind: 'transfer', sequence: 2, sessionEpoch: action.sessionEpoch, nextSessionEpoch: String(owned.head.epoch),
    observation: { observationId: `transfer-${retained.source.attemptId}`, revision: retained.publication.wireRevision, data: { source: retained.publication.observation } } });
  for (const expected of ['transfer-acknowledged', 'kernel-adopted', 'kernel-adopted', 'navigation-authorized']) {
    const prior = await page.evaluate(() => window.canonicalStartService.readTransfer());
    expect(prior.records.authority).toBeFalsy(); expect(prior.value!.progress.steps).toBe(0);
    expect((await page.evaluate(() => window.canonicalStartService.pulseTransfer())).status).toBe(expected);
    expect(await serviceProof()).toEqual(baseline);
  }
  const authorized = await page.evaluate(() => window.canonicalStartService.readTransfer());
  const { guard, navigation } = authorized.records.adoptions!;
  for (const [kind, adopted, operationId] of [['guard', guard, authorized.launch.guard.id], ['navigation', navigation, authorized.value!.operation.id]] as const) {
    expect(adopted.source).toMatchObject({ attemptId: `${retained.reference.id}:${kind}`, operation: 'operation.adopt', input: { operationId },
      expected: { gameId: owned.head.gameId, generation: owned.head.generation, owner: owned.head.owner, epoch: owned.head.epoch } });
    expect(adopted.receipt.beforeRevision).toBeGreaterThanOrEqual(authorized.records.ack!.row.revision);
  }
  expect(navigation.receipt.beforeRevision).toBeGreaterThanOrEqual(guard.receipt.afterRevision);
  expect(authorized.records.authority!.data).toMatchObject({ guardAdoption: guard.source.attemptId, navigationAdoption: navigation.source.attemptId,
    guardRevision: guard.receipt.afterRevision, operationRevision: navigation.receipt.afterRevision });
  expect(authorized.records.original).toEqual(script.originals[3]);
  expect(authorized.value!.confirmation).toEqual(custody.state!.confirmation);
  expect(authorized.launch.grant).toEqual(original.launch!.grant); expect(authorized.launch.run).toEqual(original.launch!.run);
  const remote = await page.evaluate(() => window.canonicalStartService.remoteTransfer());
  expect(remote.action).toEqual(action); expect(remote.activeEpoch).toBe(String(owned.head.epoch)); expect(remote.state).toBe('parked');
  expect(remote.request).toEqual(custody.state!.confirmation.data.entry.request);
  expect(remote.admission).toEqual(custody.state!.confirmation.data.entry.admission);
  expect(remote.latestEvent).toMatchObject({ eventId: retained.data.event.eventId, kind: 'transfer', sequence: 2 });
  expect(await page.evaluate(() => window.canonicalStartService.advanceTransfer())).toMatchObject({ status: 'advanced', sequence: 1 });
  const moved = await page.evaluate(() => window.canonicalStartService.readTransfer());
  expect(moved.value!.progress).toMatchObject({ steps: 1, sequence: 1, status: 'arrived' });
  expect(moved.value!.event!.data.event).toMatchObject({ kind: 'progress', sequence: 3, sessionEpoch: String(owned.head.epoch) });
  expect(moved.head.checkpoint.position).not.toEqual(original.head.checkpoint.position);
  expect(moved.head.checkpoint.position).toEqual({ level: action.arguments.level,
    cell: { spaceId: action.arguments.spaceId, row: action.arguments.row, column: action.arguments.column } });
  expect(await serviceProof()).toEqual(baseline);
  await page.evaluate(() => window.canonicalStartService.cancelTransfer());
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.advanceTransfer())).status).toBe('terminal-acknowledged');
  const settled = await page.evaluate(() => window.canonicalStartService.readTransfer());
  expect(settled.value!.operation.state).toBe('acknowledged'); expect(settled.head.allocations[settled.value!.operation.id]).toBeUndefined();
  const terminal = await page.evaluate(() => window.canonicalStartService.remoteTransfer());
  expect(terminal).toMatchObject({ state: 'cancelled', activeEpoch: String(owned.head.epoch), latestEvent: { kind: 'cancelled', sequence: 4 } });
  expect(terminal.action).toEqual(remote.action); expect(terminal.request).toEqual(remote.request); expect(terminal.admission).toEqual(remote.admission);
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.stopTransferStart())).settled).toBe(true);
  expect((await page.evaluate(() => window.canonicalStartService.readTransfer())).launch.guard.state).toBe('acknowledged');
  expect(await serviceProof()).toEqual(baseline);
  expect(wire.sent.filter(m => m.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(m => m.type === 'action.result')).toHaveLength(5);
  expect(wire.received.filter(m => ['action.request', 'action.reconcile'].includes(m.frame.type))).toHaveLength(4);
  const events = wire.http.filter(r => r.method === 'POST' && r.url === serviceOrigin + '/api/operations/events').map(r => r.body as HostOperationEvent);
  expect(events.map(e => e.kind)).toEqual(['progress', 'transfer', 'progress', 'cancelled']);
  expect(events[1]).toEqual(retained.data.event);
  await info.attach('planner-counter-boundary.json', { body: JSON.stringify({ beforeStart, baseline, after: await serviceProof() }, null, 2), contentType: 'application/json' });
});
