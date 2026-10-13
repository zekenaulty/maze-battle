import { expect, test } from './canonical-agentica.test';
import type { JsonObject } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';

for (const input of ['publication', 'request', 'head'] as const) test(`pending retention owns ${input} before awaiting`, async ({ page }) => {
  const r = await page.evaluate(async input => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    const identity = await c.prepareAction(action), request = c.command((await c.readCanonicalHead()).head, 'agentica.pending', { row: -5 });
    const original = structuredClone({ request, publication: pub.reference });
    await c.executeCanonical(request, async tx => {
      const work = c.retainPendingAction(tx, request, identity, pub.reference, 'readOnly');
      if (input === 'publication') { pub.reference.id = 'changed'; pub.reference.key = 'agentica/publications/changed'; }
      if (input === 'request') { (request.input as JsonObject).row = 999; request.attemptId = 'changed'; request.expected.owner = 'changed'; }
      if (input === 'head') { tx.head.roots.world = 'changed'; tx.head.checkpoint.facing = 'north'; }
      return (await work).receipt;
    });
    return { retained: (await c.read(action)).value!, original };
  }, input);
  expect(r.retained.original.sourceRequest).toEqual(r.original.request);
  expect(r.retained.original.publication).toEqual(r.original.publication);
});

for (const input of ['identity', 'result', 'request', 'head'] as const) test(`result retention owns ${input} before awaiting`, async ({ page }) => {
  const r = await page.evaluate(async input => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    await c.pending(action, pub.reference);
    const identity = await c.prepareAction(action), result = c.protocolResult(action), original = structuredClone(result);
    const request = c.command((await c.readCanonicalHead()).head, 'agentica.result', { row: -5 });
    await c.executeCanonical(request, async tx => {
      const work = c.retainActionResult(tx, request, identity, result);
      if (input === 'identity') identity.action.arguments.row = 999;
      if (input === 'result') { result.summary = 'changed'; result.observation!.data.row = 999; result.afterRevision = 999; }
      if (input === 'request') { (request.input as JsonObject).row = 999; request.attemptId = 'changed'; request.expected.owner = 'changed'; }
      if (input === 'head') { tx.head.roots.world = 'changed'; tx.head.checkpoint.facing = 'north'; }
      return (await work).receipt;
    });
    return { retained: (await c.read(action)).value!, original };
  }, input);
  expect(r.retained.result).toEqual(r.original);
});

test('publication snapshots head and request before validating earned evidence', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), request = c.command(head, 'agentica.publish', { row: -5 });
    const original = structuredClone(request);
    const outcome = await c.executeCanonical(request, async tx => {
      const work = c.retainPublication(tx, request);
      request.attemptId = 'changed'; (request.input as JsonObject).row = 999;
      tx.head.checkpoint.facing = 'north'; tx.head.roots.world = 'changed';
      return (await work).receipt;
    });
    const ref = (outcome.receipt.result as JsonObject).reference as unknown as ProtocolRef;
    return { head, original, publication: (await c.readCanonical(p => c.readPublication(p, ref))).value };
  });
  expect(r.publication.sourceRequest).toEqual(r.original); expect(r.publication.snapshot.checkpoint).toEqual(r.head.checkpoint);
  expect(r.publication.snapshot.roots).toEqual({ world: r.head.roots.world, knowledge: r.head.roots.knowledge });
});

for (const method of ['readAction', 'reconcileAction', 'readActionResult', 'readPublication'] as const)
  test(`${method} owns its identity and references before awaiting`, async ({ page }) => {
    const r = await page.evaluate(async method => {
      const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
      await c.pending(action, pub.reference); const result = c.protocolResult(action), completed = await c.complete(action, result);
      const identity = await c.prepareAction(action), before = await c.dump();
      const read = await c.readCanonical(async p => {
        const work = method === 'readAction' ? c.readAction(p, identity) : method === 'reconcileAction' ? c.reconcileAction(p, identity)
          : method === 'readActionResult' ? c.readActionResult(p, identity, completed.reference) : c.readPublication(p, pub.reference);
        identity.action.arguments.row = 999;
        completed.reference.id = 'changed'; completed.reference.key = 'agentica/actions/changed/result';
        pub.reference.id = 'changed'; pub.reference.key = 'agentica/publications/changed';
        return work;
      });
      return { read: read.value, before, after: await c.dump(), result };
    }, method);
    expect(r.after).toBe(r.before);
    if (method === 'readActionResult') expect(r.read).toEqual(r.result);
    else if (method !== 'readPublication') expect(r.read).toMatchObject({ result: r.result });
    else expect(r.read).toMatchObject({ kind: 'agentica-publication' });
  });
