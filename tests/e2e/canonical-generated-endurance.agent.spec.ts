import { test, expect } from '@playwright/test';
import { attach as evidenceAttachment, audit, isolated, ready, state } from './canonical-generated-endurance.support';
import { peer } from './canonical-agentica-operations.terminal-support';
import type {} from './canonical-agentica-operations.fixture';

test('generated seed 781: active offline-admitted Agentica navigation fences a second actual-App tab', async ({ page, context }, info) => {
  const evidence: Record<string, unknown> = { seed: 781, custody: 'offline HTTP peer; no service, provider, SDK start/connect, or automatic adoption' };
  try {
    const boot = await isolated(context, page, 781); evidence.boot = boot;
    const initial = await state(page);
    const admitted = await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).begin());
    evidence.admitted = admitted;
    expect(admitted.funded.start.limits).toEqual({ maxSteps: 4, maxRefinements: 1, maxPlanContinuations: 1, timeoutSeconds: 60, actionTimeoutSeconds: 10 });
    expect(Buffer.byteLength(JSON.stringify(admitted.funded.start))).toBeLessThanOrEqual(3584);
    expect(Buffer.byteLength(JSON.stringify(admitted.entry.admission))).toBeLessThanOrEqual(4096);
    expect(Buffer.byteLength(JSON.stringify(admitted.entry.admission!.observation))).toBeLessThanOrEqual(2800);
    const remote = await peer(page, admitted.entry);
    evidence.deliveries = remote.deliveries; evidence.stops = remote.stops;
    await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).attach());
    const pulse = () => page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).pulse());
    expect(await pulse()).toEqual({ status: 'confirmed' });
    expect(await pulse()).toEqual({ status: 'custody-confirmed' });
    expect(await pulse()).toEqual({ status: 'advanced', sequence: 1 });
    expect(await pulse()).toEqual({ status: 'acknowledged', sequence: 2 });
    const active = await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).operation());
    if (active?.kind !== 'navigation') throw Error('Expected real navigation progress');
    expect(active.progress.steps).toBe(1); expect(active.progress.status).toBe('running');
    expect(active.acknowledgement).not.toBeNull(); evidence.active = active;
    const other = await context.newPage();
    const otherErrors: string[] = []; other.on('pageerror', error => otherErrors.push(error.message)); evidence.otherErrors = otherErrors;
    try {
      await other.goto('/'); await ready(other, false);
      await expect(other.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
      const before = await audit(page);
      await other.keyboard.press('ArrowRight'); await other.keyboard.press('m');
      await ready(other, false);
      const after = await audit(page); evidence.passive = { before, after };
      expect(after.head).toEqual(before.head); expect(after.receipts).toBe(before.receipts);
      expect((await state(other)).snapshot.gameId).toBe(initial.snapshot.gameId);
      expect(await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).operation())).toEqual(active);
      expect(otherErrors).toEqual([]);
    } finally { await other.close(); }
    const pulses: Awaited<ReturnType<typeof pulse>>[] = []; evidence.pulses = pulses;
    for (let n = 0; n < 16; n++) {
      const result = await pulse(); pulses.push(result);
      if (result.status === 'decision-required') break;
      if (n === 15) throw Error('Original navigation did not reach its decision within 16 pulses');
    }
    const arrived = await state(page); expect(arrived.checkpoint.position).toEqual(admitted.target);
    expect(arrived.inventory).toEqual(initial.inventory); expect(arrived.stash).toEqual(initial.stash);
    expect(arrived.quests).toEqual(initial.quests);
    const finished = await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).finish());
    evidence.finished = finished; expect(finished.forbiddenCalls).toBe(0);
    const final = await audit(page); evidence.final = final;
    expect(final.head.quota.reservations).toBe(0); expect(final.head.quota.reservedBytes).toBe(0);
    expect(remote.entry().usage.providerCalls).toBe(0);
    expect(boot.unexpected).toEqual([]); expect(boot.errors).toEqual([]);
  } finally {
    await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).close()).catch(() => {});
    await evidenceAttachment(info, 'generated-agentica-two-tab.json', evidence);
  }
});
