import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { completeInitialDecision, counterDelta, scriptedWindow } from './canonical-start-service.decision.steps';
import { reloadDecision, settleAdoptedNavigation } from './canonical-start-service.decision-adoption.steps';

test('full browser reload before intention explicitly adopts the real decision, grants after guard adoption, and moves once', async ({ page, wire }) => {
  const { before, original } = await completeInitialDecision(page);
  expect(original.intent).toBeNull();
  const initialCounters = await serviceProof(), reference = original.originals[3]!.reference;
  const reconstructed = await reloadDecision(page, reference);
  expect(reconstructed.head.owner).not.toBe(original.head.owner);
  expect(reconstructed.head.epoch).toBeGreaterThan(original.head.epoch);
  expect(reconstructed.head.checkpoint).toEqual(original.head.checkpoint);
  expect(reconstructed.originals).toEqual([original.originals[3]]);
  expect(reconstructed.binding).toEqual(original.binding); expect(reconstructed.started).toEqual(original.started);
  expect(reconstructed.operation).toEqual(original.operation); expect(reconstructed.terminal).toEqual(original.terminal);
  expect(reconstructed.launch).toEqual(original.launch); expect(reconstructed.selection).toEqual(original.selection);
  expect(reconstructed.intent).toBeNull(); expect(reconstructed.grant).toBeNull();
  expect(reconstructed.actions).toEqual([]); expect(reconstructed.messages).toEqual([]);
  expect(await serviceProof()).toEqual(initialCounters);

  const prepared = await page.evaluate(() => window.canonicalStartService.prepareDecision());
  const retained = await page.evaluate(() => window.canonicalStartService.readDecision()), intent = retained.intent!;
  expect(intent.data.publication).toEqual(prepared.publication);
  expect(intent.publication).toMatchObject({ owner: reconstructed.head.owner, epoch: reconstructed.head.epoch,
    snapshot: { checkpoint: original.head.checkpoint } });
  expect(intent.data.event).toEqual(original.terminal!.event);
  expect(intent.data.adoption).toMatchObject({ adoptionId: intent.source.attemptId, nextSessionEpoch: String(reconstructed.head.epoch),
    observation: { observationId: `decision-${intent.source.attemptId}`, revision: intent.publication.wireRevision,
      data: { source: intent.publication.observation } } });
  expect(retained.wakes).toEqual([]); expect(retained.adoptions).toEqual([]);
  expect(retained.claim).toBeNull(); expect(retained.grant).toBeNull();
  expect(await serviceProof()).toEqual(initialCounters);
  for (const status of ['connected', 'prefix-delivered']) {
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe(status);
    expect(await serviceProof()).toEqual(initialCounters);
  }
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('claimed');
  const claimed = await page.evaluate(() => window.canonicalStartService.readDecision());
  expect(claimed.adoptions).toEqual([{ event: intent.data.event, adoption: intent.data.adoption }]);
  expect(claimed.replies).toEqual([claimed.claim!.data.started]);
  expect(claimed.claim!.data).toMatchObject({ state: 'waking', started: { sessionEpoch: String(reconstructed.head.epoch) } });
  expect(claimed.grant).toBeNull(); expect(claimed.selection).toEqual(original.selection);
  expect(claimed.results).toEqual([]); expect(claimed.launch!.guard).toEqual(original.launch!.guard);
  expect(claimed.operation).toEqual(original.operation);
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('guard-adopted');
  const adopted = await page.evaluate(() => window.canonicalStartService.readDecision());
  const receipt = await page.evaluate(() => window.canonicalStartService.readDecisionGuardAdoption());
  expect(receipt.source).toMatchObject({ operation: 'operation.adopt', attemptId: `${intent.reference.id}:guard`,
    input: { operationId: original.launch!.guard.id }, expected: { owner: reconstructed.head.owner, epoch: reconstructed.head.epoch } });
  expect(receipt.receipt.beforeRevision).toBeGreaterThanOrEqual(claimed.claim!.row.revision);
  expect(adopted.launch!.guard).toMatchObject({ owner: reconstructed.head.owner, epoch: reconstructed.head.epoch,
    revision: receipt.receipt.afterRevision });
  expect(adopted.grant).toBeNull(); expect(adopted.selection).toEqual(original.selection);
  expect(adopted.operation).toEqual(original.operation); expect(adopted.results).toEqual([]);
  expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe('attached');
  await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.readDecision())).messages
    .some(item => item.message.type === 'outcome'), { timeout: 15_000 }).toBe(true);
  const executed = await page.evaluate(() => window.canonicalStartService.readDecision());
  const child = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  expect(executed.grant!.record.value.data).toMatchObject({ intent: intent.reference, guardIntent: intent.reference,
    guardAdoption: receipt.source.attemptId, guardRevision: receipt.receipt.afterRevision });
  expect(executed.selection!.value.data).toMatchObject({ grant: executed.grant!.record.ref, publication: intent.data.publication });
  expect(executed.grant!.record.row.revision).toBeGreaterThan(receipt.receipt.afterRevision);
  expect(executed.actions.map(item => item.action.capabilityId)).toEqual(['maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate']);
  expect(executed.results.map(item => item.result.disposition)).toEqual(Array(4).fill('applied'));
  expect(child.action).toMatchObject({ runId: claimed.claim!.data.started.runId, sessionEpoch: String(reconstructed.head.epoch) });
  expect(child.binding!.grant).toEqual(executed.grant!.record.ref);
  expect(executed.originals[0]).toEqual(original.originals[3]);
  expect(executed.launch!.grant).toEqual(original.launch!.grant); expect(executed.launch!.run).toEqual(original.launch!.run);
  expect(executed.operation!.confirmation).toEqual(original.operation!.confirmation);
  expect(executed.terminal!.event).toEqual(original.terminal!.event);
  const counters = await serviceProof();
  expect(counterDelta(counters, before)).toEqual({ created: 2, initial: scriptedWindow, successor: scriptedWindow });
  expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toMatchObject({ status: 'navigation-acknowledged' });
  for (const status of ['confirmed', 'custody-confirmed', 'advanced'])
    expect((await page.evaluate(() => window.canonicalStartService.pulseDecisionSuccessor())).status).toBe(status);
  const moved = await page.evaluate(() => window.canonicalStartService.readDecisionController());
  expect(moved.operation!.progress).toMatchObject({ steps: 1, status: 'arrived' });
  expect((await page.evaluate(() => window.canonicalStartService.readDecision())).head.checkpoint.position)
    .not.toEqual(original.head.checkpoint.position);
  await settleAdoptedNavigation(page);
  expect(await serviceProof()).toEqual(counters);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toEqual([]);
  expect(wire.sent.filter(frame => frame.type === 'operation.adopt').map(frame => frame.payload))
    .toEqual([{ decision: intent.data.event, adoption: intent.data.adoption }]);
  expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
});
