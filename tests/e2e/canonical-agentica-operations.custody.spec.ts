import { test, expect } from './canonical-agentica-operations.test';

test('parked inventory and SDK 409 cannot move; exact zero-step probe ACK enables first movement', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), confirmation = await f.confirm(s.action, s.binding, s.entry);
    const probe = confirmation.state!.confirmation.data.probe, before = await f.dump();
    const remote = await f.sdkProof(s.entry, probe, 409).then(() => 'accepted', String);
    const blocked = await f.advance(s.action).then(() => 'accepted', String), unchanged = before === await f.dump();
    const duplicate = await f.confirm(s.action, s.binding, s.entry);
    const echo = await f.sdkProof(s.entry, probe), acknowledged = await f.custodyAck(s.action, echo.result);
    const replay = await f.custodyAck(s.action, echo.result, undefined, acknowledged.request);
    const moved = await f.advance(s.action), duplicateAck = await f.custodyAck(s.action, echo.result);
    return { s, confirmation, probe, remote, blocked, unchanged, duplicate, acknowledged, replay, moved, duplicateAck,
      sizes: { probe: f.bytes(probe), confirmation: f.bytes(confirmation.outcome.receipt.result), custody: f.bytes(acknowledged.outcome.receipt.result) } };
  });
  expect(r.remote).toContain('unresolved'); expect(r.blocked).toContain('custody probe is not acknowledged'); expect(r.unchanged).toBe(true);
  expect(r.confirmation.state!.custodyAck).toBeNull(); expect(r.confirmation.state!.progress).toMatchObject({ sequence: 0, steps: 0 });
  expect(r.probe).toMatchObject({ sequence: 1, eventId: `custody-${r.confirmation.request.attemptId}`, kind: 'progress', usage: { steps: 0 } });
  expect(r.probe.observation).toEqual(r.s.entry.admission!.observation);
  expect(r.duplicate.state!.confirmation).toEqual(r.confirmation.state!.confirmation);
  expect(r.acknowledged.state!.progress).toMatchObject({ sequence: 0, steps: 0 }); expect(r.replay.outcome.replayed).toBe(true);
  expect(r.moved.state!.progress).toMatchObject({ sequence: 1, steps: 1 });
  expect(r.moved.state!.event!.data).toMatchObject({ custody: r.acknowledged.state!.custodyAck!.reference,
    previous: { kind: 'custody-probe', reference: r.confirmation.state!.confirmation.reference }, event: { sequence: 2, usage: { steps: 1 } } });
  expect(r.duplicateAck.state!.custodyAck).toEqual(r.acknowledged.state!.custodyAck);
  expect(r.sizes.probe).toBeLessThanOrEqual(4096);
  expect(r.sizes.confirmation).toBeLessThanOrEqual(12 * 1024); expect(r.sizes.custody).toBeLessThanOrEqual(12 * 1024);
  console.log(`Custody UTF-8 bytes: ${JSON.stringify(r.sizes)}`);
});

for (const change of ['missing', 'event-id', 'sequence', 'observation-id', 'observed-at', 'data', 'steps', 'usage', 'admission', 'request', 'epoch', 'waking', 'reference'] as const) {
  test(`custody ACK rejects changed ${change} before movement`, async ({ page }) => {
    const r = await page.evaluate(async change => {
      const f = window.canonicalAgenticaOperations, s = await f.boot(), confirmed = await f.confirm(s.action, s.binding, s.entry);
      const ref = structuredClone(confirmed.state!.confirmation.reference), entry = { ...s.entry, latestEvent: structuredClone(confirmed.state!.confirmation.data.probe) };
      if (change === 'missing') delete (entry as { latestEvent?: unknown }).latestEvent;
      if (change === 'event-id') entry.latestEvent.eventId = crypto.randomUUID();
      if (change === 'sequence') entry.latestEvent.sequence = 2;
      if (change === 'observation-id') entry.latestEvent.observation.observationId = 'fresh';
      if (change === 'observed-at') entry.latestEvent.observation.observedAt = '2030-01-01T00:00:00.000Z';
      if (change === 'data') entry.latestEvent.observation.data.changed = true;
      if (change === 'steps') entry.latestEvent.usage!.steps = 1;
      if (change === 'usage') entry.usage.steps = 0;
      if (change === 'admission') entry.admission!.summary += ' changed';
      if (change === 'request') entry.request.objective += ' changed';
      if (change === 'epoch') entry.activeEpoch = 'foreign';
      if (change === 'waking') entry.state = 'waking';
      if (change === 'reference') ref.id = crypto.randomUUID();
      const before = await f.dump(), rejected = await f.custodyAck(s.action, entry, ref).then(() => 'accepted', String);
      const blocked = await f.advance(s.action).then(() => 'accepted', String);
      return { rejected, blocked, unchanged: before === await f.dump(), state: (await f.read(s.action)).value };
    }, change);
    expect(r.rejected).toMatch(/^Error:/); expect(r.blocked).toContain('custody probe is not acknowledged'); expect(r.unchanged).toBe(true);
    expect(r.state!.custodyAck).toBeNull(); expect(r.state!.progress.steps).toBe(0);
  });
}

