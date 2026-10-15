import { test, expect, arrived, prepare } from './canonical-decision.test';

const invalid = ['run', 'original-run', 'manifest', 'provider', 'event', 'observation', 'usage', 'adoption',
  'intent', 'epoch', 'state', 'stop', 'settled-usage', 'action'] as const;
for (const changed of invalid) test(`claim refuses changed ${changed} without retaining evidence or authority`, async ({ page }) => {
  await arrived(page); const before = await prepare(page);
  const r = await page.evaluate(async changed => {
    const c = window.canonicalDecision, p = await c.proof();
    if (changed === 'run') p.entry.wakeRunId = 'foreign';
    if (changed === 'original-run') p.started.runId = p.entry.wakeRunId = p.entry.action.runId;
    if (changed === 'manifest') p.started.manifestHash = `sha256:${'f'.repeat(64)}`;
    if (changed === 'provider') p.entry.request.provider = { ...p.entry.request.provider, model: 'foreign-model' };
    if (changed === 'event') p.entry.latestEvent!.eventId = 'foreign-event';
    if (changed === 'observation') p.entry.latestEvent!.observation.data = { foreign: true };
    if (changed === 'usage') p.entry.usage.providerCalls++;
    if (changed === 'adoption') p.entry.wakeAdoption = { adoptionId: 'foreign', nextSessionEpoch: p.entry.activeEpoch,
      observation: p.entry.latestEvent!.observation };
    if (changed === 'intent') p.intent.id = 'foreign-intent';
    if (changed === 'epoch') p.entry.activeEpoch = String(Number(p.entry.activeEpoch) + 1);
    if (changed === 'state') p.entry.state = 'parked';
    if (changed === 'stop') p.entry.stopDecision = p.entry.latestEvent;
    if (changed === 'settled-usage') (p.entry as unknown as Record<string, unknown>).settledUsage = p.entry.usage;
    if (changed === 'action') p.entry.action.arguments = { level: 999, spaceId: 'foreign', row: 9, column: 9 };
    const before = await c.dump(), error = await c.claim(p).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), state: await c.state() };
  }, changed);
  expect(r.error).toMatch(/^Error: Canonical storage:/); expect(r.unchanged).toBe(true); expect(r.state.claim).toBeNull();
  expect(r.state.intent).toEqual(before.intent); expect(r.state.launch).toEqual(before.launch); expect(r.state.selection).toEqual(before.selection);
});

test('a second well-shaped successor cannot replace the first claimed run', async ({ page }) => {
  await arrived(page); await prepare(page);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision; await c.claim(await c.proof()); const original = await c.state();
    const second = await c.proof(), before = await c.dump(), error = await c.claim(second).then(() => 'accepted', String);
    return { original, error, unchanged: before === await c.dump(), retained: await c.state() };
  });
  expect(r.error).toContain('decision successor changed'); expect(r.unchanged).toBe(true); expect(r.retained).toEqual(r.original);
});

test('typed same-epoch event defaults and UTC fractions do not change claim identity', async ({ page }) => {
  await arrived(page); const before = await prepare(page);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision, proof = await c.proof(), observation = proof.entry.latestEvent!.observation;
    observation.observedAt = observation.observedAt.replace(/\.(\d{3})Z$/, '.$10000+00:00');
    (observation as unknown as Record<string, unknown>).facts = null;
    await c.claim(proof); return { proof, state: await c.state() };
  });
  expect(r.state.claim!.data).toEqual({ intent: before.intent!.reference, started: r.proof.started, usage: r.proof.entry.usage,
    state: 'waking', settledUsage: null, stopped: false });
  expect(r.state.intent).toEqual(before.intent); expect(r.state.terminal).toEqual(before.terminal);
});
