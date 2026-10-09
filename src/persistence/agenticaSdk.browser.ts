import { expect, test } from '@playwright/test';
import type {} from './agenticaTest.fixture';
import type { AgenticaAction, AgenticaGameBinding } from '../services/agentica/contracts';
import type { PlanningFrame } from '../services/expedition/planning/contracts';

test.beforeEach(async ({ page }) => {
  await page.goto('/src/persistence/agenticaTest.fixture.html'); await page.waitForFunction(() => Boolean(window.agenticaStorage));
});

test('pinned SDK hooks reserve first, recover a lost acknowledgement, and never invoke retained pending', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, sdk } = window.agenticaStorage; const binding = await setup();
    let calls = 0, confirms = 0;
    const make = (effect: boolean) => {
      const host = new sdk.AgenticaHost({ url: 'ws://unused.invalid',
        onAction: async input => {
          calls++;
          if ((await api.loadAgenticaAction('stream', sdk.actionKey(input)))?.status !== 'pending') throw new Error('Missing prior durable reservation');
          if (effect) await api.executeAgenticaAction('stream', input);
          throw new Error('Injected lost acknowledgement');
        },
        loadAction: key => api.loadAgenticaAction('stream', key),
        saveAction: async (key, record) => { if (record.status === 'completed') confirms++; await api.saveAgenticaAction('stream', key, record); },
        reconcileAction: input => api.reconcileAgenticaAction('stream', input),
      }) as unknown as { runs: Map<string, AgenticaGameBinding>; _action(message: unknown): Promise<void> };
      // Exercise the pinned SDK handler without a network service or active browser.
      host.runs.set(binding.runId, binding); return host;
    };
    const input = await action('maze.move', { direction: 'north' }), first = make(true);
    await first._action({ type: 'action.request', runId: binding.runId, payload: input });
    const saved = await api.reconcileAgenticaAction('stream', input);
    const restarted = make(false);
    await restarted._action({ type: 'action.reconcile', runId: binding.runId, payload: input });
    const pending = await action('maze.move', { direction: 'south' });
    await restarted._action({ type: 'action.request', runId: binding.runId, payload: pending });
    const third = make(true);
    await third._action({ type: 'action.request', runId: binding.runId, payload: pending });
    await third._action({ type: 'action.reconcile', runId: binding.runId, payload: pending });
    return { calls, confirms, saved, query: await api.reconcileAgenticaAction('stream', pending), record: await api.loadAgenticaAction('stream', sdk.actionKey(pending)), revision: (await window.stream.api.loadStreamSnapshot('stream')).checkpoint.revision };
  });
  expect(result.calls).toBe(2); expect(result.confirms).toBe(1); expect(result.saved?.disposition).toBe('applied');
  expect(result.query).toBeUndefined(); expect(result.record?.status).toBe('pending'); expect(result.revision).toBe(1);
});

test('real observed-only planner exercises all five capabilities and commits first-chest evidence with bounded reads', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, setup, action, reserve, StreamPlanner, sdk } = window.agenticaStorage;
    const binding = await setup(), planner = new StreamPlanner();
    const first = await action(); await reserve(first);
    let latest = await api.executeAgenticaAction('stream', first);
    const originalObservation = structuredClone(latest);
    const refused = await action('maze.finish'); await reserve(refused);
    if ((await api.executeAgenticaAction('stream', refused)).disposition !== 'refused') throw new Error('Premature finish');
    const caps = new Set(['maze.observe', 'maze.finish']); let maxReads = 0, steps = 0, finalAction = first;
    for (; steps < 128 && !latest.completion; steps++) {
      const data = latest.observation!.data as unknown as PlanningFrame;
      const command = planner.choose(data.checkpoint, data.knowledge, binding.control).command;
      if (!command) throw new Error('Observed planner blocked');
      const input: AgenticaAction = { ...first, actionId: `planner-${steps}`, stepId: `step-${steps}`, capabilityId: `maze.${command.type}`,
        expectedRevision: data.checkpoint.revision,
        arguments: { topologyRevision: data.checkpoint.topologyRevision,
          ...(command.type === 'move' ? { direction: command.direction } : command.type === 'prepare' ? { frontierId: command.frontierId } : {}) } };
      await reserve(input);
      const measured = await window.stream.trace(() => api.executeAgenticaAction('stream', input));
      maxReads = Math.max(maxReads, measured.total); latest = measured.result; caps.add(input.capabilityId); finalAction = input;
      if (latest.disposition !== 'applied') throw new Error(JSON.stringify(latest));
      await api.saveAgenticaAction('stream', sdk.actionKey(input), { fingerprint: sdk.actionFingerprint(input), status: 'completed', result: latest });
    }
    if (JSON.stringify(await api.reconcileAgenticaAction('stream', first)) !== JSON.stringify(originalObservation)) throw new Error('Historical observation changed after expansion');
    return { steps, maxReads, caps: [...caps], latest, finalAction, root: (await window.stream.raw()).records.find(record => record.store === 'roots')!.value };
  });
  expect(result.latest.completion?.objectiveId).toBe('first-chest'); expect(result.steps).toBeLessThanOrEqual(128);
  expect(result.caps.sort()).toEqual(['maze.collect', 'maze.finish', 'maze.move', 'maze.observe', 'maze.prepare']);
  expect(result.maxReads).toBeLessThanOrEqual(46);
  expect(JSON.stringify(result.latest)).not.toContain(result.root.header.scopeId); expect(JSON.stringify(result.latest)).not.toContain('"seed"');
  await page.reload(); await page.waitForFunction(() => Boolean(window.agenticaStorage));
  expect(await page.evaluate(input => window.agenticaStorage.api.reconcileAgenticaAction('stream', input), result.finalAction)).toEqual(result.latest);
  console.log(`First chest: ${result.steps} commands, max ${result.maxReads} exact-key reads`);
});
