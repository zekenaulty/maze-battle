import { expect, test } from '@playwright/test';
import type {} from './agenticaTest.fixture';
import type { AgenticaGameBinding } from '../services/agentica/contracts';

const fixture = '/src/persistence/agenticaTest.fixture.html';
test.beforeEach(async ({ page }) => { await page.goto(fixture); await page.waitForFunction(() => Boolean(window.agenticaStorage)); });

for (const revoked of [false, true]) test(`cross-tab settlement/execution CAS with revoked=${revoked}`, async ({ page, context }) => {
  const input = await page.evaluate(async revoked => {
    const { setup, action, reserve } = window.agenticaStorage; await setup();
    const input = await action('maze.move', { direction: 'north' }); await reserve(input);
    if (revoked) await window.stream.api.claimStreamControl('stream', 'owner-b', 0);
    return input;
  }, revoked);
  const second = await context.newPage(); await second.goto(fixture); await second.waitForFunction(() => Boolean(window.agenticaStorage));
  const [first, executed, duplicate] = await Promise.all([
    page.evaluate(input => window.agenticaStorage.api.settleAgenticaAction('stream', input), input),
    second.evaluate(input => window.agenticaStorage.api.executeAgenticaAction('stream', input), input),
    page.evaluate(input => window.agenticaStorage.api.settleAgenticaAction('stream', input), input),
  ]);
  expect(executed.disposition).toBe(revoked ? 'conflict' : 'applied');
  for (const result of [first, duplicate]) if (revoked || result !== undefined) expect(result).toEqual(executed);
  const after = await page.evaluate(async input => ({
    original: await window.agenticaStorage.api.settleAgenticaAction('stream', input),
    snapshot: await window.stream.api.loadStreamSnapshot('stream'), raw: await window.stream.raw(),
  }), input);
  expect(after.original).toEqual(executed); expect(after.snapshot.checkpoint.revision).toBe(revoked ? 0 : 1);
  expect(after.raw.records.filter(record => record.store === 'agenticaActions')).toHaveLength(1);
  expect(after.raw.records.filter(record => record.store === 'streamActions')).toHaveLength(revoked ? 0 : 1);
});

test('SDK pending after a client precheck failure settles on recovery without invoking onAction again', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, sdk } = window.agenticaStorage; const binding = await setup();
    let invocations = 0, confirms = 0;
    const host = new sdk.AgenticaHost({ url: 'ws://unused.invalid',
      loadAction: key => api.loadAgenticaAction('stream', key),
      saveAction: async (key, record) => { if (record.status === 'completed') confirms++; await api.saveAgenticaAction('stream', key, record); },
      onAction: async input => {
        invocations++;
        if ((await api.loadAgenticaAction('stream', sdk.actionKey(input)))?.status !== 'pending') throw new Error('No SDK reservation');
        await window.stream.api.claimStreamControl('stream', 'client-released', 0);
        throw new Error('Client precheck: control changed before host execution');
      },
      reconcileAction: input => api.settleAgenticaAction('stream', input),
    }) as unknown as { runs: Map<string, AgenticaGameBinding>; _action(message: unknown): Promise<void> };
    host.runs.set(binding.runId, binding);
    const input = await action('maze.move', { direction: 'north' });
    await host._action({ type: 'action.request', runId: binding.runId, payload: input });
    const pending = await api.loadAgenticaAction('stream', sdk.actionKey(input));
    const query = await api.reconcileAgenticaAction('stream', input);
    await host._action({ type: 'action.reconcile', runId: binding.runId, payload: input });
    const original = await api.reconcileAgenticaAction('stream', input);
    await host._action({ type: 'action.reconcile', runId: binding.runId, payload: input });
    return { invocations, confirms, pending, query, original, replay: await api.settleAgenticaAction('stream', input), raw: await window.stream.raw() };
  });
  expect(result.pending!.status).toBe('pending'); expect(result.query).toBeUndefined(); expect(result.invocations).toBe(1); expect(result.confirms).toBe(2);
  expect(result.original!.disposition).toBe('conflict'); expect(result.original!.beforeRevision).toBe(0); expect(result.original!.afterRevision).toBe(0);
  expect(result.replay).toEqual(result.original); expect(result.raw.records.filter(record => record.store === 'streamActions')).toHaveLength(0);
});
