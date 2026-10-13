import { expect, test } from './canonical-agentica.test';
import type { NavigationHostRefs } from '../../src/persistence/canonical/navigation/host';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import type { AgenticaAction } from '../../src/services/agentica/contracts';

test('real pending action and navigation admission share one witnessed result, exact across reload and takeover', async ({ page }) => {
  const first = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
    const outcome = await n.navigation.executeNavigationCommand(request, { host: await n.host(seeded.action) });
    const retained = (await c.read(seeded.action)).value!, host = (outcome.receipt.result as unknown as { host: NavigationHostRefs }).host;
    const row = (await c.readCanonical(p => p.get('execution', host.actionResult!.key))).value!;
    return { seeded, request, outcome, retained, host, row, witness: c.canonicalJson(row) };
  });
  expect(first.host.actionResult!.recordWitness).toBe(first.witness);
  expect(JSON.parse(first.host.actionResult!.recordWitness)).toEqual(first.row);
  expect(first.host.actionResult).toMatchObject({ key: first.retained.resultReference!.key, recordId: first.retained.resultReference!.id,
    revision: first.outcome.receipt.afterRevision, sourceAttemptId: first.request.attemptId });
  expect(first.outcome.head!.checkpoint.position).toEqual(first.seeded.start);
  expect(first.outcome.head!.allocations.trip).toBeDefined();
  await page.reload(); await page.waitForFunction(() => !!window.agenticaRecords);
  const recovered = await page.evaluate(async serialized => {
    const { action, request } = JSON.parse(serialized) as { action: AgenticaAction; request: CanonicalRequest };
    const c = window.agenticaRecords, n = await c.navigationFixture(); await c.takeover(); const before = await c.dump();
    const result = await c.reconcile(action), exact = await n.navigation.executeNavigationCommand(request, { host: {
      prepare: async () => { throw Error('Replay must not prepare'); }, commit: async () => { throw Error('Replay must not commit'); },
    } });
    return { result, exact, before, after: await c.dump() };
  }, JSON.stringify({ action: first.seeded.action, request: first.request }));
  expect(recovered.result.value).toEqual({ fingerprint: first.retained.original.fingerprint, status: 'completed', result: first.retained.result });
  expect(recovered.exact.receipt).toEqual(first.outcome.receipt); expect(recovered.exact.stats.writes).toBe(0);
  expect(recovered.after).toBe(recovered.before);
});

for (const area of ['world', 'knowledge', 'publication', 'checkpoint'] as const) test(`${area} changes reject a fresh fenced action before navigation movement`, async ({ page }) => {
  const r = await page.evaluate(async area => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
    await n.navigation.executeNavigationCommand(await n.admission(seeded.target));
    if (area === 'world' || area === 'knowledge') await c.change(area);
    else await c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.changed'), async tx => {
      if (area === 'publication') await tx.pages.set('execution', seeded.publication.reference.key, { replaced: true });
      else tx.setCheckpoint({ ...tx.head.checkpoint, facing: 'north' });
      return true;
    });
    const request = await n.advance(), hook = await n.host(seeded.action), before = await c.dump(); let commits = 0;
    const error = await n.navigation.executeNavigationCommand(request, { host: { ...hook, commit: async view => { commits++; return hook.commit(view); } } }).catch(String);
    return { error, commits, before, after: await c.dump(), destination: (await n.navigation.readDestination('trip')).value };
  }, area);
  expect(String(r.error)).toMatch(/publication|snapshot|source/); expect(r.commits).toBe(0); expect(r.after).toBe(r.before);
  expect(r.destination.progress.steps).toBe(0);
});

test('a post-movement callback sees earned evidence and an invalid result rolls movement back', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed();
    await n.navigation.executeNavigationCommand(await n.admission(seeded.target));
    const request = await n.advance(), identity = await c.prepareAction(seeded.action), before = await c.dump();
    let observed: unknown;
    const bad = c.navigationActionHooks(identity, view => { observed = view.checkpoint.position; return { ...n.result(seeded.action, view), actionId: 'changed' }; });
    const error = await n.navigation.executeNavigationCommand(request, { host: bad }).catch(String), after = await c.dump();
    const committed = await n.navigation.executeNavigationCommand(request, { host: await n.host(seeded.action) });
    return { error, observed, target: seeded.target, before, after, committed, retained: (await c.read(seeded.action)).value };
  });
  expect(String(r.error)).toContain('identity'); expect(r.observed).toEqual(r.target); expect(r.after).toBe(r.before);
  expect(r.committed.head!.checkpoint.position).toEqual(r.target);
  expect(r.retained!.result!.observation!.data.position).toEqual(r.target);
});

test('changed input and an already completed action never admit a replacement operation', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, n = await c.navigationFixture(), seeded = await n.seed(), request = await n.admission(seeded.target);
    const before = await c.dump(), changed = await n.navigation.executeNavigationCommand(request,
      { host: await n.host({ ...seeded.action, arguments: { target: 'changed' } }) }).catch(String), after = await c.dump();
    await n.navigation.executeNavigationCommand(request, { host: await n.host(seeded.action) });
    const committed = await c.dump(), duplicate = await n.navigation.executeNavigationCommand(await n.admission(seeded.target, 'other'),
      { host: await n.host(seeded.action) }).catch(String);
    return { before, after, changed, committed, final: await c.dump(), duplicate };
  });
  expect(String(r.changed)).toContain('input changed'); expect(r.after).toBe(r.before);
  expect(String(r.duplicate)).toContain('already has a result'); expect(r.final).toBe(r.committed);
});
