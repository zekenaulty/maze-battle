import { test, expect, arrived, prepare } from './canonical-decision.test';

test('same-epoch second-window draft preserves explicit wake observation without issuing an action', async ({ page }) => {
  const first = await arrived(page), initial = await prepare(page);
  const r = await page.evaluate(async () => {
    const c = window.canonicalDecision, p = await c.proof(); await c.claim(p); const s = await c.state(), before = await c.dump();
    const source = { started: p.started, binding: { grant: s.selection!.value.data.grant, publication: s.intent!.data.publication },
      request: { ...s.launch.acceptedStart, observation: s.intent!.data.event.observation }, usage: p.entry.usage };
    const draft = c.draftWindow(source); source.request.observation.data = { changed: true };
    return { p, draft, state: s, unchanged: before === await c.dump() };
  });
  expect(r.unchanged).toBe(true); expect(r.draft.action.sessionEpoch).toBe(first.action.sessionEpoch);
  expect(r.draft.action.runId).toBe(r.p.started.runId); expect(r.draft.action.runId).not.toBe(first.action.runId);
  expect(r.draft.source.request).toEqual({ ...initial.launch.acceptedStart, observation: initial.intent!.data.event.observation });
  expect(r.draft.source.request.observation).not.toEqual(first.entry.request.observation);
  expect(r.draft.action.expectedRevision).toBe(initial.intent!.publication.wireRevision);
  expect(r.draft.source.request.provider).toEqual(first.entry.request.provider);
  expect(r.state.selection).toEqual(initial.selection); expect(r.state.launch.grant).toEqual(initial.launch.grant);
});

test('first-window history reads report charged work under unchanged default budgets', async ({ page }) => {
  const first = await arrived(page); await prepare(page);
  const r = await page.evaluate(async first => {
    const c = window.canonicalDecision; await c.claim(await c.proof()); const before = await c.dump();
    const costs = await c.readCosts(first); return { costs, unchanged: before === await c.dump() };
  }, first);
  console.log('Decision first-window read costs:', JSON.stringify(r.costs));
  expect(r.unchanged).toBe(true); expect(r.costs.limits).toEqual({ reads: 2048, writes: 512, bytes: 4 * 1024 * 1024 });
  for (const stats of Object.values(r.costs.reads)) {
    expect(stats.reads).toBeGreaterThan(0); expect(stats.reads).toBeLessThan(r.costs.limits.reads);
    expect(stats.readBytes).toBeLessThan(r.costs.limits.bytes); expect(stats.writes).toBe(0); expect(stats.writeBytes).toBe(0);
  }
});
