import { expect, test } from './canonical-agentica.test';

test('publication pins earned snapshot and wire revision across execution bookkeeping and reload', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish();
    await c.change(); const action = c.protocolAction(head.revision), pending = await c.pending(action, pub.reference);
    const probe = c.storageProbe(), retained = await c.read(action), io = probe.finish();
    return { head, pub, action, pending, retained, io };
  });
  await page.reload(); await page.waitForFunction(() => !!window.agenticaRecords);
  const reloaded = await page.evaluate(async ({ action, ref }) => {
    const c = window.agenticaRecords, before = await c.dump(), reconciled = await c.reconcile(action), retained = await c.read(action);
    const pub = (await c.readCanonical(p => c.readPublication(p, ref))).value;
    const observed = (await c.readCanonical(p => c.loadObservation(p, { sequence: pub.observation!.sequence, id: pub.observation!.id }),
      { snapshot: { ...pub.snapshot, roots: { ...pub.snapshot.roots, execution: null } } })).value;
    return { reconciled, retained, pub, observed, before, after: await c.dump() };
  }, { action: original.action, ref: original.pub.reference });
  expect(reloaded.pub.wireRevision).toBe(original.head.revision);
  expect(reloaded.pub.snapshot.roots).toEqual({ world: original.head.roots.world, knowledge: original.head.roots.knowledge });
  expect(reloaded.pub.observation).toEqual(original.head.checkpoint.knowledge);
  expect(reloaded.observed.cells[0].world).toEqual({ row: -5, column: -2 });
  expect(reloaded.retained.value).toEqual(original.retained.value);
  expect(reloaded.retained.value!.original.action).toEqual(original.action);
  expect(reloaded.retained.value!.original).not.toHaveProperty('snapshot');
  expect(reloaded.retained.value!.original.sourceRequest).toEqual(original.pending.request);
  expect(reloaded.reconciled.value).toEqual({ status: 'pending', fingerprint: original.retained.value!.original.fingerprint });
  expect(reloaded.after).toBe(reloaded.before);
  expect(original.io.operations.some(op => ['getAll', 'getAllKeys', 'openCursor'].includes(op.method))).toBe(false);
  expect(original.retained.stats.reads).toBeLessThan(160);
});

test('original pending and result are immutable; exact receipts replay without callbacks after takeover', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    const pending = await c.pending(action, pub.reference), duplicate = await c.pending(action, pub.reference);
    const result = c.protocolResult(action), completed = await c.complete(action, result), duplicateResult = await c.complete(action, result);
    const changedResult = await c.complete(action, { ...result, summary: 'Rewritten' }).catch(String);
    await c.takeover(); const before = await c.dump(), receipts = [];
    for (const prior of [pub, pending, completed]) {
      receipts.push(await c.executeCanonical(prior.request, async () => { throw Error('Exact retry must not execute'); }));
    }
    const changedRequest = await c.executeCanonical({ ...pending.request, input: { changed: true } }, async () => true).catch(String);
    const reconciled = await c.reconcile(action), retained = await c.read(action);
    return { pending, duplicate, completed, duplicateResult, result, changedResult, changedRequest, receipts, reconciled, retained, before, after: await c.dump() };
  });
  expect(r.duplicate.reference).toEqual(r.pending.reference); expect(r.duplicateResult.reference).toEqual(r.completed.reference);
  expect(r.changedResult).toContain('original result changed'); expect(r.changedRequest).toContain('invalid original receipt');
  expect(r.receipts.every(x => x.replayed && x.stats.reads === 2 && x.stats.writes === 0)).toBe(true);
  expect(r.after).toBe(r.before); expect(r.retained.value!.resultReference).toEqual(r.completed.reference);
  expect(r.reconciled.value).toEqual({ status: 'completed', fingerprint: r.retained.value!.original.fingerprint, result: r.result });
});

test('every full SDK input change under the original key rejects without overwriting the pending record', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    await c.pending(action, pub.reference); const before = await c.dump(), errors = [];
    for (const change of [{ arguments: { row: -4 } }, { expectedRevision: action.expectedRevision + 1 }, { runnerRunId: 'runner2' },
      { stepId: 'step2' }, { capabilityId: 'other' }, { deadlineAt: '2020-01-01T00:00:00.000Z' }, { manifestHash: `sha256:${'b'.repeat(64)}` }]) {
      const altered = { ...action, ...change };
      errors.push(await c.pending(altered, pub.reference).catch(String)); errors.push(await c.reconcile(altered).catch(String));
    }
    const differentEffect = await c.pending(action, pub.reference, 'writesLocalState').catch(String);
    return { before, after: await c.dump(), errors, differentEffect, retained: await c.read(action) };
  });
  expect(r.errors).toHaveLength(14); expect(r.errors.every(x => String(x).includes('original input changed'))).toBe(true);
  expect(r.differentEffect).toContain('original action binding changed'); expect(r.after).toBe(r.before);
  expect(r.retained.value!.result).toBeNull();
});

