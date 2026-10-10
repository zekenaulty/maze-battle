import { expect, test } from '@playwright/test';
import type {} from './agenticaTest.fixture';

const fixture = '/src/persistence/agenticaTest.fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => Boolean(window.agenticaStorage)); });

test('SDK reservation, atomic effect/evidence, immutable reload and exact confirmation', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const { api, setup, action, reserve, sdk } = window.agenticaStorage;
    const binding = await setup(), input = await action('maze.move', { direction: 'north' });
    let missing = ''; try { await api.executeAgenticaAction('stream', input); } catch (error) { missing = String(error); }
    await reserve(input);
    const pending = await window.stream.raw();
    const query = await api.reconcileAgenticaAction('stream', input);
    if (JSON.stringify(pending) !== JSON.stringify(await window.stream.raw())) throw new Error('Query wrote records');
    const trace = await window.stream.trace(() => api.executeAgenticaAction('stream', input));
    const result = trace.result;
    await api.saveAgenticaAction('stream', sdk.actionKey(input), { fingerprint: sdk.actionFingerprint(input), status: 'completed', result });
    const callerCopy = (await api.loadAgenticaAction('stream', sdk.actionKey(input)))!;
    callerCopy.result!.observation!.observedAt = 'caller mutation';
    const queryTrace = await window.stream.trace(() => api.reconcileAgenticaAction('stream', input));
    if (JSON.stringify(queryTrace.result) !== JSON.stringify(result)) throw new Error('Caller owns stored evidence');
    await reserve(input);
    await window.stream.act({ type: 'move', direction: 'south' });
    await window.stream.api.claimStreamControl('stream', 'other-owner', 0);
    const final = await window.stream.raw();
    return { binding, input, result, final, trace, queryTrace, query, missing };
  });
  expect(saved.missing).toContain('missing durable pending'); expect(saved.query).toBeUndefined();
  expect(saved.result.disposition).toBe('applied'); expect(saved.result.afterRevision).toBe(1);
  expect(saved.trace.total).toBeLessThanOrEqual(16); expect(saved.trace.methods.get).toBeUndefined();
  expect(saved.queryTrace.total).toBe(5); expect(saved.queryTrace.reads.spaces).toBeUndefined(); expect(saved.queryTrace.reads.streamKnowledge).toBeUndefined();
  expect(saved.final.records.find(record => record.store === 'roots')!.value.serializedBytes).toBe(saved.final.bytes);
  await page.reload(); await page.waitForFunction(() => Boolean(window.agenticaStorage));
  const replay = await page.evaluate(async input => {
    const { api } = window.agenticaStorage;
    const now = Date.now; Date.now = () => Date.parse(input.deadlineAt) + 1;
    try { return { result: await api.executeAgenticaAction('stream', input), query: await api.reconcileAgenticaAction('stream', input), raw: await window.stream.raw() }; }
    finally { Date.now = now; }
  }, saved.input);
  expect(replay.result).toEqual(saved.result); expect(replay.query).toEqual(saved.result); expect(replay.raw).toEqual(saved.final);
});

test('cross-tab same-ID races execute once; competing IDs CAS, topology and epoch fences are durable conflicts', async ({ page, context }) => {
  const input = await page.evaluate(async () => { await window.agenticaStorage.setup(); const input = await window.agenticaStorage.action('maze.move', { direction: 'north' }); await window.agenticaStorage.reserve(input); return input; });
  const second = await context.newPage(); await second.goto(fixture); await second.waitForFunction(() => Boolean(window.agenticaStorage));
  const outcomes = await Promise.all([page, second].map(tab => tab.evaluate(input => window.agenticaStorage.api.executeAgenticaAction('stream', input), input)));
  expect(outcomes[0]).toEqual(outcomes[1]); expect(outcomes[0].afterRevision).toBe(1);
  const result = await page.evaluate(async () => {
    const { api, action, reserve } = window.agenticaStorage;
    const a = await action('maze.move', { direction: 'south' }), b = { ...a, actionId: 'competitor' };
    await Promise.all([reserve(a), reserve(b)]);
    const race = await Promise.all([api.executeAgenticaAction('stream', a), api.executeAgenticaAction('stream', b)]);
    const topo = await action(); topo.arguments.topologyRevision = 1;
    await reserve(topo); const topology = await api.executeAgenticaAction('stream', topo);
    const old = await action(); await reserve(old); await window.stream.api.claimStreamControl('stream', 'new-owner', 0);
    const control = await api.executeAgenticaAction('stream', old);
    return { race, topology, control };
  });
  expect(result.race.map(value => value.disposition).sort()).toEqual(['applied', 'conflict']);
  for (const conflict of [result.race.find(value => value.disposition === 'conflict')!, result.topology, result.control]) {
    expect(conflict.disposition).toBe('conflict'); expect(conflict.beforeRevision).toBe(2); expect(conflict.afterRevision).toBe(2);
  }
});

test('observe is read-only; expired actions do not execute; SDK cannot fabricate or overwrite completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve, sdk } = window.agenticaStorage; await setup();
    const input = await action(); await reserve(input);
    const original = await api.executeAgenticaAction('stream', input);
    const fake = await action('maze.move', { direction: 'north' }); await reserve(fake);
    const failures: string[] = [];
    const attempts = [
      () => api.saveAgenticaAction('stream', sdk.actionKey(fake), { status: 'completed', fingerprint: sdk.actionFingerprint(fake), result: { ...original, actionId: fake.actionId } }),
      () => api.saveAgenticaAction('stream', sdk.actionKey(input), { status: 'completed', fingerprint: sdk.actionFingerprint(input), result: { ...original, summary: 'changed' } }),
      () => api.executeAgenticaAction('stream', { ...input, stepId: 'changed' }),
      () => api.reconcileAgenticaAction('stream', { ...input, runnerRunId: 'changed' }),
    ];
    const before = await window.stream.raw();
    for (const attempt of attempts) { try { await attempt(); failures.push('accepted'); } catch (error) { failures.push(String(error)); } }
    if (JSON.stringify(before) !== JSON.stringify(await window.stream.raw())) throw new Error('Invalid save changed data');
    const expired = await action('maze.move', { direction: 'north' }); expired.deadlineAt = '2000-01-01T00:00:00.000Z';
    await reserve(expired); const unavailable = await api.executeAgenticaAction('stream', expired);
    return { original, unavailable, failures, snapshot: await window.stream.api.loadStreamSnapshot('stream') };
  });
  expect(result.original.disposition).toBe('applied'); expect(result.original.afterRevision).toBe(0);
  expect(result.unavailable.disposition).toBe('unavailable'); expect(result.unavailable.beforeRevision).toBe(0);
  expect(result.snapshot.checkpoint.revision).toBe(0); expect(result.failures.every(error => error !== 'accepted')).toBe(true);
});
