import { test, expect, arrived, prepare, reload } from './canonical-decision.test';

for (const adoption of ['missing', 'generic', 'before-claim'] as const) test(`new-owner successor refuses ${adoption} guard adoption atomically`, async ({ page }) => {
  const first = await arrived(page); await reload(page, first);
  await page.evaluate(() => window.canonicalDecision.startOwner()); await prepare(page);
  const r = await page.evaluate(async adoption => {
    const c = window.canonicalDecision, proof = await c.proof();
    if (adoption === 'before-claim') await c.adoptGuard();
    await c.claim(proof);
    if (adoption === 'generic') await c.adoptGuard(false);
    const before = await c.dump(), state = await c.state(), error = await c.grant().then(() => 'accepted', String);
    return { error, state, after: await c.state(), unchanged: before === await c.dump(), grant: await c.readGrant() };
  }, adoption);
  expect(r.error).not.toBe('accepted');
  if (adoption === 'missing') expect(r.error).toContain('current admitted launch custody');
  if (adoption === 'generic') expect(r.error).toContain('missing source receipt');
  if (adoption === 'before-claim') expect(r.error).toContain('guard adoption is not explicit');
  expect(r.unchanged).toBe(true); expect(r.after).toEqual(r.state); expect(r.grant).toBeNull();
  expect(r.after.operation!.operation.state).toBe('settled');
});

test('new-owner successor requires the decision-specific guard adoption after claim, never old navigation adoption', async ({ page }) => {
  const first = await arrived(page), original = await page.evaluate(() => window.canonicalDecision.state());
  await reload(page, first); await page.evaluate(() => window.canonicalDecision.startOwner()); await prepare(page);
  const r = await page.evaluate(async first => {
    const c = window.canonicalDecision, proof = await c.proof(); await c.claim(proof); const claimed = await c.state();
    const adopted = await c.adoptGuard(); await c.grant(); const granted = (await c.readGrant())!, beforeRead = await c.dump();
    const history = await c.state(first), readUnchanged = beforeRead === await c.dump(), selected = history.selection!;
    const expected = { ...first.entry.request, sessionEpoch: proof.started.sessionEpoch,
      observation: claimed.intent!.data.adoption!.observation };
    const second = await c.seedWindow({ started: proof.started, request: expected, usage: proof.entry.usage,
      binding: { grant: selected.value.data.grant, publication: selected.value.data.publication } });
    await c.confirm(); return { claimed, adopted, granted, history, readUnchanged, expected, second, confirmed: await c.state() };
  }, first);
  expect(r.readUnchanged).toBe(true); expect(r.granted.started.sessionEpoch).not.toBe(first.action.sessionEpoch);
  expect(r.adopted.attemptId).toBe(`${r.claimed.intent!.reference.id}:guard`);
  expect(r.adopted.beforeRevision).toBeGreaterThanOrEqual(r.claimed.claim!.row.revision);
  expect(r.adopted.result).toEqual({ operationId: first.launchGuard, phase: 'adopt' });
  expect(r.history.operation).toEqual(original.operation); expect(r.history.terminal).toEqual(original.terminal);
  expect(r.history.launch.grant).toEqual(original.launch.grant); expect(r.history.launch.run).toEqual(original.launch.run);
  expect(r.granted.start).toEqual(r.expected); expect(r.second.action.sessionEpoch).toBe(r.granted.started.sessionEpoch);
  expect(r.confirmed.operation!.confirmation.data.entry.request).toEqual(r.expected);
  expect(r.confirmed.operation!.custodyAck).not.toBeNull();
});
