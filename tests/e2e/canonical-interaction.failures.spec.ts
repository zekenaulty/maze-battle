import { test, expect, evidence } from './canonical-interaction.test';

test('host throw after staged effect and proof rolls back chest, loot, quest, sight, progress, receipts and head', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), admission = await c.admit(seed.command), request = await c.applyRequest(admission.id);
    const original = await c.readInteraction(admission.id), snapshot = await c.snapshot(), before = await c.dump(), seen: unknown[] = [];
    const failure = await c.refusal(() => c.executeInteractionCommand(request, { host: c.host(true, seen) }));
    const after = await c.dump(), rolledBack = await c.readInteraction(admission.id), afterSnapshot = await c.snapshot();
    const retry = await c.executeInteractionCommand(request, { host: c.host() }), committed = await c.readInteraction(admission.id);
    const afterRetry = await c.dump(), replay = await c.executeInteractionCommand(request, { host: c.host(true) }), afterReplay = await c.dump();
    return { seed, request, original, snapshot, before, seen, failure, after, rolledBack, afterSnapshot, retry, committed, afterRetry, replay, afterReplay,
      final: await c.snapshot(), quest: await c.quest(seed.target.room.contractId!) };
  });
  await evidence(info, 'effect-and-proof-rollback.json', r);
  expect(r.failure.rejected).toBe(true); expect(r.failure.message).toContain('fixture interaction host refused after proof');
  expect(r.seen).toHaveLength(1); expect(r.seen[0]).toMatchObject({ progress: { status: 'applied', sequence: 1, result: { outcome: 'applied' } },
    checkpoint: { position: r.seed.position }, event: { sourceAttemptId: r.request.attemptId } });
  expect(r.after).toBe(r.before); expect(r.rolledBack).toEqual(r.original); expect(r.afterSnapshot).toEqual(r.snapshot);
  expect(r.retry.replayed).toBe(false); expect(r.committed.value.progress).toMatchObject({ status: 'applied', sequence: 1, sourceAttemptId: r.request.attemptId });
  expect(r.committed.head.revision).toBe(r.original.head.revision + 1);
  expect(r.final.observation.header.sequence).toBe(r.snapshot.observation.header.sequence + 1);
  expect(r.final.roster.checkpoint.position).toEqual(r.seed.position); expect(r.quest!.quest.status).toBe('complete');
  expect(r.final.roster.state.inventory.items.filter(item => item.questId === r.seed.target.room.contractId)).toHaveLength(1);
  expect(r.replay.replayed).toBe(true); expect(r.replay.stats.writes).toBe(0); expect(r.replay.receipt).toEqual(r.retry.receipt);
  expect(r.afterReplay).toBe(r.afterRetry);
});

test('normal quota failure atomically retains the unapplied action and funded cancellation allowance', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed({ quota: { limitBytes: 3 * 1024 * 1024, reserveBytes: 128 * 1024 } });
    const admission = await c.admit(seed.command); await c.fillNormalCapacity();
    const original = await c.readInteraction(admission.id), snapshot = await c.snapshot(), before = await c.dump();
    const refusal = await c.refusal(() => c.apply(admission.id)), after = await c.dump(), retained = await c.readInteraction(admission.id);
    const cancelled = await c.cancel(admission.id); await c.acknowledge(admission.id, cancelled.receipt.attemptId);
    return { seed, original, snapshot, before, refusal, after, retained, final: await c.readInteraction(admission.id),
      finalSnapshot: await c.snapshot(), terminal: await c.readInteractionTerminal(admission.id) };
  });
  await evidence(info, 'normal-quota-rollback.json', r);
  const quota = r.original.head.quota;
  expect(quota.limitBytes - quota.reserveBytes - quota.usedBytes - quota.reservedBytes).toBeLessThan(8192);
  expect(r.refusal.rejected).toBe(true); expect(r.refusal.message).toContain('quota exhausted');
  expect(r.after).toBe(r.before); expect(r.retained).toEqual(r.original); expect(r.finalSnapshot).toEqual(r.snapshot);
  expect(r.retained.value.progress).toMatchObject({ status: 'pending', sequence: 0, result: null });
  expect(r.terminal.value.disposition).toBe('cancelled'); expect(r.final.value.operation.state).toBe('acknowledged');
  expect(r.final.head.quota.reservations).toBe(0); expect(r.final.head.quota.reservedBytes).toBe(0);
});

