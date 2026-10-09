import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-fixture';

const fixture = '/tests/e2e/stream-persistence-fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => Boolean(window.stream)); });

test('old gameplay saves acquire one random UUID without changing gameplay or receipts; retries/reloads do not write', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, request, raw, trace, openDB, topology } = window.stream;
    await setup();
    const input = await request({ type: 'prepare', frontierId: 'socket-0' }, 'before-public-scope');
    const outcome = await api.executeStreamAction('stream', input);
    const absent = await api.getStreamPublicScope('stream');
    const before = await raw();
    const original = crypto.randomUUID.bind(crypto);
    let calls = 0;
    crypto.randomUUID = () => { calls++; return original(); };
    let id: string;
    try {
      id = (await trace(() => api.ensureStreamPublicScope('stream'))).result;
      if (id !== await api.ensureStreamPublicScope('stream')) throw new Error('Retry changed identity');
    } finally { crypto.randomUUID = original; }
    const after = await raw();
    const db = await openDB(topology.TOPOLOGY_DATABASE), version = db.version; db.close();
    return { id, calls, absent, version, before, after, outcome, replay: await api.executeStreamAction('stream', input) };
  });
  expect(result.absent).toBeUndefined(); expect(result.calls).toBe(1); expect(result.version).toBe(2);
  expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(result.replay).toEqual(result.outcome);
  expect(result.after.records.filter(record => record.store !== 'roots')).toEqual(result.before.records.filter(record => record.store !== 'roots'));
  const root = result.after.records.find(record => record.store === 'roots')!.value;
  expect(root.header).toEqual(result.before.records.find(record => record.store === 'roots')!.value.header);
  expect(root.publicScopeId).toBe(result.id); expect(root.serializedBytes).toBe(result.after.bytes);
  await page.reload(); await page.waitForFunction(() => Boolean(window.stream));
  expect(await page.evaluate(() => window.stream.api.ensureStreamPublicScope('stream'))).toBe(result.id);
  expect(await page.evaluate(() => window.stream.raw())).toEqual(result.after);
});

test('concurrent tabs reconcile the same UUID; another slot with identical recipe gets an independent UUID', async ({ page, context }) => {
  await page.evaluate(() => window.stream.setup());
  const second = await context.newPage(); await second.goto(fixture); await second.waitForFunction(() => Boolean(window.stream));
  const ids = await Promise.all([
    page.evaluate(() => window.stream.api.ensureStreamPublicScope('stream')),
    second.evaluate(() => window.stream.api.ensureStreamPublicScope('stream')),
  ]);
  expect(ids[0]).toBe(ids[1]);
  const other = await page.evaluate(async () => {
    await window.stream.setup(undefined, 'other');
    return window.stream.api.ensureStreamPublicScope('other');
  });
  expect(other).not.toBe(ids[0]);
});

test('malformed present public identities reject rather than being regenerated', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, raw, openDB, topology } = window.stream;
    await setup();
    const db = await openDB(topology.TOPOLOGY_DATABASE);
    const root = await db.get('roots', 'stream');
    const failures: string[] = [];
    for (const value of [undefined, null, false, '', root.header.scopeId, `scope:${crypto.randomUUID()}`, 'not-a-uuid']) {
      await db.put('roots', { ...root, publicScopeId: value }, 'stream');
      const before = await raw();
      for (const operation of [api.ensureStreamPublicScope, api.getStreamPublicScope]) {
        try { await operation('stream'); failures.push('accepted'); } catch (error) { failures.push(String(error)); }
      }
      if (JSON.stringify(before) !== JSON.stringify(await raw())) throw new Error('Corruption was overwritten');
    }
    db.close(); return failures;
  });
  expect(result).toHaveLength(14); expect(result.every(error => error.includes('Invalid public scope UUID'))).toBe(true);
});
