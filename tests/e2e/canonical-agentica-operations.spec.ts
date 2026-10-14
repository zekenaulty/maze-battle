import { test, expect } from './canonical-agentica-operations.test';

test('original parked confirmation gates real movement; ordered progress and exact ACK survive stale initial publication', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, seeded = await f.boot(), identity = await f.prepareAction(seeded.action);
    const request = await f.command('navigation.advance', { operationId: seeded.operationId, sequence: 0 }), before = await f.dump();
    const unconfirmed = await f.executeNavigationCommand(request, { host: f.operationProgressHooks(identity, { key: f.operationKey(identity), id: crypto.randomUUID() }) }).catch(String);
    const afterFailure = await f.dump(), confirmed = await f.confirm(seeded.action, seeded.binding, seeded.entry);
    const duplicate = await f.confirm(seeded.action, seeded.binding, seeded.entry, confirmed.request);
    await f.acceptCustody(seeded.action, seeded.entry);
    const first = await f.advance(seeded.action), beforeAck = await f.dump(), withheld = await f.advance(seeded.action).catch(String), afterWithheld = await f.dump();
    const replay = await f.advance(seeded.action, undefined, first.request), afterReplay = await f.dump();
    const remote = { ...seeded.entry, latestEvent: first.state!.event!.data.event };
    const ack = await f.ack(seeded.action, remote), second = await f.advance(seeded.action);
    const duplicateAck = await f.ack(seeded.action, remote, first.state!.event!.reference, ack.request);
    return { seeded, unconfirmed, before, afterFailure, confirmed, duplicate, first, beforeAck, withheld, afterWithheld, afterReplay,
      replay, ack, second, duplicateAck, sizes: { entry: f.bytes(seeded.entry), event: f.bytes(first.state!.event!.data.event), result: f.bytes(first.outcome.receipt.result) } };
  });
  expect(String(r.unconfirmed)).toContain('missing referenced'); expect(r.afterFailure).toBe(r.before);
  expect(r.confirmed.state!.progress.steps).toBe(0); expect(r.duplicate.outcome.replayed).toBe(true);
  expect(r.first.state!.progress).toMatchObject({ steps: 1, sequence: 1 });
  expect(r.first.outcome.head!.roots.knowledge).not.toEqual(r.confirmed.outcome.head!.roots.knowledge);
  expect(r.first.state!.event!.data.event).toMatchObject({ kind: 'progress', sequence: 2, actionId: r.seeded.action.actionId,
    operationId: r.seeded.operationId, observation: { revision: r.first.outcome.receipt.afterRevision, data: { navigation: { steps: 1, status: 'running' } } } });
  expect(r.first.state!.event!.data.previous).toEqual({ kind: 'custody-probe', reference: r.confirmed.state!.confirmation.reference });
  expect(r.first.state!.acknowledgement).toBeNull();
  expect(String(r.withheld)).toContain('not acknowledged'); expect(r.afterWithheld).toBe(r.beforeAck);
  expect(r.replay.outcome.replayed).toBe(true); expect(r.replay.state).toEqual(r.first.state); expect(r.afterReplay).toBe(r.beforeAck);
  expect(r.ack.state!.acknowledgement!.data.entry.latestEvent).toEqual(r.first.state!.event!.data.event);
  expect(r.second.state!.progress).toMatchObject({ steps: 2, sequence: 2 });
  expect(r.second.state!.event!.data.previous).toEqual({ kind: 'progress', reference: r.first.state!.event!.reference });
  expect(r.second.state!.acknowledgement).toBeNull();
  expect(r.duplicateAck.outcome.replayed).toBe(true); expect(r.duplicateAck.state).toEqual(r.second.state);
  expect(r.sizes.event).toBeLessThanOrEqual(4096); expect(r.sizes.result).toBeLessThanOrEqual(16384);
  console.log(`Operation UTF-8 bytes: ${JSON.stringify(r.sizes)}`);
});