test('bounded item-capacity failure leaves the accepted quest and unopened chest unchanged', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed();
    for (let batch = 0; batch < 8; batch++) await c.roster.edit(s => ({ ...s, inventory: { ...s.inventory,
      items: [...(batch ? s.inventory.items : []), ...Array.from({ length: 32 }, (_, i) =>
        ({ ...c.roster.createItemInstance('rusty-sword', 1), id: `interaction-stock-${batch * 32 + i}` }))] } }));
    const admission = await c.admit(seed.command), before = await c.dump(), snapshot = await c.snapshot();
    const refusal = await c.refusal(() => c.apply(admission.id));
    return { seed, before, snapshot, refusal, after: await c.dump(), final: await c.snapshot(), state: await c.readInteraction(admission.id),
      quest: await c.quest(seed.target.room.contractId!) };
  });
  await evidence(info, 'item-capacity-rollback.json', r);
  expect(r.refusal.rejected).toBe(true); expect(r.refusal.message).toContain('invalid bounded item container');
  expect(r.after).toBe(r.before); expect(r.final).toEqual(r.snapshot);
  expect(r.state.value.progress).toMatchObject({ status: 'pending', sequence: 0, result: null });
  expect(r.quest!.quest.status).toBe('active'); expect(r.quest!.award).toBeNull();
  expect(r.final.targets.find(t => t.room.chestId === r.seed.command.chestId)!.chest!.chest.opened).toBe(false);
});

test('verified-host custody requires hooks at every phase and refuses generic acknowledgement', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), initial = await c.snapshot(), beforeAdmission = await c.dump();
    const admitRefusal = await c.refusal(() => c.admit(seed.command, undefined, true)), afterAdmission = await c.dump();
    const seen: unknown[] = [], hooks = c.host(false, seen), admission = await c.admit(seed.command, { host: hooks }, true);
    const admittedSnapshot = await c.snapshot(), beforeApply = await c.dump();
    const applyRefusal = await c.refusal(() => c.apply(admission.id)), afterApply = await c.dump();
    await c.apply(admission.id, { host: hooks }); const appliedSnapshot = await c.snapshot(), beforeSettle = await c.dump();
    const settleRefusal = await c.refusal(() => c.settle(admission.id)), afterSettle = await c.dump();
    const settled = await c.settle(admission.id, { host: hooks }), beforeAck = await c.dump();
    const ackRefusal = await c.refusal(() => c.acknowledge(admission.id, settled.request.attemptId)), afterAck = await c.dump();
    return { initial, beforeAdmission, admitRefusal, afterAdmission, admittedSnapshot, beforeApply, applyRefusal, afterApply,
      appliedSnapshot, beforeSettle, settleRefusal, afterSettle, beforeAck, ackRefusal, afterAck, seen,
      final: await c.snapshot(), state: await c.readInteraction(admission.id), terminal: await c.readInteractionTerminal(admission.id) };
  });
  await evidence(info, 'verified-host-local-contract.json', r);
  for (const refusal of [r.admitRefusal, r.applyRefusal, r.settleRefusal]) {
    expect(refusal.rejected).toBe(true); expect(refusal.message).toContain('requires host hooks');
  }
  expect(r.afterAdmission).toBe(r.beforeAdmission); expect(r.admittedSnapshot).toEqual(r.initial);
  expect(r.afterApply).toBe(r.beforeApply); expect(r.afterSettle).toBe(r.beforeSettle);
  expect(r.ackRefusal.rejected).toBe(true); expect(r.ackRefusal.message).toContain('acknowledgement policy');
  expect(r.afterAck).toBe(r.beforeAck); expect(r.final).toEqual(r.appliedSnapshot); expect(r.seen).toHaveLength(3);
  expect(r.state.value.operation).toMatchObject({ ackPolicy: 'verified-host', state: 'settled' });
  expect(r.state.head.quota.reservations).toBe(1); expect(r.terminal.value.disposition).toBe('decision');
});

test('town chest apply is blocked as unavailable without changing content or position', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), admission = await c.admit(seed.command);
    await c.content.place(seed.position, 'town'); const before = await c.snapshot();
    await c.apply(admission.id); const state = await c.readInteraction(admission.id), after = await c.snapshot();
    await c.settle(admission.id);
    return { before, state, after, terminal: await c.readInteractionTerminal(admission.id) };
  });
  await evidence(info, 'town-unavailable.json', r);
  expect(r.state.value.progress).toMatchObject({ status: 'blocked', sequence: 1, reason: 'unavailable', result: null });
  expect(r.after).toEqual(r.before); expect(r.terminal.value.disposition).toBe('blocked');
});
