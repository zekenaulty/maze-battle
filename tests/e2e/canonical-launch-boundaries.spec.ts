import { expect, test } from './canonical-launch.test';
import type { JsonObject } from '../../src/persistence/canonical/types';

for (const phase of ['admit', 'announce'] as const) test(`${phase} snapshots all caller input before its first await`, async ({ page }) => {
  const r = await page.evaluate(async phase => {
    const c = window.canonicalLaunch, binding = await c.seed();
    if (phase === 'announce') { await c.admit(binding); await c.transition('dispatch'); }
    const current = phase === 'announce' ? (await c.readLaunch()).value! : null;
    const head = (await c.readCanonicalHead()).head;
    const request = phase === 'admit' ? c.command(head, 'operation.admit', { operationId: c.launchGuardId('launch'), binding, terminalBytes: 128 * 1024, ackPolicy: 'verified-host' })
      : c.command(head, 'agentica.launch.announce', { launchId: 'launch', dispatch: { ...current!.dispatch!.ref },
        ...c.launchProofFixture(current!.binding.start, current!.dispatch!.source.attemptId) });
    const original = structuredClone(request);
    if (phase === 'admit') await c.operateCanonical(request, 'admit', async tx => {
      const work = c.retainLaunchAdmission(tx, request);
      ((request.input as JsonObject).binding as JsonObject).endpoint = 'changed'; request.expected.owner = 'changed'; tx.head.owner = 'changed'; return work;
    });
    else await c.executeCanonical(request, async tx => {
      const work = c.retainLaunchTransition(tx, request);
      ((request.input as JsonObject).started as JsonObject).runId = 'changed'; ((request.input as JsonObject).dispatch as JsonObject).id = 'changed';
      ((request.input as JsonObject).admission as JsonObject).acceptedRequestHash = `sha256:${'d'.repeat(64)}`;
      request.expected.owner = 'changed'; tx.head.owner = 'changed'; return work;
    });
    const read = await c.readLaunch();
    return { original, source: phase === 'admit' ? read.value!.state.source : read.value!.run!.source, binding: read.value!.binding };
  }, phase);
  expect(r.source).toEqual(r.original); expect(r.binding.endpoint).not.toBe('changed');
});

test('the transaction grant gate owns action, publication and grant refs while awaiting live authority', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const current = (await c.readLaunch()).value!, run = current.run!.value.data.started;
    const action = { ...c.protocolAction(current.publication.wireRevision), runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch,
      manifestHash: run.manifestHash, capabilityId: 'maze.observe', deadlineAt: '2099-01-01T00:00:00.000Z' };
    const ref = { ...current.grant!.ref }, publication = { ...current.binding.publication };
    const result = await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.gate'), async tx => {
      const work = c.assertLaunchGrant(tx, ref, action, publication);
      ref.id = 'changed'; publication.id = 'changed'; action.arguments.row = 999; action.runId = 'changed'; tx.head.owner = 'changed';
      return { launchId: (await work).launchId };
    });
    return result.receipt.result;
  });
  expect(r).toEqual({ launchId: 'launch' });
});

for (const changed of ['runId', 'manifestHash', 'sessionEpoch', 'capabilityId', 'deadlineAt', 'expectedRevision'] as const)
  test(`grant rejects changed action ${changed} without an effect`, async ({ page }) => {
    const r = await page.evaluate(async changed => {
      const c = window.canonicalLaunch; await c.ready(); const current = (await c.readLaunch()).value!, run = current.run!.value.data.started;
      const action = { ...c.protocolAction(current.publication.wireRevision), runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch,
        manifestHash: run.manifestHash, capabilityId: 'maze.observe', deadlineAt: '2099-01-01T00:00:00.000Z' };
      if (changed === 'expectedRevision') action.expectedRevision++;
      else action[changed] = changed === 'manifestHash' ? `sha256:${'b'.repeat(64)}` : changed === 'deadlineAt' ? '2000-01-01T00:00:00.000Z' : 'changed';
      const before = await c.dump(), error = await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.gate'), async tx => {
        await c.assertLaunchGrant(tx, current.grant!.ref, action, current.binding.publication); await tx.pages.set('world', 'fixture/effect', true); return true;
      }).then(() => 'unexpected success', String);
      return { before, after: await c.dump(), error };
    }, changed);
    expect(r.error).toMatch(/^Error:/); expect(r.after).toEqual(r.before);
  });

test('world changes stale the old publication; a new earned publication does not rewrite the original launch', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const original = (await c.readLaunch()).value!;
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.world'), async tx => { await tx.pages.set('world', 'fixture/world', true); return true; });
    const before = await c.dump(), stale = await c.gate().catch(String), after = await c.dump(), pub = await c.publish(), run = original.run!.value.data.started;
    const action = { ...c.protocolAction(pub.head.revision), runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch,
      manifestHash: run.manifestHash, capabilityId: 'maze.observe', deadlineAt: '2099-01-01T00:00:00.000Z' };
    await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.current'), async tx => {
      await c.assertLaunchGrant(tx, original.grant!.ref, action, pub.ref); return true;
    });
    return { before, after, stale, original, retained: (await c.readLaunch()).value! };
  });
  expect(String(r.stale)).toContain('publication'); expect(r.after).toEqual(r.before); expect(r.retained).toEqual(r.original);
});

test('transaction-level composition rejects operation-name aliases before retaining any source', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.admit(await c.seed());
    const request = c.command((await c.readCanonicalHead()).head, 'xxxxxxxxxxxxxxxxdispatch', { launchId: 'launch' });
    const before = await c.dump(), error = await c.executeCanonical(request, tx => c.retainLaunchTransition(tx, request)).catch(String);
    return { before, after: await c.dump(), error };
  });
  expect(String(r.error)).toContain('invalid launch transition'); expect(r.after).toEqual(r.before);
});
