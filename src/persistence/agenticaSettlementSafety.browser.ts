import { expect, test } from '@playwright/test';
import type {} from './agenticaTest.fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/src/persistence/agenticaTest.fixture.html'); await page.waitForFunction(() => Boolean(window.agenticaStorage));
});

test('uncertain domain or expansion receipts remain pending instead of fabricating a non-effect result', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve, sdk } = window.agenticaStorage; await setup();
    const input = await action('maze.move', { direction: 'north' }); await reserve(input);
    const db = await window.stream.openDB(window.stream.topology.TOPOLOGY_DATABASE), key = ['stream', sdk.actionKey(input)];
    const reservation = await db.get('agenticaActions', key);
    await api.executeAgenticaAction('stream', input);
    await db.put('agenticaActions', reservation, key); // Simulate missing external completion alongside an actual domain effect.
    const prepare = await action('maze.prepare', { frontierId: 'socket-0' }); await reserve(prepare);
    const prepareRecord = await db.get('agenticaActions', ['stream', sdk.actionKey(prepare)]);
    await db.put('receipts', { uncertain: true }, ['stream', prepareRecord.commandId]);
    await window.stream.api.claimStreamControl('stream', 'owner-b', 0);
    const before = await window.stream.raw();
    const replies = await Promise.all([input, prepare].map(value => api.settleAgenticaAction('stream', value)));
    const after = await window.stream.raw(); db.close();
    return { replies, before, after };
  });
  expect(result.replies).toEqual([undefined, undefined]); expect(result.after).toEqual(result.before);
});

for (const failure of ['quota', 'root-write'] as const) test(`${failure} failure retains the original pending reservation and all gameplay`, async ({ page }) => {
  const result = await page.evaluate(async failure => {
    const { api, setup, action, reserve, topologyTransaction, sdk } = window.agenticaStorage; await setup();
    const input = await action('maze.move', { direction: 'north' }); await reserve(input);
    await window.stream.api.claimStreamControl('stream', 'owner-b', 0);
    if (failure === 'quota') await topologyTransaction(async tx => {
      const root = (await tx.get('roots', 'stream'))!; await tx.stageRoot('stream', { ...root, quotaBytes: root.serializedBytes + 50 });
    });
    const before = await window.stream.raw(), put = IDBObjectStore.prototype.put;
    if (failure === 'root-write') IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'roots') throw new Error('Injected root-write failure');
      return put.call(this, value, key!);
    };
    let error = '';
    try { await api.settleAgenticaAction('stream', input); } catch (caught) { error = String(caught); }
    finally { IDBObjectStore.prototype.put = put; }
    return { before, after: await window.stream.raw(), error, record: await api.loadAgenticaAction('stream', sdk.actionKey(input)), query: await api.reconcileAgenticaAction('stream', input) };
  }, failure);
  expect(result.error).toContain(failure); expect(result.after).toEqual(result.before);
  expect(result.record!.status).toBe('pending'); expect(result.query).toBeUndefined();
});

test('conflicting fingerprints, absent bindings and corrupt records cannot settle', async ({ page }) => {
  const failures = await page.evaluate(async () => {
    const { api, setup, action, reserve, sdk } = window.agenticaStorage; const binding = await setup();
    const input = await action('maze.move', { direction: 'north' }); await reserve(input);
    await window.stream.api.claimStreamControl('stream', 'owner-b', 0);
    const db = await window.stream.openDB(window.stream.topology.TOPOLOGY_DATABASE), key = ['stream', sdk.actionKey(input)];
    const reservation = await db.get('agenticaActions', key), root = await db.get('roots', 'stream');
    const failures: string[] = [];
    const reject = async (request = input) => {
      const before = await window.stream.raw();
      try { await api.settleAgenticaAction('stream', request); failures.push('accepted'); } catch (error) { failures.push(String(error)); }
      if (JSON.stringify(before) !== JSON.stringify(await window.stream.raw())) throw new Error('Failed settlement mutated records');
    };
    await reject({ ...input, stepId: 'different-step' });
    await db.delete('agenticaRuns', ['stream', binding.runId]); await reject(); await db.put('agenticaRuns', binding, ['stream', binding.runId]);
    for (const value of [null, undefined, false]) {
      await db.put('agenticaActions', value, key); await reject(); await db.put('agenticaActions', reservation, key);
      await db.put('roots', value, 'stream'); await reject(); await db.put('roots', root, 'stream');
    }
    await db.put('streamActions', null, ['stream', reservation.commandId]); await reject();
    db.close(); return failures;
  });
  expect(failures).toHaveLength(9); expect(failures).not.toContain('accepted');
});
