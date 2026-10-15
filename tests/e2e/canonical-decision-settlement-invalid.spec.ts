import { test, expect, arrived, prepare } from './canonical-decision.test';

for (const state of ['continued', 'completed', 'blocked', 'cancelled'])
  test(`${state} without settled usage or exact Stop remains unknown and cannot be retained`, async ({ page }) => {
    await arrived(page); await prepare(page);
    const r = await page.evaluate(async state => {
      const c = window.canonicalDecision, p = await c.proof(); p.entry.state = state;
      const before = await c.dump(), error = await c.claim(p).then(() => 'accepted', String);
      return { error, unchanged: before === await c.dump(), state: await c.state() };
    }, state);
    expect(r.error).toContain('decision settlement evidence missing'); expect(r.unchanged).toBe(true); expect(r.state.claim).toBeNull();
  });

for (const changed of ['steps', 'providerCalls', 'continuations', 'negative', 'fraction', 'missing', 'extra', 'unsafe', 'waking'])
  test(`settled usage rejects ${changed} without changing evidence or authority`, async ({ page }) => {
    await arrived(page); const before = await prepare(page);
    const r = await page.evaluate(async changed => {
      const c = window.canonicalDecision, p = await c.proof(); p.entry.state = changed === 'waking' ? 'waking' : 'completed';
      const usage: Record<string, number> = { ...p.entry.usage, continuations: p.entry.usage.continuations + 1 };
      if (changed === 'steps' || changed === 'providerCalls') usage[changed] = p.entry.usage[changed] - 1;
      if (changed === 'continuations') usage.continuations = p.entry.usage.continuations;
      if (changed === 'negative') usage.refinements = -1;
      if (changed === 'fraction') usage.steps += 0.5;
      if (changed === 'missing') delete usage.steps;
      if (changed === 'extra') usage.invented = 1;
      if (changed === 'unsafe') usage.steps = Number.MAX_SAFE_INTEGER + 1;
      Object.assign(p.entry, { settledUsage: usage });
      const before = await c.dump(), error = await c.claim(p).then(() => 'accepted', String);
      return { error, unchanged: before === await c.dump(), state: await c.state() };
    }, changed);
    expect(r.error).toMatch(/^Error: Canonical storage:/); expect(r.unchanged).toBe(true); expect(r.state.claim).toBeNull();
    expect(r.state.selection).toEqual(before.selection); expect(r.state.intent).toEqual(before.intent);
  });

for (const changed of ['event', 'observation', 'state']) test(`Stop claim rejects changed ${changed}`, async ({ page }) => {
  await arrived(page); await prepare(page);
  const r = await page.evaluate(async changed => {
    const c = window.canonicalDecision, p = await c.proof(); p.entry.state = changed === 'state' ? 'completed' : 'cancelled';
    p.entry.stopDecision = structuredClone(p.entry.latestEvent!);
    if (changed === 'event') p.entry.stopDecision.eventId = 'foreign';
    if (changed === 'observation') p.entry.stopDecision.observation.data = { foreign: true };
    const before = await c.dump(), error = await c.claim(p).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump() };
  }, changed);
  expect(r.error).toContain('decision stop changed'); expect(r.unchanged).toBe(true);
});
