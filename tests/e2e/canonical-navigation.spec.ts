import { test, expect } from './canonical-navigation-test';

test('retained earned destination crosses observed rooms after reload, through normal movement only', async ({ page }) => {
  const initial = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), head = (await c.readCanonicalHead()).head;
    const roster = (await c.roster.read()).value.state, targetsBefore = await c.content.targets(), worldReads: string[] = [];
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(...args) { const r = get.apply(this, args); if (this.name === 'records') r.addEventListener('success', () => {
      if (r.result?.area === 'world') worldReads.push(r.result.key);
    }); return r; };
    let admission;
    try { admission = await c.admit(targets.target); } finally { IDBObjectStore.prototype.get = get; }
    const first = await c.advance(admission.id), progress = await c.readDestination(admission.id);
    return { targets, head, roster, targetsBefore, admission, first, progress, worldReads };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalNavigation);
  const done = await page.evaluate(async id => {
    const c = window.canonicalNavigation, finished = await c.finish(id), settled = await c.settle(id);
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', { operationId: id, terminalAttemptId: settled.request.attemptId }), 'acknowledge');
    return { finished, current: await c.readDestination(id), roster: (await c.roster.read()).value.state, targets: await c.content.targets(), dump: await c.dump() };
  }, initial.admission.id);
  expect(initial.worldReads).toEqual([]);
  expect(initial.admission.outcome.head?.roots.world).toBe(initial.head.roots.world);
  expect(initial.progress.value.progress.steps).toBe(1); expect(initial.first.outcome.head?.checkpoint.position).toEqual(initial.targets.adjacent);
  expect(done.finished.value.status).toBe('arrived'); expect(done.finished.head.checkpoint.position).toEqual(initial.targets.target);
  expect(done.current.value.operation.state).toBe('acknowledged'); expect(done.current.head.quota.reservations).toBe(0);
  expect(done.current.head.quota.usedBytes).toBe(done.dump.bytes);
  expect(done.roster.party).toEqual(initial.roster.party); expect(done.roster.inventory).toEqual(initial.roster.inventory);
  expect(done.targets).toEqual(initial.targetsBefore); expect(done.current.head.checkpoint.mode).toBe('manual');
});

test('original admission, step and settlement replay survive later actions and cancellation attempts', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.adjacent), advance = await c.advance(admission.id), settle = await c.settle(admission.id);
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', { operationId: admission.id, terminalAttemptId: settle.request.attemptId }), 'acknowledge');
    await c.knowledge.act({ kind: 'look' }); const before = await c.dump(), replay = [];
    for (const r of [admission, advance, settle]) replay.push(await c.executeNavigationCommand(r.request));
    const changed = { ...advance.request, input: { operationId: admission.id, sequence: 2 } };
    const mismatch = await c.executeNavigationCommand(changed).catch(String);
    return { before, after: await c.dump(), replay, originals: [admission, advance, settle].map(r => r.outcome.receipt), mismatch };
  });
  expect(result.after).toEqual(result.before); expect(result.replay.every(r => r.replayed && r.stats.reads === 2 && r.stats.writes === 0)).toBe(true);
  expect(result.replay.map(r => r.receipt)).toEqual(result.originals); expect(result.mismatch).toContain('invalid original receipt');
});

test('epoch change requires explicit adoption, without resetting destination, clock or cumulative policy', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), admitted = await c.admit(targets.target, { steps: null, replans: null, durationMs: null });
    const original = (await c.readDestination(admitted.id)).value.progress;
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'new' }), 'takeover');
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.resume', { owner: 'new' }), 'resume');
    const before = await c.dump(), refused = await c.advance(admitted.id).catch(String), after = await c.dump();
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.adopt', { operationId: admitted.id }), 'adopt');
    await c.advance(admitted.id); const advanced = (await c.readDestination(admitted.id)).value.progress;
    return { original, refused, before, after, advanced };
  });
  expect(result.refused).toContain('explicit adoption'); expect(result.after).toEqual(result.before);
  expect(result.advanced).toMatchObject({ binding: result.original.binding, startedAt: result.original.startedAt, deadline: null, owner: 'new',
    epoch: 3, sequence: 1, steps: 1, replans: 1 });
});

for (const policy of ['steps', 'replans', 'time']) test(`cumulative ${policy} policy stops without moving past its bound`, async ({ page }) => {
  const result = await page.evaluate(async policy => {
    const c = window.canonicalNavigation, targets = await c.seed(), admission = await c.admit(targets.target, {
      steps: policy === 'steps' ? 1 : null, replans: policy === 'replans' ? 0 : null, durationMs: policy === 'time' ? 0 : null });
    if (policy === 'replans') {
      await c.knowledge.act({ kind: 'move', direction: targets.direction, triggerStairs: false }); await c.advance(admission.id);
    } else if (policy === 'steps') { await c.advance(admission.id); await c.advance(admission.id); }
    const finished = await c.readDestination(admission.id); await c.settle(admission.id); return finished;
  }, policy);
  expect(result.value.status).toBe('blocked');
  expect(result.value.progress.reason).toBe(policy === 'steps' ? 'step-limit' : policy === 'replans' ? 'replan-limit' : 'time-limit');
  expect(result.value.progress.steps).toBe(policy === 'steps' ? 1 : 0);
});

test('unknown destinations and cross-floor requests never generate, loot, or choose another objective', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed(), before = (await c.readCanonicalHead()).head;
    const unknown = await c.admit({ level: 1, cell: { spaceId: 'unobserved', row: 0, column: 0 } });
    const otherFloor = await c.admit({ ...targets.start, level: 2 });
    return { before, unknown: await c.readDestination(unknown.id), otherFloor: await c.readDestination(otherFloor.id) };
  });
  expect(result.unknown.value.progress.reason).toBe('unknown-destination'); expect(result.otherFloor.value.progress.reason).toBe('scope-limit');
  expect(result.otherFloor.head.roots.world).toBe(result.before.roots.world);
  expect(result.otherFloor.head.roots.knowledge).toBe(result.before.roots.knowledge); expect(result.otherFloor.head.checkpoint).toEqual(result.before.checkpoint);
});
