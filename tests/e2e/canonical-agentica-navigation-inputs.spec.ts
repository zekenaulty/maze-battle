import { expect, test } from './canonical-agentica.test';
import type { AgenticaResult } from '../../src/services/agentica/contracts';
import type { JsonObject } from '../../src/persistence/canonical/types';

test('hook creation snapshots the action and synchronously returned SDK results before yielding', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
    const identity = await c.prepareAction(seeded.action); let original: AgenticaResult | undefined;
    const hooks = c.navigationActionHooks(identity, view => {
      const result = n.result(seeded.action, view); original = structuredClone(result);
      queueMicrotask(() => { result.summary = 'changed'; result.observation!.data.position = 'changed'; result.afterRevision = 999; });
      return result;
    });
    identity.action.arguments.target = 'changed after hook creation';
    await n.navigation.executeNavigationCommand(await n.admission(seeded.target), { host: hooks });
    return { retained: (await c.read(seeded.action)).value!, original, action: seeded.action };
  });
  expect(r.retained.original.action).toEqual(r.action); expect(r.retained.result).toEqual(r.original);
});

test('hook preparation and commit own metadata before awaited work or result builder mutation', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
    const identity = await c.prepareAction(seeded.action); let original: AgenticaResult | undefined;
    const hook = c.navigationActionHooks(identity, view => {
      const result = n.result(seeded.action, view); original = structuredClone(result);
      view.head.roots.world = 'changed'; view.request.attemptId = 'changed';
      (view.request.input as JsonObject).operationId = 'changed'; view.operation.id = 'changed';
      return result;
    });
    const outcome = await n.navigation.executeNavigationCommand(await n.admission(seeded.target), { host: {
      prepare: view => {
        const work = hook.prepare(view); view.head.roots.world = 'changed'; view.request.attemptId = 'changed'; return work;
      }, commit: hook.commit,
    } });
    return { outcome, retained: (await c.read(seeded.action)).value!, original };
  });
  expect(r.retained.result).toEqual(r.original); expect(r.outcome.receipt.attemptId).not.toBe('changed');
});

test('appendExecution snapshots caller input before the existence check and witnesses that exact body', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
    const outcome = await n.navigation.executeNavigationCommand(await n.admission(seeded.target), { host: {
      prepare: async () => {}, commit: async view => {
        const value = { input: { row: -5 } }, work = view.appendExecution('agentica/events/fixture', value);
        value.input.row = 999; return { event: await work };
      },
    } });
    const row = (await c.readCanonical(p => p.get('execution', 'agentica/events/fixture'))).value!;
    return { row, result: outcome.receipt.result, witness: c.canonicalJson(row) };
  });
  expect(r.row.value).toEqual({ input: { row: -5 } });
  expect(r.result).toMatchObject({ host: { event: { recordWitness: r.witness } } });
});

test('already-mutated hook identities and caught invalid append inputs never commit navigation work', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
    const identity = await c.prepareAction(seeded.action); identity.action.arguments.target = 'changed';
    let creation = 'unexpected success';
    try { c.navigationActionHooks(identity, view => n.result(seeded.action, view)); } catch (error) { creation = String(error); }
    const before = await c.dump(), error = await n.navigation.executeNavigationCommand(await n.admission(seeded.target), { host: {
      prepare: async () => {}, commit: async view => {
        const value: JsonObject = {}; value.self = value;
        await view.appendExecution('agentica/events/fixture', value).catch(() => undefined); return {};
      },
    } }).then(() => 'unexpected success', String);
    return { creation, error, before, after: await c.dump() };
  });
  expect(r.creation).toContain('prepare the exact original'); expect(r.error).toContain('not usable'); expect(r.after).toBe(r.before);
});
