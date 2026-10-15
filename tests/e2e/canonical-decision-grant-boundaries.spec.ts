import { test, expect, arrived, prepare } from './canonical-decision.test';

for (const changed of ['initial-observation', 'resolved-model']) test(`successor confirmation rejects ${changed} without a partial confirmation`, async ({ page }) => {
  const first = await arrived(page); await prepare(page);
  const r = await page.evaluate(async ({ first, changed }) => {
    const c = window.canonicalDecision, proof = await c.proof(); await c.claim(proof); await c.grant();
    const grant = (await c.readGrant())!, selected = (await c.state()).selection!;
    const second = await c.seedWindow({ started: proof.started, request: grant.start, usage: proof.entry.usage,
      binding: { grant: selected.value.data.grant, publication: selected.value.data.publication } });
    const request = structuredClone(second.entry.request);
    if (changed === 'initial-observation') request.observation = first.entry.request.observation;
    else request.provider!.model = 'foreign-model';
    const before = await c.dump(), error = await c.confirm(request).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), second };
  }, { first, changed });
  expect(r.error).toContain('service operation differs from original request'); expect(r.unchanged).toBe(true);
  expect(r.second.action.sessionEpoch).toBe(first.action.sessionEpoch);
  expect(r.second.entry.request.provider).toEqual(first.entry.request.provider);
});

for (const state of ['continued', 'completed', 'blocked', 'cancelled', 'stopped']) test(`historical ${state} claim cannot mint an executable grant`, async ({ page }) => {
  await arrived(page); await prepare(page);
  const r = await page.evaluate(async state => {
    const c = window.canonicalDecision, proof = await c.proof(); proof.entry.state = state === 'stopped' ? 'cancelled' : state;
    if (state === 'stopped') proof.entry.stopDecision = structuredClone(proof.entry.latestEvent!);
    else Object.assign(proof.entry, { settledUsage: { ...proof.entry.usage, continuations: proof.entry.usage.continuations + 1 } });
    await c.claim(proof); const before = await c.dump(), history = await c.state();
    const error = await c.grant().then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), history, after: await c.state(), grant: await c.readGrant() };
  }, state);
  expect(r.error).toContain('successor claim is not executable'); expect(r.unchanged).toBe(true);
  expect(r.after).toEqual(r.history); expect(r.grant).toBeNull();
});
