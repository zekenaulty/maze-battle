import { expect, test } from '@playwright/test';
import type {} from './agenticaTest.fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/src/persistence/agenticaTest.fixture.html'); await page.waitForFunction(() => Boolean(window.agenticaStorage));
});

test('falsy roots/runs/receipts and inconsistent completed evidence reject without repair or execution', async ({ page }) => {
  const failures = await page.evaluate(async () => {
    const { api, setup, action, reserve, sdk } = window.agenticaStorage;
    const binding = await setup(), input = await action('maze.move', { direction: 'north' }); await reserve(input);
    await api.executeAgenticaAction('stream', input);
    const db = await window.stream.openDB(window.stream.topology.TOPOLOGY_DATABASE), key = sdk.actionKey(input);
    const original = await db.get('agenticaActions', ['stream', key]), root = await db.get('roots', 'stream');
    const failures: string[] = [];
    const cases: { store: string; key: IDBValidKey; value: any; restore: any }[] = [];
    for (const value of [undefined, null, false]) {
      cases.push({ store: 'agenticaActions', key: ['stream', key], value, restore: original });
      cases.push({ store: 'agenticaRuns', key: ['stream', binding.runId], value, restore: binding });
      cases.push({ store: 'roots', key: 'stream', value, restore: root });
    }
    for (const change of [
      (value: typeof original) => { value.record.result.observation.data.checkpoint.scopeId = root.header.scopeId; },
      (value: typeof original) => { value.record.result.observation.revision++; },
      (value: typeof original) => { value.record.result.observation.data.knowledge.revision++; },
      (value: typeof original) => { value.record.result.afterRevision++; },
      (value: typeof original) => { value.record.result.completion = { objectiveId: binding.objectiveId, evidenceId: value.record.result.evidenceId, summary: 'fabricated' }; },
      (value: typeof original) => { value.record.status = 'pending'; delete value.record.result; },
      (value: typeof original) => { value.record.fingerprint = value.record.fingerprint.replace('runner', 'other'); },
    ]) { const value = structuredClone(original); change(value); cases.push({ store: 'agenticaActions', key: ['stream', key], value, restore: original }); }
    for (const entry of cases) {
      await db.put(entry.store, entry.value, entry.key); const before = await window.stream.raw();
      for (const attempt of [
        () => api.loadAgenticaAction('stream', key), () => api.executeAgenticaAction('stream', input),
        () => api.reconcileAgenticaAction('stream', input), () => reserve(input),
      ]) { try { await attempt(); failures.push('accepted'); } catch (error) { failures.push(String(error)); } }
      if (JSON.stringify(before) !== JSON.stringify(await window.stream.raw())) throw new Error('Overwrote corruption');
      await db.put(entry.store, entry.restore, entry.key);
    }
    db.close(); return failures;
  });
  expect(failures).toHaveLength(64); expect(failures).not.toContain('accepted');
});

test('run/session/manifest identities bind once; equal external action IDs across runs do not collide', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve } = window.agenticaStorage; const binding = await setup();
    const before = await window.stream.raw(), errors: string[] = [];
    for (const altered of [{ ...binding, manifestHash: `sha256:${'2'.repeat(64)}` }, { ...binding, scopeId: crypto.randomUUID() }, { ...binding, sessionEpoch: '1' }]) {
      try { await api.bindAgenticaRun('stream', altered); errors.push('accepted'); } catch (error) { errors.push(String(error)); }
    }
    if (JSON.stringify(before) !== JSON.stringify(await window.stream.raw())) throw new Error('Binding was replaced');
    await api.bindAgenticaRun('stream', binding);
    const first = await action('maze.move', { direction: 'north' }, 'shared-id'); await reserve(first);
    const a = await api.executeAgenticaAction('stream', first);
    await api.bindAgenticaRun('stream', { ...binding, runId: 'second-run' });
    const second = await action('maze.move', { direction: 'south' }, 'shared-id', 'second-run'); await reserve(second);
    const b = await api.executeAgenticaAction('stream', second);
    return { errors, a, b, replay: await api.executeAgenticaAction('stream', first) };
  });
  expect(result.errors).not.toContain('accepted'); expect(result.a.afterRevision).toBe(1); expect(result.b.afterRevision).toBe(2); expect(result.replay).toEqual(result.a);
});
