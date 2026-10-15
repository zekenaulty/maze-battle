import { test, expect } from './canonical-agentica-operations.test';

test('actual SDK accepts original admission and staged event offline; typed service serialization is retained exactly', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), wire = JSON.parse(JSON.stringify(s.entry));
    wire.request.provider.model ??= null;
    Object.assign(wire.request.provider, { thinkingEffort: null, includeThoughtSummaries: false, geminiApi: null, thinkingEffortResolved: true });
    Object.assign(wire.request.limits, { maxRecentObservations: 6, maxRecentReceipts: 6 });
    wire.request.observation.facts = null;
    for (const capability of wire.request.capabilities) {
      capability.durableHandoff ??= false;
      for (const field of capability.inputSchema.fields) for (const key of ['description', 'allowedValues', 'example', 'minimum', 'maximum']) field[key] ??= null;
    }
    wire.admission.completion = null; wire.admission.operation.usage = null; wire.admission.observation.facts = null;
    wire.admission.observation.observedAt = wire.admission.observation.observedAt.replace('Z', '0000+00:00');
    Object.assign(wire, { createdAt: '2026-10-13T01:00:00.0000000+00:00', updatedAt: '2026-10-13T01:00:01.0000000+00:00', latestEvent: null, wakeRunId: null });
    await f.confirm(s.action, s.binding, wire);
    await f.acceptCustody(s.action, wire);
    const first = await f.advance(s.action), proof = await f.sdkProof(wire, first.state!.event!.data.event);
    wire.latestEvent = structuredClone(first.state!.event!.data.event);
    wire.latestEvent.completion = null; wire.latestEvent.nextSessionEpoch = null; wire.latestEvent.observation.facts = null;
    wire.latestEvent.observation.observedAt = wire.latestEvent.observation.observedAt.replace('Z', '0000+00:00');
    const ack = await f.ack(s.action, wire), duplicate = await f.ack(s.action, wire);
    return { wire, first, proof, ack, duplicate };
  });
  expect(r.proof.checked).toEqual(r.first.state!.confirmation.data.entry);
  expect(r.proof.sent).toEqual(r.first.state!.event!.data.event);
  expect(r.ack.state!.acknowledgement!.data.entry).toEqual(r.wire);
  expect(r.duplicate.state!.acknowledgement).toEqual(r.ack.state!.acknowledgement);
  expect(r.duplicate.state!.event).toEqual(r.first.state!.event);
});

test('operation custody cannot discard the model frozen by durable start acceptance', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), unresolved = structuredClone(s.entry);
    delete unresolved.request.provider!.model;
    const before = await f.dump(), error = await f.confirm(s.action, s.binding, unresolved).then(() => 'accepted', String);
    const unchanged = before === await f.dump(), confirmed = await f.confirm(s.action, s.binding, s.entry);
    return { error, unchanged, request: confirmed.state!.confirmation.data.entry.request };
  });
  expect(r.error).toContain('service operation differs'); expect(r.unchanged).toBe(true);
  expect(r.request.provider!.model).toBe('offline-model');
});

test('confirmation snapshots mutable identity, entry, binding and request before awaiting transaction reads', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), identity = await f.prepareAction(s.action);
    const request = await f.command('agentica.operation.confirm', { action: identity.storageKey, binding: s.binding, entry: s.entry });
    const original = structuredClone(s);
    await f.executeCanonical(request, async tx => {
      const work = f.retainOperationConfirmation(tx, request, identity, s.binding, s.entry);
      identity.action.arguments.row = 511; s.entry.request.objective = 'changed'; s.binding.grant.id = crypto.randomUUID();
      request.input = { changed: true }; return (await work).receipt;
    });
    return { original, state: (await f.read(original.action)).value };
  });
  expect(r.state!.confirmation.data.entry).toEqual(r.original.entry); expect(r.state!.confirmation.data.binding).toEqual(r.original.binding);
});

test('ACK snapshots remote latest event and refs; hook metadata mutations cannot corrupt event provenance', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
    await f.acceptCustody(s.action, s.entry);
    const first = await f.advance(s.action, undefined, undefined, inner => ({
      async prepare(view) {
        const work = inner.prepare(view); await Promise.resolve();
        view.request.input = { changed: true }; view.operation.id = 'changed'; view.head.owner = 'changed'; view.receiptRef.attemptId = 'changed'; await work;
      },
      async commit(view) {
        const work = inner.commit(view); await Promise.resolve();
        view.request.input = { changed: true }; view.operation.id = 'changed'; view.head.revision = 999;
        view.progress.steps = 999; view.checkpoint.position.cell.row = 511; view.receiptRef.attemptId = 'changed'; return work;
      },
    }));
    const identity = await f.prepareAction(s.action), event = structuredClone(first.state!.event!.reference), entry = { ...s.entry, latestEvent: structuredClone(first.state!.event!.data.event) };
    const original = structuredClone(entry), request = await f.command('agentica.operation.ack', { action: identity.storageKey, event, entry });
    await f.executeCanonical(request, async tx => {
      const work = f.retainEventAcknowledgement(tx, request, identity, event, entry);
      event.id = crypto.randomUUID(); entry.latestEvent.summary = 'changed'; request.input = { changed: true }; return (await work).receipt;
    });
    return { first, original, state: (await f.read(s.action)).value };
  });
  expect(r.first.state!.progress.steps).toBe(1); expect(r.first.state!.event!.data.event.observation.data.navigation).toMatchObject({ steps: 1 });
  expect(r.state!.acknowledgement!.data.entry).toEqual(r.original); expect(r.state!.event).toEqual(r.first.state!.event);
});

test('expired original SDK deadline does not silently expire already confirmed local custody', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
    await f.acceptCustody(s.action, s.entry);
    const now = Date.now; Date.now = () => Date.parse(s.action.deadlineAt) + 1;
    try { return await f.advance(s.action); } finally { Date.now = now; }
  });
  // The destination's own independent deadline remains authoritative; its bounded result is still delivered.
  expect(r.state!.progress.sequence).toBe(1); expect(r.state!.event!.data.event.kind).toBe('progress');
});

test('oversized confirmation and transaction work bound leave no partial service record', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), before = await f.dump();
    const oversized = await f.confirm(s.action, s.binding, { ...s.entry, request: { ...s.entry.request, objective: 'x'.repeat(11000) } }).catch(String);
    const identity = await f.prepareAction(s.action), request = await f.command('agentica.operation.confirm', { action: identity.storageKey, binding: s.binding, entry: s.entry });
    const budget = await f.executeCanonical(request, async tx => (await f.retainOperationConfirmation(tx, request, identity, s.binding, s.entry)).receipt,
      { limits: { reads: 5, writes: 512, bytes: 4 * 1024 * 1024 } }).catch(String);
    return { before, after: await f.dump(), oversized, budget, state: (await f.read(s.action)).value };
  });
  expect(String(r.oversized)).toContain('bytes'); expect(String(r.budget)).toContain('budget'); expect(r.after).toBe(r.before); expect(r.state).toBeNull();
});
