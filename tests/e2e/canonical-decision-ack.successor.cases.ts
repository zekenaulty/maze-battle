import { test, expect, ready, reload } from './canonical-decision-ack.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import type { TransferSeed } from './canonical-operation-transfer.setup';

test('grant-before-ACK and successor navigation preserve funded retries after launch Stop without ancestor ACK recursion', async ({ page }) => {
  const { seed: first, proof } = await ready(page);
  const r = await page.evaluate(async proof => {
    const c = window.canonicalDecisionAck, original = await c.state();
    await c.grant(); const firstAck = await c.ack(proof.entry), firstHistory = await c.state();
    const second = await c.arriveSuccessor(); await c.prepare(); const nextProof = await c.proof(); await c.claim(nextProof);
    await c.grant(); const beforeSecondAck = await c.state(), secondAck = await c.ack(nextProof.entry), secondHistory = await c.state();
    await c.cancel(); const quota = await c.quota(), stopped = await c.state(), audit = await c.audit();
    return { original, firstAck, firstHistory, second, nextProof, beforeSecondAck, secondAck, secondHistory, stopped, quota, audit };
  }, proof);
  expect(r.second.action.runId).not.toBe(first.action.runId);
  expect(r.second.binding.grant).not.toEqual(first.binding.grant);
  expect(r.audit.grant).toEqual(r.second.binding.grant); expect(r.audit.start).toEqual(r.second.entry.request);
  expect(r.audit.start.observation).not.toEqual(first.entry.request.observation);
  expect(r.firstHistory.terminal!.operation.state).toBe('acknowledged');
  expect(r.secondHistory.terminal!.operation.state).toBe('acknowledged');
  expect(r.firstHistory.terminal!.original).toEqual(r.original.terminal!.original);
  expect(r.secondHistory.terminal!.original).toEqual(r.beforeSecondAck.terminal!.original);
  expect(r.secondHistory.claim).toEqual(r.beforeSecondAck.claim);
  expect(r.secondHistory.terminal!.event.kind).toBe('decision');
  expect(r.stopped.head.allocations[first.operationId]).toBeUndefined();
  expect(r.stopped.head.allocations[r.second.operationId]).toBeUndefined();
  expect(r.stopped.head.allocations[first.launchGuard]).toBeDefined();
  expect(r.stopped.terminal!.guard.state).toBe('settled'); expect(r.quota).not.toBe('accepted');
  expect(r.audit.receipts).toContain(r.secondAck.request.attemptId);
  expect(r.audit.receipts).not.toContain(r.firstAck.request.attemptId);
  expect(r.audit.stats.reads).toBeLessThan(r.audit.limits.reads);
  expect(r.audit.stats.readBytes).toBeLessThan(r.audit.limits.bytes); expect(r.audit.stats.writes).toBe(0);

  // At exhausted quota, replay committed receipts without spending on a new owner claim.
  await reload(page, r.second, false);
  const retries = await page.evaluate(async encoded => {
    const cases = JSON.parse(encoded) as { seed: TransferSeed; request: CanonicalRequest }[];
    const c = window.canonicalDecisionAck, before = await c.dump(), result = [];
    for (const item of cases) {
      c.bind(item.seed); const history = await c.state(), retry = await c.replayCommittedAck(item.request);
      result.push({ receipt: retry.receipt, replayed: retry.replayed, stats: retry.stats, history, audit: await c.audit() });
    }
    return { result, unchanged: before === await c.dump() };
  }, JSON.stringify([{ seed: first, request: r.firstAck.request }, { seed: r.second, request: r.secondAck.request }]));
  expect(retries.unchanged).toBe(true);
  for (const [index, prior] of [r.firstAck, r.secondAck].entries()) {
    const retry = retries.result[index], history = [r.firstHistory, r.secondHistory][index];
    expect(retry.receipt).toEqual(prior.receipt);
    expect(retry.replayed).toBe(true); expect(retry.stats.writes).toBe(0);
    expect(retry.history.terminal!.operation).toEqual(history.terminal!.operation);
    expect(retry.history.terminal!.event).toEqual(history.terminal!.event);
    expect(retry.history.terminal!.original).toEqual(history.terminal!.original);
    expect(retry.history.claim).toEqual(history.claim); expect(retry.history.intent).toEqual(history.intent);
    expect(retry.history.terminal!.guard.terminal!.disposition).toBe('cancelled');
    expect(retry.audit.stats.writes).toBe(0);
  }
  expect(retries.result[1].audit.receipts).toContain(r.secondAck.request.attemptId);
  expect(retries.result[1].audit.receipts).not.toContain(r.firstAck.request.attemptId);
});
