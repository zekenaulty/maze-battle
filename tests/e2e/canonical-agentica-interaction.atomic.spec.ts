import { test, expect, evidence } from './canonical-agentica-interaction.test';
import { confirmed, effectsOf, expectSingleChestEffect } from './canonical-agentica-interaction.support';

test('two fresh apply attempts at one fence commit one actual chest and quest award', async ({ page }, info) => {
  const { s, peer } = await confirmed(page);
  const r = await page.evaluate(async s => {
    const f = window.canonicalAgenticaInteraction, first = await f.applyRequest(s.operationId);
    const requests = [first, { ...structuredClone(first), attemptId: crypto.randomUUID() }];
    const attempts = await Promise.allSettled(requests.map(request => f.apply(s.action, request)));
    const results = attempts.map(result => result.status === 'fulfilled' ? { status: result.status, outcome: result.value }
      : { status: result.status, error: String(result.reason) });
    const winner = attempts.findIndex(result => result.status === 'fulfilled');
    if (winner < 0) throw Error(`No apply committed: ${JSON.stringify(results)}`);
    const state = await f.operation(s.action), afterApply = await f.effects(), beforeRetry = await f.dump();
    const fresh = await f.applyRequest(s.operationId), refusal = await f.refusal(() => f.apply(s.action, fresh)), afterRefusal = await f.dump();
    const replay = await f.apply(s.action, requests[winner]), afterReplay = await f.dump();
    return { requests, results, winner, state, afterApply, beforeRetry, fresh, refusal, afterRefusal, replay, afterReplay };
  }, { action: s.action, operationId: s.operationId });
  expect(r.requests[0].expected).toEqual(r.requests[1].expected);
  expect(r.results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(r.results.filter(result => result.status === 'rejected')).toEqual([{ status: 'rejected', error: expect.stringContaining('stale owner or revision') }]);
  expectSingleChestEffect(s.before, r.afterApply);
  expect(r.state.value!.progress).toMatchObject({ status: 'applied', sequence: 1, sourceAttemptId: r.requests[r.winner].attemptId });
  expect(r.fresh.expected.revision).toBeGreaterThan(r.requests[0].expected.revision);
  expect(r.refusal.message).toContain('already consumed'); expect(r.afterRefusal).toBe(r.beforeRetry);
  expect(r.replay.replayed).toBe(true); expect(r.replay.stats.writes).toBe(0); expect(r.afterReplay).toBe(r.beforeRetry);
  const winner = r.results[r.winner];
  expect('outcome' in winner && winner.outcome!.receipt).toEqual(r.replay.receipt);
  expect(await effectsOf(page)).toEqual(r.afterApply); expect(peer.violations).toEqual([]);
  await evidence(info, 'same-fence-interaction-race.json', { s, r });
});

test('throw after the actual production progress callback rolls back loot, quest, sight, event and receipt atomically', async ({ page }, info) => {
  const { s, peer } = await confirmed(page);
  const r = await page.evaluate(async s => {
    const f = window.canonicalAgenticaInteraction, request = await f.applyRequest(s.operationId), before = await f.dump();
    const effects = await f.effects(), seen: unknown[] = [];
    const refusal = await f.refusal(() => f.apply(s.action, request, true, seen));
    const afterRefusal = await f.dump(), effectsAfterRefusal = await f.effects(), pending = await f.operation(s.action);
    const retry = await f.apply(s.action, request), afterRetry = await f.effects(), applied = await f.operation(s.action);
    return { request, before, effects, seen, refusal, afterRefusal, effectsAfterRefusal, pending, retry, afterRetry, applied };
  }, { action: s.action, operationId: s.operationId });
  expect(r.refusal.message).toContain('fixture failure after actual interaction event');
  expect(r.seen).toHaveLength(1);
  expect(r.seen[0]).toMatchObject({ refs: { event: { sourceAttemptId: r.request.attemptId } }, progress: { sequence: 1, status: 'applied' } });
  expect(r.afterRefusal).toBe(r.before); expect(r.effectsAfterRefusal).toEqual(r.effects);
  expect(r.pending.value!.progress).toMatchObject({ status: 'pending', sequence: 0 }); expect(r.pending.value!.event).toBeNull();
  expect(r.retry.replayed).toBe(false); expectSingleChestEffect(s.before, r.afterRetry);
  expect(r.applied.value!.progress.sourceAttemptId).toBe(r.request.attemptId);
  expect(r.applied.value!.event!.data.event.eventId).toBe(r.request.attemptId); expect(peer.violations).toEqual([]);
  await evidence(info, 'actual-event-hook-rollback.json', { s, r });
});
