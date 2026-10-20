import type { Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { expect, serviceProof, type DecisionWire } from './canonical-start-service.decision.test';

/** Transfer uses the real App session and HTTP driver, never a replacement start or planner. */
export async function transferHistory(page: Page, wire: DecisionWire) {
  await page.waitForFunction(() => Reflect.get(globalThis, '__canonicalHistoryTransferPaused') === true);
  const before = await page.evaluate(() => window.canonicalStartService.snapshot()), counters = await serviceProof();
  const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
  expect(actions.map(action => action.capabilityId)).toEqual(['maze.inspect', 'maze.explore']);
  const action = actions[1], binding = { grant: before.launch!.grant!.ref, publication: before.launch!.binding.publication };
  // Remove only the scheduling barrier before constructing the new document's real driver.
  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('historyTransferProof'); history.replaceState(null, '', url); });
  await page.reload(); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async ({ action, binding }) => {
    // @ts-expect-error Attach to the actual hook-owned session after reload.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
    await window.canonicalStartService.attachTransfer(action, binding);
  }, { action, binding });
  const owned = await page.evaluate(() => window.canonicalStartService.readTransfer());
  expect(owned.head.owner).not.toBe(before.head.owner); expect(owned.head.epoch).toBeGreaterThan(before.head.epoch);
  expect(owned.head.checkpoint).toEqual(before.head.checkpoint);
  expect(owned.value!.progress).toMatchObject({ steps: 0, status: 'running' });
  expect(owned.value!.custodyAck).toBeTruthy();
  expect(owned.value!.operation.owner).toBe(before.head.owner);
  expect(owned.records.intent).toBeNull(); expect(await serviceProof()).toEqual(counters);
  const prepared = await page.evaluate(() => window.canonicalStartService.prepareTransfer());
  for (const status of ['transfer-acknowledged', 'kernel-adopted', 'kernel-adopted', 'navigation-authorized']) {
    const prior = await page.evaluate(() => window.canonicalStartService.readTransfer());
    if (prior.value?.kind !== 'navigation') throw Error('Expected transferable room navigation.');
    expect(prior.records.authority).toBeFalsy(); expect(prior.value!.progress.steps).toBe(0);
    expect((await page.evaluate(() => window.canonicalStartService.pulseTransfer())).status).toBe(status);
    expect(await serviceProof()).toEqual(counters);
  }
  const authorized = await page.evaluate(() => window.canonicalStartService.readTransfer());
  const { intent, ack, authority, adoptions } = authorized.records;
  expect(intent!.data.publication).toEqual(prepared.publication);
  expect(intent!.data.event).toMatchObject({ kind: 'transfer', sessionEpoch: action.sessionEpoch, nextSessionEpoch: String(owned.head.epoch) });
  expect(authority!.data).toMatchObject({ guardAdoption: adoptions!.guard.source.attemptId,
    navigationAdoption: adoptions!.navigation.source.attemptId, guardRevision: adoptions!.guard.receipt.afterRevision,
    operationRevision: adoptions!.navigation.receipt.afterRevision });
  for (const [kind, receipt, id] of [['guard', adoptions!.guard, authorized.launch.guard.id],
    ['navigation', adoptions!.navigation, authorized.value!.operation.id]] as const) {
    expect(receipt.source).toMatchObject({ operation: 'operation.adopt', attemptId: `${intent!.reference.id}:${kind}`,
      input: { operationId: id }, expected: { owner: owned.head.owner, epoch: owned.head.epoch } });
    expect(receipt.receipt.beforeRevision).toBeGreaterThanOrEqual(ack!.row.revision);
  }
  expect(adoptions!.navigation.receipt.beforeRevision).toBeGreaterThanOrEqual(adoptions!.guard.receipt.afterRevision);
  expect(authorized.value!.confirmation).toEqual(owned.value!.confirmation);
  expect(authorized.launch.grant).toEqual(before.launch!.grant);
  const remote = await page.evaluate(() => window.canonicalStartService.remoteTransfer());
  expect(remote).toMatchObject({ action, activeEpoch: String(owned.head.epoch), state: 'parked' });
  // Only the typed HTTP envelope normalizes DateTimeOffset; preserve raw evidence below.
  const remoteEvent = structuredClone(remote.latestEvent!);
  remoteEvent.observation.observedAt = new Date(remoteEvent.observation.observedAt).toISOString();
  expect(remoteEvent).toStrictEqual({ ...intent!.data.event, completion: null,
    observation: { ...intent!.data.event.observation, facts: null } });
  const pulses = [];
  for (let i = 0; i < 10; i++) {
    const result = await page.evaluate(() => window.canonicalStartService.advanceTransfer());
    pulses.push(result); if (result.status === 'locally-settled') break;
  }
  expect(pulses.map(pulse => pulse.status)).toEqual(['advanced', 'acknowledged', 'advanced', 'acknowledged',
    'advanced', 'acknowledged', 'advanced', 'locally-settled']);
  const settled = await page.evaluate(() => window.canonicalStartService.readTransfer());
  expect(settled.value!.operation.state).toBe('settled');
  expect(settled.value!.progress).toMatchObject({ status: 'decision', steps: 4, notice: { kind: 'other-space-visible' } });
  expect(settled.value!.event!.data.event).toMatchObject({ kind: 'progress', sessionEpoch: String(owned.head.epoch) });
  expect(settled.value!.event!.reference).not.toEqual(intent!.reference);
  expect(await serviceProof()).toEqual(counters);
  expect(wire.sent.filter(frame => ['operation.wake', 'operation.adopt'].includes(frame.type))).toEqual([]);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  return { before, owned, authorized, remote, pulses, settled };
}