for (const changed of ['reserved', 'waking', 'request', 'action', 'admission', 'manifest', 'epoch', 'grant', 'latest'] as const) {
  test(`reject ${changed} service custody before movement`, async ({ page }) => {
    const r = await page.evaluate(async changed => {
      const f = window.canonicalAgenticaOperations, s = await f.boot(), entry = structuredClone(s.entry), binding = structuredClone(s.binding);
      if (changed === 'reserved' || changed === 'waking') entry.state = changed;
      if (changed === 'request') entry.request.objective += ' changed';
      if (changed === 'action') entry.action.arguments.row = 511;
      if (changed === 'admission') entry.admission!.summary += ' changed';
      if (changed === 'manifest') entry.action.manifestHash = `sha256:${'b'.repeat(64)}`;
      if (changed === 'epoch') entry.activeEpoch = '999';
      if (changed === 'grant') binding.grant.id = crypto.randomUUID();
      if (changed === 'latest') entry.latestEvent = {} as NonNullable<typeof entry.latestEvent>;
      const before = await f.dump(), error = await f.confirm(s.action, binding, entry).catch(String);
      return { before, after: await f.dump(), error };
    }, changed);
    expect(typeof r.error).toBe('string'); expect(r.after).toBe(r.before);
  });
}

for (const changed of ['missing', 'summary', 'sequence', 'revision', 'epoch', 'admission', 'usage', 'waking'] as const) {
  test(`ACK refuses ${changed} remote latestEvent without fresh rewrite`, async ({ page }) => {
    const r = await page.evaluate(async changed => {
      const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
      await f.acceptCustody(s.action, s.entry);
      const first = await f.advance(s.action), entry = { ...s.entry, latestEvent: structuredClone(first.state!.event!.data.event) };
      if (changed === 'missing') delete (entry as { latestEvent?: unknown }).latestEvent;
      if (changed === 'summary') entry.latestEvent.summary += ' changed';
      if (changed === 'sequence') entry.latestEvent.sequence++;
      if (changed === 'revision') entry.latestEvent.observation.revision++;
      if (changed === 'epoch') entry.latestEvent.sessionEpoch = '999';
      if (changed === 'admission') entry.admission!.afterRevision++;
      if (changed === 'usage') entry.usage.steps++;
      if (changed === 'waking') entry.state = 'waking';
      const before = await f.dump(), error = await f.ack(s.action, entry).catch(String);
      return { before, after: await f.dump(), error };
    }, changed);
    expect(typeof r.error).toBe('string'); expect(r.after).toBe(r.before);
  });
}

for (const kind of ['launch', 'navigation', 'takeover'] as const) test(`${kind} change fences the next advance`, async ({ page }) => {
  const r = await page.evaluate(async kind => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
    await f.acceptCustody(s.action, s.entry);
    if (kind === 'takeover') { f.stop(); await f.resume(); } else await f.cancel(kind === 'launch' ? s.launchGuard : s.operationId);
    const before = await f.dump(), error = await f.advance(s.action).catch(String);
    return { before, after: await f.dump(), error, state: (await f.read(s.action)).value };
  }, kind);
  expect(typeof r.error).toBe('string'); expect(r.after).toBe(r.before); expect(r.state!.progress.steps).toBe(0);
});

test('reload/takeover reads original event without executing pending delivery or adopting navigation', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
    await f.acceptCustody(s.action, s.entry);
    const state = (await f.advance(s.action)).state; f.stop(); return { s, state };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaOperations);
  const r = await page.evaluate(async action => {
    const f = window.canonicalAgenticaOperations; await f.resume(); const before = await f.dump(), state = await f.read(action);
    return { state, before, after: await f.dump() };
  }, original.s.action);
  expect(r.state.value).toEqual(original.state); expect(r.after).toBe(r.before); expect(r.state.stats.reads).toBeLessThan(2048);
});