for (const change of ['world', 'knowledge', 'custody'] as const) test(`${change} changes prevent fresh effects but preserve original reconciliation`, async ({ page }) => {
  const r = await page.evaluate(async change => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    await c.pending(action, pub.reference);
    if (change === 'custody') await c.takeover(); else await c.change(change);
    const before = await c.dump();
    const fresh = await c.pending({ ...action, actionId: 'fresh' }, pub.reference).catch(String);
    const completion = await c.complete(action, c.protocolResult(action)).catch(String);
    return { before, after: await c.dump(), fresh, completion, reconciled: await c.reconcile(action) };
  }, change);
  expect(String(r.fresh)).toContain('custody changed'); expect(String(r.completion)).toMatch(/custody|game state/);
  expect(r.reconciled.value!.status).toBe('pending'); expect(r.after).toBe(r.before);
});

test('admission and exact SDK result commit together without rewriting the original pending input', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    const pending = await c.pending(action, pub.reference, 'writesLocalState'), identity = await c.prepareAction(action);
    const current = (await c.readCanonicalHead()).head, afterRevision = current.revision + 1;
    const result = { ...c.protocolResult(action), afterRevision, observation: { ...c.protocolResult(action).observation!, revision: afterRevision },
      operation: { operationId: 'destination', summary: 'Destination admitted.' } };
    const request = c.command(current, 'operation.admit', { operationId: 'destination', terminalBytes: c.MIN_TERMINAL_BYTES,
      binding: { actionKey: identity.key, publication: { ...pub.reference } } });
    const outcome = await c.operateCanonical(request, 'admit', async tx => ({
      ...(await c.retainActionResult(tx, request, identity, result)).receipt, operationId: tx.operation.id,
    }));
    const operation = (await c.readCanonical(p => p.liveOperation('destination'))).value;
    return { pending, outcome, operation, result, retained: await c.read(action) };
  });
  expect(r.operation!.state).toBe('admitted'); expect(r.operation!.admissionAttemptId).toBe(r.outcome.receipt.attemptId);
  expect(r.retained.value!.reference).toEqual(r.pending.reference); expect(r.retained.value!.result).toEqual(r.result);
  expect(r.outcome.head!.allocations.destination).toBeDefined();
});

test('competing reservations on one fence cannot replace the winner or duplicate the original', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    const current = (await c.readCanonicalHead()).head, first = c.command(current, 'agentica.pending'), second = c.command(current, 'agentica.pending');
    const outcomes = await Promise.allSettled([c.pending(action, pub.reference, 'readOnly', first), c.pending(action, pub.reference, 'readOnly', second)]);
    const record = (await c.read(action)).value!, before = await c.dump();
    const duplicate = await c.pending(action, pub.reference), after = (await c.read(action)).value!;
    return { outcomes: outcomes.map(x => x.status), record, after, duplicate, before };
  });
  expect(r.outcomes.sort()).toEqual(['fulfilled', 'rejected']); expect(r.after).toEqual(r.record);
  expect(r.duplicate.reference).toEqual(r.record.reference);
});

test('stale world can produce an exact conflict, but not an invented future revision or stale applied result', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = window.agenticaRecords, head = await c.seed(), pub = await c.publish(), action = c.protocolAction(head.revision);
    await c.pending(action, pub.reference); await c.change('world');
    const current = (await c.readCanonicalHead()).head, result = { ...c.protocolResult(action), disposition: 'conflict' as const,
      beforeRevision: current.revision, afterRevision: current.revision,
      observation: { ...c.protocolResult(action).observation!, revision: current.revision } };
    const before = await c.dump(), future = await c.complete(action, { ...result, beforeRevision: current.revision + 10, afterRevision: current.revision + 10,
      observation: { ...result.observation, revision: current.revision + 10 } }).catch(String), after = await c.dump();
    await c.complete(action, result); return { before, after, future, result, reconciled: await c.reconcile(action) };
  });
  expect(String(r.future)).toContain('commit revision'); expect(r.after).toBe(r.before); expect(r.reconciled.value!.result).toEqual(r.result);
});
