import { test, expect } from './canonical-launch.test';

test('same-transaction caller grant selection fences the initial grant without rewriting its history', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const launch = (await c.readLaunch()).value!;
    const previous = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!;
    const request = c.command((await c.readCanonicalHead()).head, 'fixture.grant-selection');
    const outcome = await c.executeCanonical(request, async tx => {
      const writer = c.launchWriter(tx, request);
      // Only exercises the composition contract, not a successor-grant policy.
      const grant = await writer.put('agentica/fixture/caller-grant', 'fixture-caller-grant', 'launch', { predecessor: launch.grant!.ref });
      await c.retainPublicationSelection(tx, request, { launchId: 'launch', grant,
        publication: previous.value.data.publication, previousSelection: previous.ref }, writer);
      return { ...writer.receipt(), callerProof: 'separate policy slot' };
    });
    const selected = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!;
    const before = await c.dump(), old = await c.gate().catch(String), after = await c.dump();
    const pub = await c.publish(), beforeRenew = await c.dump();
    const renew = await c.executePublicationRenewal(c.command((await c.readCanonicalHead()).head, 'agentica.publication.renew',
      { launchId: 'launch', grant: { ...launch.grant!.ref }, publication: { ...pub.ref }, previousSelection: { ...selected.ref } })).catch(String);
    const replay = await c.executeCanonical(request, async () => { throw Error('exact replay must not execute writer'); });
    return { launch, retained: (await c.readLaunch()).value, previous, selected, old, before, after,
      renew, beforeRenew, afterRenew: await c.dump(), outcome, replay };
  });
  expect(r.selected.value.data.publication).toEqual(r.previous.value.data.publication);
  expect(r.selected.value.data.grant).not.toEqual(r.previous.value.data.grant);
  expect(r.retained).toEqual(r.launch); expect(String(r.old)).toContain('not selected'); expect(r.after).toEqual(r.before);
  expect(String(r.renew)).toContain('not selected'); expect(r.afterRenew).toEqual(r.beforeRenew);
  expect(r.replay.replayed).toBe(true); expect(r.replay.receipt).toEqual(r.outcome.receipt);
});

test('unselected P1 is inert; same-world R2 supersedes R1 only after explicit renewal', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const launch = (await c.readLaunch()).value!;
    const selected = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!, beforePub = (await c.readCanonicalHead()).head;
    const pub = await c.publish(), afterPub = (await c.readCanonicalHead()).head;
    await c.gate();
    const original = await c.readCanonical(p => c.readPublicationSelectionRecord(p, selected.ref));
    const request = c.command((await c.readCanonicalHead()).head, 'agentica.publication.renew',
      { launchId: 'launch', grant: { ...launch.grant!.ref }, publication: { ...pub.ref }, previousSelection: { ...selected.ref } });
    const renewed = await c.executePublicationRenewal(request), beforeOld = await c.dump(), refused = await c.gate().catch(String);
    const afterOld = await c.dump(), current = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!;
    const beforeRead = await c.dump(); await c.readLaunch(); await c.readCanonical(p => c.readPublicationSelection(p, 'launch'));
    const historical = (await c.readCanonical(p => c.readPublicationSelectionRecord(p, selected.ref))).value;
    const replay = await c.executePublicationRenewal(request);
    return { selected, current, original: original.value, historical, beforePub, afterPub, beforeOld, afterOld,
      refused, renewed, replay, beforeRead, afterRead: await c.dump(), launch, retained: (await c.readLaunch()).value };
  });
  expect(r.afterPub.roots.world).toBe(r.beforePub.roots.world); expect(r.afterPub.roots.knowledge).toBe(r.beforePub.roots.knowledge);
  expect(r.afterPub.checkpoint).toEqual(r.beforePub.checkpoint); expect(r.afterPub.roots.execution).not.toBe(r.beforePub.roots.execution);
  expect(r.current.value.data.previousSelection).toEqual(r.selected.ref);
  expect(r.current.value.data.publication).not.toEqual(r.selected.value.data.publication);
  expect(String(r.refused)).toContain('not selected'); expect(r.beforeOld).toEqual(r.afterOld);
  expect(r.historical).toEqual(r.original); expect(r.launch).toEqual(r.retained);
  expect(r.replay.replayed).toBe(true); expect(r.replay.receipt).toEqual(r.renewed.receipt);
  expect(r.afterRead).toEqual(r.beforeRead);
});

test('concurrent renewal admits exactly one selection; stale predecessor and stale owner cannot renew', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch; await c.ready(); const launch = (await c.readLaunch()).value!;
    const selected = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!, p2 = await c.publish(), p3 = await c.publish();
    const head = (await c.readCanonicalHead()).head;
    const make = (publication: typeof p2.ref) => c.command(head, 'agentica.publication.renew',
      { launchId: 'launch', grant: { ...launch.grant!.ref }, publication: { ...publication }, previousSelection: { ...selected.ref } });
    const results = await Promise.allSettled([c.executePublicationRenewal(make(p2.ref)), c.executePublicationRenewal(make(p3.ref))]);
    const before = await c.dump(), stale = await c.executePublicationRenewal({ ...make(p3.ref), expected: c.canonicalFence((await c.readCanonicalHead()).head) }).catch(String);
    const unchanged = (await c.dump()).content === before.content;
    await c.takeover(); const publication = await c.publish(), current = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!;
    const ownedBefore = await c.dump(), owner = await c.executePublicationRenewal(c.command((await c.readCanonicalHead()).head, 'agentica.publication.renew',
      { launchId: 'launch', grant: { ...launch.grant!.ref }, publication: { ...publication.ref }, previousSelection: { ...current.ref } })).catch(String);
    return { statuses: results.map(r => r.status), stale, unchanged, owner, ownedBefore, ownedAfter: await c.dump() };
  });
  expect(r.statuses.sort()).toEqual(['fulfilled', 'rejected']); expect(String(r.stale)).toContain('selection'); expect(r.unchanged).toBe(true);
  expect(String(r.owner)).toContain('custody'); expect(r.ownedAfter).toEqual(r.ownedBefore);
});

test('reload/read never recreates a missing selection, and a stopped initial guard cannot renew', async ({ page }) => {
  await page.evaluate(async () => { await window.canonicalLaunch.ready(); });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalLaunch);
  const r = await page.evaluate(async () => {
    const c = window.canonicalLaunch, launch = (await c.readLaunch()).value!;
    const selection = (await c.readCanonical(p => c.readPublicationSelection(p, 'launch'))).value!, pub = await c.publish();
    await c.stop(); const before = await c.dump();
    const stopped = await c.executePublicationRenewal(c.command((await c.readCanonicalHead()).head, 'agentica.publication.renew',
      { launchId: 'launch', grant: { ...launch.grant!.ref }, publication: { ...pub.ref }, previousSelection: { ...selection.ref } })).catch(String);
    const after = await c.dump(), db = await c.openCanonicalDatabase();
    const records = await db.getAll('records'), pointer = records.find(row => row.key === 'agentica/publication-selections/launch/current')!;
    await db.delete('records', [pointer.gameId, pointer.id]); db.close();
    const brokenBefore = await c.dump(), missing = await c.readCanonical(p => c.readPublicationSelection(p, 'launch')).catch(String);
    return { stopped, before, after, missing, brokenBefore, brokenAfter: await c.dump() };
  });
  expect(String(r.stopped)).toContain('guard changed'); expect(r.after).toEqual(r.before);
  expect(String(r.missing)).toMatch(/^Error:/); expect(r.brokenAfter).toEqual(r.brokenBefore);
});
