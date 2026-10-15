import { test, expect, arrived, prepare, reload } from './canonical-decision.test';

for (const state of ['continued', 'completed', 'blocked', 'cancelled'])
  test(`already ${state} successor is retained as historical evidence without granting actions`, async ({ page }) => {
    const seed = await arrived(page), before = await prepare(page);
    const r = await page.evaluate(async state => {
      const c = window.canonicalDecision, p = await c.proof(), usage = p.entry.usage;
      const settledUsage = { steps: usage.steps + 2, refinements: usage.refinements,
        continuations: usage.continuations + 1, providerCalls: usage.providerCalls + 2 };
      p.entry.state = state; Object.assign(p.entry, { settledUsage });
      const receipt = await c.claim(p), claimed = await c.state(), exactBefore = await c.dump();
      const exact = await c.replay('agentica.operation.decision-claim'), exactUnchanged = exactBefore === await c.dump();
      await c.claim(p); const duplicate = await c.state(), beforeGate = await c.dump();
      const error = await c.gate(p).then(() => 'accepted', String);
      return { p, settledUsage, receipt, claimed, exact, exactUnchanged, duplicate, error, gateUnchanged: beforeGate === await c.dump() };
    }, state);
    expect(r.claimed.claim!.data).toEqual({ intent: before.intent!.reference, started: r.p.started, usage: r.p.entry.usage,
      state, settledUsage: r.settledUsage, stopped: false });
    expect(r.exact.replayed).toBe(true); expect(r.exact.receipt).toEqual(r.receipt); expect(r.exactUnchanged).toBe(true);
    expect(r.duplicate.claim).toEqual(r.claimed.claim); expect(r.error).toContain('outside launch grant'); expect(r.gateUnchanged).toBe(true);
    expect(r.claimed.launch).toEqual(before.launch); expect(r.claimed.selection).toEqual(before.selection);
    expect(r.claimed.operation).toEqual(before.operation); expect(r.claimed.terminal).toEqual(before.terminal);
    await reload(page, seed);
    const historical = await page.evaluate(async () => {
      const c = window.canonicalDecision, before = await c.dump(), state = await c.state();
      return { state, unchanged: before === await c.dump() };
    });
    expect(historical.state.claim).toEqual(r.claimed.claim); expect(historical.unchanged).toBe(true);
  });

test('exact cancelled Stop evidence is retained without inventing settled usage', async ({ page }) => {
  await arrived(page); const before = await prepare(page);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision, p = await c.proof(); p.entry.state = 'cancelled';
    p.entry.stopDecision = structuredClone(p.entry.latestEvent!);
    p.entry.stopDecision.observation.observedAt = p.entry.stopDecision.observation.observedAt.replace(/\.(\d{3})Z$/, '.$10000+00:00');
    (p.entry.stopDecision.observation as unknown as Record<string, unknown>).facts = null;
    await c.claim(p); return { p, state: await c.state() };
  });
  expect(r.state.claim!.data).toEqual({ intent: before.intent!.reference, started: r.p.started, usage: r.p.entry.usage,
    state: 'cancelled', settledUsage: null, stopped: true });
  expect(r.state.selection).toEqual(before.selection); expect(r.state.launch).toEqual(before.launch);
  expect(r.state.terminal).toEqual(before.terminal); expect(r.state.operation).toEqual(before.operation);
});

test('claim owns started, request, entry and intent before its first await', async ({ page }) => {
  await arrived(page); await prepare(page);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision, p = await c.proof(), original = structuredClone(p);
    await c.claim(p, true); return { original, mutated: p, state: await c.state() };
  });
  expect(r.mutated.started.runId).toBe('foreign'); expect(r.state.claim!.data).toEqual({ intent: r.original.intent,
    started: r.original.started, usage: r.original.entry.usage, state: 'waking', settledUsage: null, stopped: false });
  expect(r.state.claim!.source.operation).toBe('agentica.operation.decision-claim');
  expect(r.state.claim!.source.input).toMatchObject({ intent: r.original.intent, started: r.original.started, entry: r.original.entry });
  expect(r.state.claim!.source.expected.owner).toBe(r.state.head.owner);
});
