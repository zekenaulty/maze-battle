import { test, expect, reloadExploration, attachEvidence } from './canonical-frontier-exploration.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('reload preserves original cumulative limits and funded custody across approach, crossing and survey', async ({ page }, info) => {
  const initial = await page.evaluate(async () => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed('A', 'opened-chest'), effects = await c.effects();
    const admission = await c.admit(seeded.page.value[0], { steps: 10, replans: 2, durationMs: 120_000 });
    const rows = await c.capture(admission.id, 4);
    return { seeded, admission, rows, effects, retained: await c.readDestination(admission.id), dump: await c.dump() };
  });
  await attachEvidence(info, 'quota-before-reload.json', initial);
  expect(initial.retained.value.progress).toMatchObject({ steps: 4, replans: 0, status: 'running' });
  expect(initial.retained.head.quota.reservations).toBe(1);
  await reloadExploration(page);
  const result = await page.evaluate(async id => {
    const c = window.canonicalFrontierExploration, before = await c.dump(), loaded = await c.readDestination(id), frame = await c.frame(), afterRead = await c.dump();
    const rows = await c.capture(id, 12), finished = await c.readDestination(id), beforeExtra = await c.dump();
    const extra = await c.refusal(() => c.advance(id)), afterExtra = await c.dump();
    const terminal = await c.settle(id); await c.acknowledge(id, terminal.request.attemptId);
    return { before, loaded, frame, afterRead, rows, finished, beforeExtra, extra, afterExtra, terminal,
      final: await c.readDestination(id), effects: await c.effects() };
  }, initial.admission.id);
  await attachEvidence(info, 'quota-after-reload.json', result);
  expect(result.before).toBe(initial.dump); expect(result.afterRead).toBe(result.before);
  expect(result.loaded.value).toEqual(initial.retained.value); expect(result.loaded.head.checkpoint).toEqual(initial.retained.head.checkpoint);
  expect(result.loaded.head.quota).toEqual(initial.retained.head.quota);
  expect(result.finished.value.progress).toMatchObject({ status: 'blocked', reason: 'step-limit', steps: 10, replans: 0, route: [],
    binding: initial.retained.value.progress.binding, startedAt: initial.retained.value.progress.startedAt, deadline: initial.retained.value.progress.deadline });
  expect(result.rows.some(row => row.state.value.progress.exploration?.phase === 'survey')).toBe(true);
  expect(result.rows.every(row => row.state.value.progress.steps >= 4 && row.state.value.progress.steps <= 10)).toBe(true);
  expect(result.rows.every(row => row.state.value.progress.position.cell.spaceId === initial.seeded.sight.header.actor.cell.spaceId)).toBe(true);
  expect(result.extra.rejected).toBe(true); expect(result.afterExtra).toBe(result.beforeExtra);
  expect(result.final.value.operation.terminal?.disposition).toBe('blocked');
  expect(result.final.value.operation.state).toBe('acknowledged'); expect(result.final.head.quota.reservations).toBe(0);
  expect(result.effects).toEqual(initial.effects); expect(result.final.head.roots.world).toEqual(initial.seeded.page.head.roots.world);
});

test('exact original admission, move and completed decision replay after reload with zero writes; changed body is refused', async ({ page }, info) => {
  const original = await page.evaluate(async () => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed('A'), admission = await c.admit(seeded.page.value[0]);
    const rows = await c.capture(admission.id, 3), terminalState = await c.readDestination(admission.id);
    if (terminalState.value.status !== 'decision') return { admission, rows, terminalState, originals: [], final: terminalState, dump: await c.dump() };
    const terminal = await c.settle(admission.id); await c.acknowledge(admission.id, terminal.request.attemptId);
    return { admission, rows, terminalState, originals: [admission, rows[1].step!, terminal].map(value => ({ request: value.request, receipt: value.outcome.receipt })),
      final: await c.readDestination(admission.id), dump: await c.dump() };
  });
  await attachEvidence(info, 'exact-originals.json', original);
  expect(original.terminalState.value.progress).toMatchObject({ status: 'decision', reason: 'new-object', steps: 3 });
  expect(original.originals).toHaveLength(3);
  expect(original.final.value.operation.terminal?.disposition).toBe('completed');
  await reloadExploration(page);
  const result = await page.evaluate(async serialized => {
    const originals = JSON.parse(serialized) as { request: CanonicalRequest }[];
    const c = window.canonicalFrontierExploration, before = await c.dump(), replies = [];
    for (const value of originals) replies.push(await c.executeNavigationCommand(value.request));
    const changed = structuredClone(originals[0].request), input = changed.input as Record<string, any>;
    input.binding.frontier.direction = 'east';
    const refused = await c.refusal(() => c.executeNavigationCommand(changed));
    return { before, replies, refused, after: await c.dump() };
  }, JSON.stringify(original.originals));
  await attachEvidence(info, 'exact-replay.json', result);
  expect(result.before).toBe(original.dump); expect(result.after).toBe(result.before);
  expect(result.replies.map(reply => reply.receipt)).toEqual(original.originals.map(value => value.receipt));
  expect(result.replies.every(reply => reply.replayed && reply.stats.writes === 0)).toBe(true);
  expect(result.refused.rejected).toBe(true);
});

test('explicit Stop during survey survives reload and cannot resume movement', async ({ page }, info) => {
  const stopped = await page.evaluate(async () => {
    const c = window.canonicalFrontierExploration, seeded = await c.seed('A', 'opened-chest'), admission = await c.admit(seeded.page.value[0]);
    const rows = await c.capture(admission.id, 9), before = await c.readDestination(admission.id), effects = await c.effects();
    const cancelled = await c.operateCanonical(c.command(before.head, 'operation.cancel', { operationId: admission.id }), 'cancel');
    return { admission, rows, before, cancelled, effects, retained: await c.readDestination(admission.id), dump: await c.dump() };
  });
  await attachEvidence(info, 'survey-stop-before-reload.json', stopped);
  expect(stopped.before.value.progress).toMatchObject({ steps: 9, status: 'running', exploration: { phase: 'survey' } });
  expect(stopped.retained.value.status).toBe('cancelled');
  expect(stopped.retained.head.checkpoint).toEqual(stopped.before.head.checkpoint);
  await reloadExploration(page);
  const result = await page.evaluate(async ({ id, terminal }) => {
    const c = window.canonicalFrontierExploration, before = await c.dump(), loaded = await c.readDestination(id);
    const refused = await c.refusal(() => c.advance(id)), after = await c.dump(); await c.acknowledge(id, terminal);
    return { before, loaded, refused, after, final: await c.readDestination(id), effects: await c.effects() };
  }, { id: stopped.admission.id, terminal: stopped.cancelled.receipt.attemptId });
  await attachEvidence(info, 'survey-stop-after-reload.json', result);
  expect(result.before).toBe(stopped.dump); expect(result.after).toBe(result.before);
  expect(result.loaded.value).toEqual(stopped.retained.value); expect(result.refused.rejected).toBe(true);
  expect(result.final.head.checkpoint).toEqual(stopped.before.head.checkpoint); expect(result.effects).toEqual(stopped.effects);
  expect(result.final.value.operation.state).toBe('acknowledged'); expect(result.final.head.quota.reservations).toBe(0);
});
