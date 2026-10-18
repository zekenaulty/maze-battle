import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { counterDelta, absentWindow } from './canonical-start-service.decision.steps';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { Page } from '@playwright/test';
import { ACKNOWLEDGEMENT_BYTES } from '../../src/persistence/canonical/types';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { parseFrontier } from '../../src/services/agentica/game/frontierSelection';
import type { CellAddress } from '../../src/services/agentica/game/types';
import type { CellSource } from '../../src/persistence/canonical/knowledge/types';

const roomWindow = { instances: 1, createCalls: 1, refineCalls: 1, stepsPlanned: 2, emptyPlans: 0 };
async function pack(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Read-only native inspection, never delivered to the offline planner.
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    // @ts-expect-error Native Vite module path.
    const { required, containerHeader, containerItems } = await import('/src/persistence/canonical/roster/records.ts');
    return (await readCanonical(async (pages: Parameters<typeof required>[0]) => {
      const header = containerHeader(await required(pages, 'pack'), 'pack');
      return { header, items: await containerItems(pages, 'pack', header) };
    })).value;
  });
}
async function evidence(page: Page, action: AgenticaAction) {
  return page.evaluate(async original => {
    // @ts-expect-error Exact original custody and receipts, not a new game or transport.
    const { appNavigationEvidence } = await import('/tests/e2e/canonical-start-service.app-evidence.ts');
    // @ts-expect-error Native Vite module path.
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    // @ts-expect-error Knowledge-only source validation, never authoritative world geometry.
    const { sourceReader, loadObservation } = await import('/src/persistence/canonical/knowledge/evidence.ts');
    const retained = await appNavigationEvidence(original), notice = retained.parent.progress.notice;
    if (!notice) throw Error('Expected a retained material notice, not mere arrival or scope exhaustion.');
    const observed = (await readCanonical(async (pages: Parameters<typeof sourceReader>[0]) => {
      const source = sourceReader(pages), current = await loadObservation(pages, { sequence: notice.source.sequence, id: notice.source.id });
      return { header: current.header, cell: await source(notice.source),
        previous: notice.previousSource ? await source(notice.previousSource) : null };
    })).value;
    return { retained, observed };
  }, action);
}

