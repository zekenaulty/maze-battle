import { test, expect } from './canonical-frontier.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('explicit nonzero approach survives reload and stops exactly at the selected anchor without collection', async ({ page }, info) => {
  const initial = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), selection = seeded.page.value[0], effects = await c.effects();
    const admission = await c.admit(selection), admitted = await c.readDestination(admission.id), step = await c.advance(admission.id);
    return { seeded, selection, effects, admission, admitted, step, first: await c.readDestination(admission.id) };
  });
  expect(initial.admitted.value.progress).toMatchObject({ status: 'running', steps: 0, binding: { kind: 'frontier-approach', frontier: initial.selection, target: initial.selection.at } });
  expect(initial.admitted.head.checkpoint).toEqual(initial.seeded.page.head.checkpoint);
  expect(initial.first.value.progress.steps).toBe(1);
  expect(initial.first.head.checkpoint.position).not.toEqual(initial.seeded.page.head.checkpoint.position);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalFrontier);
  const done = await page.evaluate(async id => {
    const c = window.canonicalFrontier, before = await c.dump(), loaded = await c.readDestination(id), afterLoad = await c.dump();
    const finished = await c.finish(id), beforeExtra = await c.dump(), extra = await c.refusal(() => c.advance(id)), afterExtra = await c.dump();
    const sight = (await c.knowledge.current()).value, terminal = await c.settle(id);
    await c.acknowledge(id, terminal.request.attemptId);
    return { before, afterLoad, loaded, finished, beforeExtra, afterExtra, extra, sight, terminal,
      final: await c.readDestination(id), effects: await c.effects() };
  }, initial.admission.id);
  expect(done.afterLoad).toBe(done.before); expect(done.loaded.value.progress).toEqual(initial.first.value.progress);
  expect(done.finished.value.progress).toMatchObject({ status: 'arrived', reason: 'arrived', binding: initial.admitted.value.progress.binding });
  expect(done.finished.value.progress.steps).toBeGreaterThan(0); expect(done.finished.head.checkpoint.position).toEqual(initial.selection.at);
  expect(done.sight.header.actor).toEqual(initial.selection.at); expect(done.sight.header.sequence).toBeGreaterThan(initial.seeded.sight.header.sequence);
  expect(done.finished.head.roots.knowledge).not.toEqual(initial.seeded.page.head.roots.knowledge);
  expect(done.extra.rejected).toBe(true); expect(done.afterExtra).toBe(done.beforeExtra);
  expect(done.effects).toEqual(initial.effects); expect(done.final.head.roots.world).toEqual(initial.seeded.page.head.roots.world);
  expect(done.final.head.checkpoint.mode).toBe('manual'); expect(done.final.value.operation.state).toBe('acknowledged');
  expect(done.final.head.quota.reservations).toBe(0);
  await info.attach('approach-only.json', { body: JSON.stringify({ initial, loaded: done.loaded, finished: done.finished,
    sight: done.sight, terminal: done.terminal, final: done.final }, null, 2), contentType: 'application/json' });
});

test('original admission/step/terminal replay after reload without another move', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), admission = await c.admit(seeded.page.value[0]);
    const step = await c.advance(admission.id); await c.finish(admission.id);
    const terminal = await c.settle(admission.id); await c.acknowledge(admission.id, terminal.request.attemptId);
    return [admission, step, terminal].map(value => ({ request: value.request, receipt: value.outcome.receipt }));
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalFrontier);
  const result = await page.evaluate(async serialized => {
    const originals = JSON.parse(serialized) as { request: CanonicalRequest }[];
    const c = window.canonicalFrontier, before = await c.dump(), replies = [];
    for (const value of originals) replies.push(await c.executeNavigationCommand(value.request as CanonicalRequest));
    const changed = structuredClone(originals[0].request);
    const input = changed.input as Record<string, any>; input.binding.frontier.direction = input.binding.frontier.direction === 'north' ? 'east' : 'north';
    const refused = await c.refusal(() => c.executeNavigationCommand(changed as CanonicalRequest));
    return { replies, refused, before, after: await c.dump() };
  }, JSON.stringify(original));
  expect(result.replies.map(reply => reply.receipt)).toEqual(original.map(value => value.receipt));
  expect(result.replies.every(reply => reply.replayed && reply.stats.writes === 0)).toBe(true);
  expect(result.refused.rejected).toBe(true); expect(result.after).toBe(result.before);
});

test('local Stop cancels retained approach and forbids later movement without touching game effects', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), admission = await c.admit(seeded.page.value[0]);
    const before = await c.readDestination(admission.id), effects = await c.effects();
    const cancelled = await c.operateCanonical(c.command(before.head, 'operation.cancel', { operationId: admission.id }), 'cancel');
    const stopped = await c.readDestination(admission.id), dump = await c.dump(), rejected = await c.refusal(() => c.advance(admission.id));
    const afterRefusal = await c.dump(); await c.acknowledge(admission.id, cancelled.receipt.attemptId);
    return { before, stopped, rejected, dump, afterRefusal, final: await c.readDestination(admission.id), effects, afterEffects: await c.effects() };
  });
  expect(result.stopped.value.status).toBe('cancelled'); expect(result.stopped.value.progress.steps).toBe(0);
  expect(result.stopped.head.checkpoint).toEqual(result.before.head.checkpoint);
  expect(result.rejected.rejected).toBe(true); expect(result.afterRefusal).toBe(result.dump);
  expect(result.final.value.operation.state).toBe('acknowledged'); expect(result.final.head.quota.reservations).toBe(0);
  expect(result.afterEffects).toEqual(result.effects);
});

test('takeover requires explicit adoption and preserves original frontier, deadline and accumulated movement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalFrontier, seeded = await c.seed(), admission = await c.admit(seeded.page.value[0], { steps: 20, replans: 4, durationMs: 60_000 });
    await c.advance(admission.id); const original = await c.readDestination(admission.id);
    if (original.value.status !== 'running') throw Error('Takeover fixture must retain a nonterminal approach');
    const stale = c.command(original.head, 'navigation.advance', { operationId: admission.id, sequence: original.value.progress.sequence });
    await c.controlCanonical(c.command(original.head, 'control.takeover', { owner: 'successor' }), 'takeover');
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.resume', { owner: 'successor' }), 'resume');
    const before = await c.dump(), staleReply = await c.refusal(() => c.executeNavigationCommand(stale));
    const unadopted = await c.refusal(() => c.advance(admission.id)), after = await c.dump();
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.adopt', { operationId: admission.id }), 'adopt');
    const resumed = await c.advance(admission.id), current = await c.readDestination(admission.id);
    return { original, before, after, staleReply, unadopted, resumed, current };
  });
  expect(result.staleReply.rejected).toBe(true); expect(result.unadopted.rejected).toBe(true); expect(result.after).toBe(result.before);
  expect(result.current.value.progress).toMatchObject({ binding: result.original.value.progress.binding,
    startedAt: result.original.value.progress.startedAt, deadline: result.original.value.progress.deadline,
    owner: 'successor', steps: result.original.value.progress.steps + 1, sequence: result.original.value.progress.sequence + 1,
    replans: result.original.value.progress.replans + 1 });
  expect(result.current.head.gameId).toBe(result.original.head.gameId);
  expect(result.current.head.epoch).toBeGreaterThan(result.original.head.epoch);
});
