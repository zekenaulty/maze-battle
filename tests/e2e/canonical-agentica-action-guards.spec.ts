import { expect, test } from '@playwright/test';
import type * as Fixture from './canonical-agentica-action-guards.fixture';
import type { capabilityExpiry } from './canonical-agentica-action-guards.expiry';
declare global { interface Window { actionGuards: typeof Fixture & { capabilityExpiry: typeof capabilityExpiry } } }

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5237' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-agentica-action-guards.html');
  await page.waitForFunction(() => !!window.actionGuards);
});

for (const capability of ['maze.observe', 'maze.navigate'] as const) {
  for (const kind of ['cancel', 'move'] as const) {
    test(`${kind} between reservation and ${capability} refuses effects and leaves original pending`, async ({ page }) => {
      const r = await page.evaluate(({ kind, capability }) => window.actionGuards.invalidated(kind, capability), { kind, capability });
      expect(r.rejected).toMatch(kind === 'cancel' ? /guard changed/ : /publication|checkpoint/);
      expect(r.unchanged).toBe(true); expect(r.moved).toBe(kind === 'move'); expect(r.pending).toBe(true);
      expect(r.operation).toBeNull(); expect(r.destination).toBeNull(); expect(r.repeat).toBe('unresolved'); expect(r.recovered).toBeNull();
    });
  }
  for (const separate of [false, true]) {
    test(`${capability} concurrent reservations/calls across ${separate ? 'two hook instances' : 'one hook instance'} commit once`, async ({ page }) => {
      const r = await page.evaluate(({ separate, capability }) => window.actionGuards.concurrent(separate, capability), { separate, capability });
      expect(r.dispositions).toContain('applied'); expect(r.dispositions.every(d => d === 'applied' || d === 'unresolved')).toBe(true);
      expect(r.commits).toBe(1); expect(r.submissions).toBe(1); expect(r.resolvedExact).toBe(true);
      expect(r.exactReplay).toBe(true); expect(r.replayUnchanged).toBe(true);
      expect(r.completed?.beforeRevision).toBe(r.publicationRevision);
      if (capability === 'maze.navigate') {
        expect(r.operation?.id).toBe(r.completed?.operation?.operationId); expect(r.operation?.state).toBe('admitted');
        expect(r.destination?.revision).toBe(r.resultSourceRevision); expect(r.completed?.afterRevision).toBe(r.resultSourceRevision);
        expect(r.completed?.completion).toBeUndefined();
      } else {
        expect(r.completed?.afterRevision).toBe(r.publicationRevision); expect(r.completed?.observation?.revision).toBe(r.publicationRevision);
        expect(r.operation).toBeNull(); expect(r.destination).toBeNull();
      }
    });
  }
}

test('same SDK key with changed fingerprint is rejected by pending save, execution and reconciliation', async ({ page }) => {
  const r = await page.evaluate(() => window.actionGuards.changedFingerprint());
  expect(r.sameKey).toBe(true); expect(r.errors).toHaveLength(3);
  for (const error of r.errors) expect(error).toMatch(/original input changed|original action input changed/);
  expect(r.unchanged).toBe(true); expect(r.pending).toBe(true); expect(r.operationBefore).toBeNull(); expect(r.original).toBe('applied');
});

for (const phase of ['queued', 'commit'] as const) {
  test(`action deadline tightened below kernel default expires at ${phase} without admitting navigation`, async ({ page }) => {
    const r = await page.evaluate(phase => window.actionGuards.capabilityExpiry(phase), phase);
    expect(r.expired).toBe(true); expect(r.rejected).toContain('deadline expired');
    expect(r.reservedDeadline).toBe(r.deadline); expect(r.effectDeadline).toBe(phase === 'commit' ? r.deadline : null);
    expect(r.revisionDelta).toBe(phase === 'queued' ? 1 : 0); expect(r.gameUnchanged).toBe(true);
    expect(r.pending).toBe(true); expect(r.operation).toBeNull(); expect(r.destination).toBeNull();
  });
}

test('completed original replays after grant cancellation and session stop with zero writes', async ({ page }) => {
  const r = await page.evaluate(() => window.actionGuards.completedAfterStop());
  expect(r.status).toBe('completed'); expect(r.exact).toBe(true); expect(r.unchanged).toBe(true); expect(r.writes).toBe(0);
  expect(r.rejected).toContain('SDK cannot manufacture');
});

test('hook binding, SDK record and nested action arguments belong to their submission', async ({ page }) => {
  const r = await page.evaluate(() => window.actionGuards.capturedInputs());
  expect(r.disposition).toBe('applied'); expect(r.original).toBe(true); expect(r.target).toMatchObject({ target: r.expectedTarget });
});
