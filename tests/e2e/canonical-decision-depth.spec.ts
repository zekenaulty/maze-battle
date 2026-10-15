import { test, expect, arrived, prepare } from './canonical-decision.test';

test('history reads stay bounded across three successor windows without recursive grant ancestry', async ({ page }) => {
  const first = await arrived(page); await prepare(page);
  const windows = await page.evaluate(async first => {
    const c = window.canonicalDecision, windows = [], original = await c.state(first);
    for (let window = 2; window <= 4; window++) {
      if (!(await c.state()).claim) await c.claim(await c.proof());
      await c.grant(); const state = await c.state(), grant = (await c.readGrant())!, selected = state.selection!;
      const seed = await c.seedWindow({ started: grant.started, request: grant.start, usage: state.claim!.data.usage,
        binding: { grant: selected.value.data.grant, publication: selected.value.data.publication } });
      await c.confirm();
      for (let step = 1; step <= 3; step++) {
        const progress = await c.advance(); if (progress.steps !== step) throw Error('Missing real navigation step');
      }
      await c.settle(); await c.prepare(await c.publish()); await c.claim(await c.proof());
      const before = await c.dump(), costs = await c.readCosts(), historical = await c.state(first);
      windows.push({ window, seed, costs, unchanged: before === await c.dump(), history: historical.operation,
        terminal: historical.terminal, original: original.operation, originalTerminal: original.terminal });
    }
    return windows;
  }, first);
  console.log('Decision successive-window read costs:', JSON.stringify(windows.map(({ window, costs }) => ({ window, costs }))));
  expect(new Set([first.action.runId, ...windows.map(w => w.seed.action.runId)]).size).toBe(4);
  for (const window of windows) {
    expect(window.seed.action.sessionEpoch).toBe(first.action.sessionEpoch); expect(window.unchanged).toBe(true);
    expect(window.history).toEqual(window.original); expect(window.terminal).toEqual(window.originalTerminal);
    for (const stats of Object.values(window.costs.reads)) {
      expect(stats.reads).toBeLessThan(window.costs.limits.reads); expect(stats.readBytes).toBeLessThan(window.costs.limits.bytes);
      expect(stats.writes).toBe(0); expect(stats.writeBytes).toBe(0);
    }
  }
  // Shared index layout can change physical reads; another ancestor must add no evidence lookups.
  expect(windows[1].costs.claimCalls.records).toBeGreaterThan(0);
  expect(windows[1].costs.claimCalls.receipts).toBeGreaterThan(0);
  expect(windows[2].costs.claimCalls).toEqual(windows[1].costs.claimCalls);
});