test('actual App explicitly explores one earned room until a source-bound material decision without per-cell planning or loot', async ({ page, wire }, info) => {
  await page.goto('/?roomProof=1'); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Attach the test reader to the actual hook-owned session only.
    await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
  });
  const before = await page.evaluate(() => window.canonicalStartService.snapshot()), initialPack = await pack(page), baseline = await serviceProof();
  expect(before.launch).toBeNull(); expect(wire.sent).toEqual([]);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog).toContainText('decision-room');
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Explore the selected earned room until something meaningful changes. Do not collect.');
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  await expect.poll(() => wire.sent.filter(frame => frame.type === 'action.result').length).toBe(2);
  const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload);
  expect(actions.map(action => action.capabilityId)).toEqual(['maze.inspect', 'maze.explore']);
  expect(actions[0].arguments).toEqual({ scope: 'frontiers' });
  const query = wire.sent.find(frame => frame.type === 'action.result' && frame.payload.actionId === actions[0].actionId)!.payload;
  expect(query.disposition).toBe('applied');
  expect(query.observation.data.scope).toBe('frontiers'); expect(query.observation.data.frontiers.length).toBeGreaterThan(0);
  const admission = await page.evaluate(() => window.canonicalStartService.snapshot());
  const actor = admission.launch!.binding.start.observation.data.actor as CellAddress;
  const candidates = query.observation.data.frontiers as { at: CellAddress; source: CellSource; frontier: string }[];
  const selected = candidates.find(candidate => candidate.at.level === actor.level && candidate.at.spaceId === actor.spaceId);
  expect(selected, 'The room fixture must offer a current-space token in its bounded public page').toBeDefined();
  expect(candidates[0].at.spaceId).not.toBe(actor.spaceId);
  expect(actions[1].arguments).toEqual({ frontier: selected!.frontier, mode: 'room' });
  const selection = parseFrontier(selected!.frontier, admission.launch!.binding.publication);
  expect(selection.at.cell.spaceId).toBe(gameCheckpoint(before.head.checkpoint).position.cell.spaceId);
  expect(selected!.source).toEqual(selection.source);
  const result = wire.sent.find(frame => frame.type === 'action.result' && frame.payload.actionId === actions[1].actionId)!.payload;
  expect(result, 'Room selection must be admitted, not refined after an explicit refusal')
    .toMatchObject({ disposition: 'applied', operation: { operationId: expect.any(String) } });
  const travelCounters = await serviceProof();
  expect(counterDelta(travelCounters, baseline)).toEqual({ created: 1, initial: roomWindow, successor: absentWindow });
  expect(travelCounters.paidProviderCalls).toBe(0);
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  const after = await page.evaluate(() => window.canonicalStartService.snapshot());
  const proof = await evidence(page, actions[1] as AgenticaAction), p = proof.retained.parent.progress;
  expect(p.binding).toMatchObject({ kind: 'frontier-exploration', frontier: selection, target: selection.at });
  expect(p).toMatchObject({ status: 'decision', reason: 'scope-boundary', steps: 4,
    notice: { kind: 'other-space-visible', previousSource: null } });
  expect(p.sequence).toBe(p.steps); expect(p.position).not.toEqual(selection.at);
  expect(p.position).toEqual(after.head.checkpoint.position); expect(p.position.cell.spaceId).toBe(selection.at.cell.spaceId);
  const current = gameCheckpoint(after.head.checkpoint).knowledge!, previous = gameCheckpoint(before.head.checkpoint).knowledge!;
  expect(current.sequence - previous.sequence).toBe(p.steps);
  expect(p.notice.source).toMatchObject({ sequence: current.sequence, id: current.id, index: expect.any(Number) });
  expect(proof.observed.header.actor).toEqual(p.position); expect(proof.observed.cell.at).toEqual(p.notice.at);
  const reasons: Record<string, string> = { 'unopened-chest': 'new-object', 'stairs-discovered': 'new-object',
    'chest-changed': 'changed-evidence', 'traversability-changed': 'changed-evidence',
    'space-entered': 'scope-boundary', 'other-space-visible': 'scope-boundary' };
  expect(reasons[p.notice.kind]).toBe(p.reason);
  if (p.notice.kind === 'unopened-chest') expect(proof.observed.cell.chests.some((chest: { id: string; opened: boolean }) =>
    !chest.opened && !proof.observed.previous?.chests.some((prior: { id: string }) => prior.id === chest.id))).toBe(true);
  if (p.notice.kind === 'stairs-discovered') expect(proof.observed.cell.stairs.some((stair: string) =>
    !proof.observed.previous?.stairs.includes(stair))).toBe(true);
  const terminal = proof.retained.parentTerminal.event;
  expect(terminal).toMatchObject({ kind: 'decision', actionId: actions[1].actionId,
    operationId: proof.retained.parent.operation.id, usage: { steps: p.steps, replans: p.replans } });
  expect(terminal.observation).toEqual(proof.retained.parent.event.data.event.observation);
  expect(terminal.observation.data.navigation).toEqual({ sequence: p.sequence, steps: p.steps, status: 'decision', reason: p.reason, notice: p.notice });
  expect(terminal.summary).toContain('not proof of room or objective completion');
  expect(after.head.roots.world).toEqual(before.head.roots.world); expect(await pack(page)).toEqual(initialPack);
  for (const key of ['gameId', 'generation', 'owner', 'epoch'] as const) expect(after.head[key]).toBe(before.head[key]);
  expect(await serviceProof()).toEqual(travelCounters);
  await page.screenshot({ path: info.outputPath('agentic-room-decision-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('agentic-room-decision-mobile.png') });

  await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
  const stopped = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(stopped.launch!.guard).toMatchObject({ state: 'settled', terminal: { disposition: 'cancelled' } });
  expect(stopped.head.checkpoint).toEqual(after.head.checkpoint);
  expect(Object.keys(stopped.head.allocations).sort()).toEqual([stopped.launch!.guard.id, proof.retained.parent.operation.id].sort());
  expect(stopped.head.quota).toMatchObject({ reservations: 2, reservedBytes: 2 * ACKNOWLEDGEMENT_BYTES });
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await expect(recovery.getByText(actions[1].actionId, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(stopped);
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: `Navigation terminal prefix delivered through sequence ${proof.retained.parent.event.data.event.sequence}` })).toBeVisible();
  expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(stopped);
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Navigation acknowledged (decision). Session clearance remains unknown.' })).toBeVisible();
  const acknowledged = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(Object.keys(acknowledged.head.allocations)).toEqual([stopped.launch!.guard.id]);
  expect(acknowledged.head.quota).toMatchObject({ reservations: 1, reservedBytes: ACKNOWLEDGEMENT_BYTES });
  await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
  await expect(recovery.getByText('Session clearance', { exact: true }).locator('..')).toContainText('Unknown');
  const final = await page.evaluate(() => window.canonicalStartService.snapshot()), finalProof = await evidence(page, actions[1] as AgenticaAction);
  expect(final.launch!.guard.state).toBe('acknowledged'); expect(final.head.allocations).toEqual({});
  expect(final.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0 });
  expect(final.head.checkpoint).toEqual(after.head.checkpoint);
  for (const area of ['world', 'knowledge'] as const) expect(final.head.roots[area]).toEqual(after.head.roots[area]);
  expect(finalProof.retained.parent.operation.state).toBe('acknowledged');
  expect(finalProof.retained.parent.operation.terminal).toEqual(proof.retained.parent.operation.terminal);
  expect(finalProof.retained.parent.progress).toEqual(p); expect(finalProof.retained.parentTerminal.event).toEqual(terminal);
  const delivered = wire.http.filter(row => row.method === 'POST'
    && ['/api/operations/events', '/api/operations/stop-decision'].includes(new URL(row.url).pathname))
    .map(row => row.body as HostOperationEvent).filter(event => event.operationId === terminal.operationId);
  const progress = delivered.filter(event => event.kind === 'progress');
  expect(progress[0]).toEqual(proof.retained.parent.confirmation.data.probe);
  expect(progress.map(event => event.usage!.steps)).toEqual(Array.from({ length: p.steps + 1 }, (_, i) => i));
  expect(progress.map(event => event.sequence)).toEqual(Array.from({ length: p.steps + 1 }, (_, i) => i + 1));
  expect(delivered.filter(event => event.kind === 'decision')).toEqual([terminal]);
  expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
  expect(wire.received.filter(({ frame }) => frame.type === 'action.request')).toHaveLength(2);
  expect(wire.sent.filter(frame => ['operation.wake', 'operation.adopt', 'resume'].includes(frame.type))).toEqual([]);
  expect(await serviceProof()).toEqual(travelCounters); expect(await pack(page)).toEqual(initialPack);
  await info.attach('actual-app-room.json', { body: JSON.stringify({ before, after, stopped, acknowledged, final, proof, finalProof,
    admission, selection, initialPack, baseline, travelCounters, delivered, sent: wire.sent, received: wire.received, http: wire.http }, null, 2), contentType: 'application/json' });
});
