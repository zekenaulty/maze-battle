import { test, expect } from '@playwright/test';
import { ServiceProcess, browserOrigin, serviceOrigin } from '../agentica-start-service/service.mjs';
import { LiveBudget } from '../live-corpus/budget.mjs';
import { observeWire } from '../live-corpus/wire.mjs';
import type { HostStartEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type {} from './canonical-start-service.live-monitor.fixture';

const service = new ServiceProcess(process.env.MAZE_START_SERVICE_DLL, process.env.MAZE_START_SERVICE_STORAGE, process.env.MAZE_START_SERVICE_LOG);
test.beforeAll(() => service.start());
test.afterAll(() => service.stop());

for (const scenario of ['completed', 'missing', 'cancelled'] as const)
  test(`live monitor transport: ${scenario} usage through the real Lab and browser SDK`, async ({ page, context }, info) => {
    const budget = new LiveBudget(), wire = observeWire(page, budget, serviceOrigin), forbidden: string[] = [];
    await context.route('**/*', route => {
      const origin = new URL(route.request().url()).origin;
      if ([browserOrigin, serviceOrigin].includes(origin)) return route.continue();
      forbidden.push(route.request().url()); return route.abort();
    });
    await page.goto('/tests/e2e/canonical-start-service.live-monitor.html');
    await page.waitForFunction(() => !!window.monitorTransport);
    budget.begin();
    const started = await page.evaluate(scenario => window.monitorTransport.start(scenario), scenario);
    let stopped: HostStartEntry | undefined;
    try {
      if (scenario === 'cancelled') {
        await expect.poll(() => budget.snapshot().calls).toBe(1);
        expect(() => budget.check({ admission: true })).toThrow(/Reconcile/);
        stopped = await page.evaluate(() => window.monitorTransport.stop());
      }
      await expect.poll(() => budget.snapshot().attempts[0]?.terminal).toBe(scenario === 'cancelled' ? 'cancelled' : 'completed');
      const runs = await fetch(serviceOrigin + '/api/runs').then(response => response.json());
      budget.reconcileService(runs, new Set([started.runId]));
      expect(budget.snapshot().calls).toBe(1);
      if (scenario === 'completed') {
        const state = budget.check({ admission: true });
        expect(state.inputTokens).toBe(4201); expect(state.outputTokens).toBe(681); expect(state.thinkingTokens).toBe(423);
        expect(state.telemetryDrops[started.runId]).toBeGreaterThan(0);
        await expect.poll(() => wire.received.some(({ frame }) => frame.type === 'outcome')).toBe(true);
        expect(wire.received.filter(({ frame }) => frame.type === 'action.request')).toHaveLength(1);
      } else {
        expect(() => budget.check({ admission: true })).toThrow(scenario === 'missing' ? /unknown/ : /cancelled/);
        expect(budget.snapshot().attempts[0].usage).toBeNull();
        expect(budget.snapshot().unresolved).toHaveLength(1);
      }
      expect(wire.errors).toEqual([]); expect(forbidden).toEqual([]);
    } finally {
      stopped ??= await page.evaluate(() => window.monitorTransport.stop());
      expect(stopped.runId).toBe(started.runId);
      expect(stopped.attemptId).toBe(started.startAdmission.attemptId);
      expect(stopped.acceptedRequestHash).toBe(started.startAdmission.acceptedRequestHash);
      expect(stopped.terminal).toMatchObject({ reason: 'stopped', usage: { providerCalls: 1 }, usageUnknown: false });
      expect(wire.sent.filter(({ frame }) => frame.type === 'start.durable')).toHaveLength(1);
      expect(wire.sent.filter(({ frame }) => frame.type === 'operation.wake')).toEqual([]);
      const proof = await fetch(serviceOrigin + '/fixture/proof').then(response => response.json());
      expect(proof.paidProviderCalls).toBe(0);
      await info.attach('live-monitor-transport.json', { contentType: 'application/json', body: JSON.stringify({
        scenario, started, stopped, budget: budget.snapshot(), wire, proof, forbidden,
        evidenceLevel: 'Injected provider-free stream, actual planner/Lab/WebSocket/SDK. Not M4, model or billing proof.',
      }) });
    }
  });
