import { test, expect, arrived, prepare } from './canonical-decision.test';

test('two same-epoch windows use real hooks and confirm the explicit successor observation', async ({ page }) => {
  const first = await arrived(page), initial = await prepare(page);
  const next = await page.evaluate(async () => {
    const c = window.canonicalDecision, p = await c.proof(); await c.claim(p); await c.grant();
    const granted = (await c.readGrant())!, selected = (await c.state()).selection!;
    const expected = { ...granted.launch.acceptedStart, observation: (await c.state()).intent!.data.event.observation };
    const second = await c.seedWindow({ started: p.started, request: expected, usage: p.entry.usage,
      binding: { grant: selected.value.data.grant, publication: selected.value.data.publication } });
    await c.confirm(); return { granted, selected, second, expected, confirmed: await c.state() };
  });
  expect(next.second.action.runId).not.toBe(first.action.runId);
  expect(next.second.action.sessionEpoch).toBe(first.action.sessionEpoch);
  expect(next.granted.start).toEqual(next.expected);
  expect(next.granted.start.observation).not.toEqual(first.entry.request.observation);
  expect(next.confirmed.operation!.confirmation.data.entry.request).toEqual(next.expected);
  expect(next.confirmed.operation!.custodyAck).not.toBeNull();
  expect(next.second.binding.grant).toEqual(next.granted.record.ref);
  expect(next.second.binding.grant).not.toEqual(first.binding.grant);
  expect(next.selected.row.revision).toBe(next.granted.record.row.revision);
  expect(next.selected.source.attemptId).toBe(next.granted.record.source.attemptId);
  for (let step = 1; step <= 3; step++) {
    const progress = await page.evaluate(() => window.canonicalDecision.advance());
    expect(progress.steps).toBe(step); expect(progress.status).toBe(step === 3 ? 'arrived' : 'running');
  }
  await page.evaluate(() => window.canonicalDecision.settle());
  const secondIntent = await prepare(page);
  const end = await page.evaluate(async first => {
    const c = window.canonicalDecision; await c.claim(await c.proof()); await c.grant();
    const before = await c.dump(), replay = await c.replayWindow(first), grantRetry = await c.grantReplay(first);
    const historical = await c.state(first), current = await c.state();
    const costs = { first: await c.readCosts(first), second: await c.readCosts() };
    return { replay, grantRetry, historical, current, costs, unchanged: before === await c.dump(), grant: await c.readGrant() };
  }, first);
  expect(end.unchanged).toBe(true); expect(end.replay).toEqual(first.entry.admission);
  expect(end.grantRetry?.replayed).toBe(true);
  expect(end.historical.operation).toEqual(initial.operation); expect(end.historical.terminal).toEqual(initial.terminal);
  expect(end.historical.intent).toEqual(initial.intent); expect(end.historical.launch).toEqual(initial.launch);
  expect(end.current.selection!.value.data.grant).toEqual(end.grant!.record.ref);
  expect(end.current.selection!.value.data.grant).not.toEqual(next.selected.value.data.grant);
  expect(end.current.terminal).toEqual(secondIntent.terminal);
  expect(end.current.operation!.operation.state).toBe('settled');
  console.log('Decision two-window read costs:', JSON.stringify(end.costs));
  for (const window of Object.values(end.costs)) for (const stats of Object.values(window.reads)) {
    expect(stats.reads).toBeLessThan(window.limits.reads); expect(stats.readBytes).toBeLessThan(window.limits.bytes);
    expect(stats.writes).toBe(0); expect(stats.writeBytes).toBe(0);
  }
});

test('selection rejects a fresh action from the initial run without changing its readable history', async ({ page }) => {
  const first = await arrived(page); await prepare(page);
  const r = await page.evaluate(async first => {
    const c = window.canonicalDecision; await c.claim(await c.proof()); await c.grant();
    const before = await c.dump(), history = await c.state(first);
    const error = await c.seedWindow({ started: history.launch.run!.value.data.started, binding: first.binding,
      request: first.entry.request, usage: first.entry.usage }).then(() => 'accepted', String);
    return { error, unchanged: before === await c.dump(), history, after: await c.state(first) };
  }, first);
  expect(r.error).toContain('selected'); expect(r.unchanged).toBe(true); expect(r.after).toEqual(r.history);
});