test('custody retention snapshots identity, request, reference and full entry before await', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), confirmed = await f.confirm(s.action, s.binding, s.entry);
    const identity = await f.prepareAction(s.action), ref = structuredClone(confirmed.state!.confirmation.reference);
    const entry = { ...s.entry, latestEvent: structuredClone(confirmed.state!.confirmation.data.probe) }, original = structuredClone(entry);
    const request = await f.command('agentica.operation.custody', { action: identity.storageKey, confirmation: ref, entry });
    await f.executeCanonical(request, async tx => {
      const pending = f.retainOperationCustodyAck(tx, request, identity, ref, entry);
      identity.action.arguments.row = 999; ref.id = crypto.randomUUID(); entry.latestEvent.observation.data.extra = 'changed';
      entry.request.objective += ' changed'; request.input = { changed: true }; return (await pending).receipt;
    });
    return { original, state: (await f.read(s.action)).value };
  });
  expect(r.state!.custodyAck!.data.entry).toEqual(r.original); expect(r.state!.progress.steps).toBe(0);
});

for (const acknowledged of [false, true]) test(`reload preserves probe and custody ACK=${acknowledged}, never adopts old navigation`, async ({ page }) => {
  const saved = await page.evaluate(async acknowledged => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
    if (acknowledged) await f.acceptCustody(s.action, s.entry);
    const state = (await f.read(s.action)).value; f.stop(); return { s, state };
  }, acknowledged);
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaOperations);
  const r = await page.evaluate(async ({ action, entry, hasAck }) => {
    const f = window.canonicalAgenticaOperations; await f.resume(); const before = await f.dump(), state = (await f.read(action)).value;
    const blocked = await f.advance(action).then(() => 'accepted', String);
    const ack = hasAck ? null : await f.custodyAck(action, entry).then(() => 'accepted', String);
    return { state, blocked, ack, unchanged: before === await f.dump() };
  }, { action: saved.s.action, entry: { ...saved.s.entry, latestEvent: saved.state!.confirmation.data.probe }, hasAck: acknowledged });
  expect(r.state).toEqual(saved.state); expect(r.blocked).toMatch(/^Error:/); expect(r.unchanged).toBe(true);
  if (!acknowledged) expect(r.ack).toMatch(/^Error:/);
});

test('normal quota can refuse custody ACK while funded Stop and terminal ACK remain independent', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), confirmed = await f.confirm(s.action, s.binding, s.entry);
    const head = (await f.readCanonicalHead()).head, db = await f.openCanonicalDatabase();
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId); db.close(); const before = await f.dump();
    const error = await f.custodyAck(s.action, { ...s.entry, latestEvent: confirmed.state!.confirmation.data.probe }).then(() => 'accepted', String);
    const unchanged = before === await f.dump(), terminals = [];
    for (const operationId of [s.operationId, s.launchGuard]) {
      await f.cancel(operationId);
      if (operationId === s.operationId) {
        const terminal = (await f.terminal(s.action, s.binding))!;
        terminals.push(await f.terminalAck(s.action, s.binding, { ...s.entry, state: 'cancelled', latestEvent: terminal.event }));
      } else terminals.push(await f.launchAck());
    }
    return { error, unchanged, terminals, state: (await f.read(s.action)).value };
  });
  expect(r.error).toContain('quota exhausted'); expect(r.unchanged).toBe(true); expect(r.terminals).toHaveLength(2);
  expect(r.state!.custodyAck).toBeNull(); expect(r.state!.progress.steps).toBe(0); expect(r.state!.operation.state).toBe('acknowledged');
});
