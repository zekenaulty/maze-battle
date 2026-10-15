import { test, expect } from './canonical-decision-controller.test';

test('fixture starts at an earned completed operation without intent, claim or successor authority', async ({ page }) => {
  const seed = await page.evaluate(() => window.canonicalDecisionController.boot());
  const result = await page.evaluate(async () => {
    const c = window.canonicalDecisionController, before = await c.dump(), state = await c.state();
    return { state, unchanged: before === await c.dump(), calls: c.calls(), remote: c.remote() };
  });
  expect(result.state.progress).toMatchObject({ status: 'arrived', steps: 3, sequence: 3 });
  expect(result.state.operation.state).toBe('settled'); expect(result.state.terminal.kind).toBe('decision');
  expect(result.state.intent).toBeNull(); expect(result.state.claim).toBeNull(); expect(result.state.grant).toBeNull();
  expect(result.state.selection!.value.data).toMatchObject(seed.binding);
  expect(result.unchanged).toBe(true); expect(result.calls).toEqual([]); expect(result.remote.activations).toBe(0);
});
