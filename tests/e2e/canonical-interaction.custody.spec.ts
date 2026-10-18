import { test, expect, evidence, reloadInteraction } from './canonical-interaction.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import { itemQuantity } from '../../src/domain/items/itemStacks';

test('exact admission/apply/settlement replay after reload has zero writes; changed bodies and fresh applies refuse', async ({ page }, info) => {
  const original = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), admission = await c.admit(seed.command);
    const applied = await c.apply(admission.id), state = await c.readInteraction(admission.id), beforeDuplicate = await c.dump();
    const duplicate = await c.refusal(() => c.apply(admission.id)), afterDuplicate = await c.dump(), settled = await c.settle(admission.id);
    const terminal = await c.readInteractionTerminal(admission.id); await c.acknowledge(admission.id, settled.request.attemptId);
    return { seed, admission, applied, state, beforeDuplicate, duplicate, afterDuplicate, settled, terminal, dump: await c.dump(), snapshot: await c.snapshot() };
  });
  await reloadInteraction(page);
  const r = await page.evaluate(async serialized => {
    const original = JSON.parse(serialized) as { id: string; requests: CanonicalRequest[] };
    const c = window.canonicalInteraction, before = await c.dump(), replies = [];
    for (const request of original.requests) replies.push(await c.executeInteractionCommand(request));
    const changed = structuredClone(original.requests[1]); changed.input = { operationId: crypto.randomUUID(), sequence: 0 };
    const refused = await c.refusal(() => c.executeInteractionCommand(changed));
    return { before, replies, refused, after: await c.dump(), snapshot: await c.snapshot(), terminal: await c.readInteractionTerminal(original.id) };
  }, JSON.stringify({ id: original.admission.id, requests: [original.admission, original.applied, original.settled].map(value => value.request) }));
  await evidence(info, 'exact-original-replay.json', { original, r });
  expect(original.duplicate.rejected).toBe(true); expect(original.afterDuplicate).toBe(original.beforeDuplicate);
  expect(r.before).toBe(original.dump); expect(r.after).toBe(r.before); expect(r.snapshot).toEqual(original.snapshot);
  expect(r.replies.every(reply => reply.replayed && reply.stats.writes === 0)).toBe(true);
  expect(r.replies.map(reply => reply.receipt)).toEqual([original.admission, original.applied, original.settled].map(value => value.outcome.receipt));
  expect(r.refused.rejected).toBe(true); expect(r.terminal.value).toEqual(original.terminal.value);
});

test('moving away after admission blocks the original tile-bound action without content effects', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), admission = await c.admit(seed.command), move = await c.moveAway();
    const before = await c.snapshot(), applied = await c.apply(admission.id), state = await c.readInteraction(admission.id), after = await c.snapshot();
    const settled = await c.settle(admission.id);
    return { seed, admission, move, before, applied, state, after, settled, terminal: await c.readInteractionTerminal(admission.id) };
  });
  await evidence(info, 'moved-away-blocked.json', r);
  expect(r.move.outcome.receipt.result).toMatchObject({ moved: true }); expect(r.before.roster.checkpoint.position).not.toEqual(r.seed.position);
  expect(r.state.value.progress).toMatchObject({ sequence: 1, status: 'blocked', reason: 'position-changed', result: null, binding: { position: r.seed.position } });
  expect(r.after).toEqual(r.before); expect(r.terminal.value.disposition).toBe('blocked');
  expect(r.after.targets.find(t => t.room.chestId === r.seed.command.chestId)!.chest!.chest.opened).toBe(false);
});

for (const action of ['stop', 'takeover'] as const) {
  test(`${action} fences pending apply; resume cannot implicitly adopt it`, async ({ page }, info) => {
    const r = await page.evaluate(async action => {
      const c = window.canonicalInteraction, seed = await c.seed(), admission = await c.admit(seed.command), stale = await c.applyRequest(admission.id);
      const initial = await c.snapshot(), owner = action === 'stop' ? 'owner' : 'successor', head = (await c.readCanonicalHead()).head;
      await c.controlCanonical(c.command(head, `control.${action}`, { owner }), action);
      const stopped = await c.readInteraction(admission.id), before = await c.dump();
      const old = await c.refusal(() => c.executeInteractionCommand(stale)), stoppedApply = await c.refusal(() => c.apply(admission.id)), after = await c.dump();
      await c.controlCanonical(c.command(stopped.head, 'control.resume', { owner }), 'resume');
      const beforeUnadopted = await c.dump(), unadopted = await c.refusal(() => c.apply(admission.id)), afterUnadopted = await c.dump();
      await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.adopt', { operationId: admission.id }), 'adopt');
      const beforeTransfer = await c.dump(), transferred = await c.refusal(() => c.apply(admission.id)), afterTransfer = await c.dump();
      const cancelled = await c.cancel(admission.id); await c.acknowledge(admission.id, cancelled.receipt.attemptId);
      return { initial, stopped, before, old, stoppedApply, after, beforeUnadopted, unadopted, afterUnadopted,
        beforeTransfer, transferred, afterTransfer,
        final: await c.snapshot(), state: await c.readInteraction(admission.id), terminal: await c.readInteractionTerminal(admission.id) };
    }, action);
    await evidence(info, `${action}-pending-custody.json`, r);
    expect(r.stopped.head.status).toBe('stopped'); expect(r.old.rejected).toBe(true); expect(r.stoppedApply.rejected).toBe(true);
    expect(r.after).toBe(r.before); expect(r.unadopted.rejected).toBe(true); expect(r.afterUnadopted).toBe(r.beforeUnadopted);
    expect(r.transferred.rejected).toBe(true); expect(r.transferred.message).toContain('transfer is not supported');
    expect(r.afterTransfer).toBe(r.beforeTransfer);
    expect(r.final).toEqual(r.initial); expect(r.state.value.progress).toMatchObject({ status: 'pending', sequence: 0, result: null });
    expect(r.terminal.value.disposition).toBe('cancelled'); expect(r.state.value.operation.state).toBe('acknowledged');
    expect(r.state.head.quota.reservations).toBe(0);
  });
}

test('cancellation after applied preserves the committed outcome and source through acknowledgement and reload', async ({ page }, info) => {
  const original = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), admission = await c.admit(seed.command), applied = await c.apply(admission.id);
    const state = await c.readInteraction(admission.id), snapshot = await c.snapshot(), cancelled = await c.cancel(admission.id);
    const terminal = await c.readInteractionTerminal(admission.id); await c.acknowledge(admission.id, cancelled.receipt.attemptId);
    return { admission, applied, state, snapshot, cancelled, terminal, dump: await c.dump() };
  });
  await reloadInteraction(page);
  const r = await page.evaluate(async serialized => {
    const original = JSON.parse(serialized) as { id: string; request: CanonicalRequest };
    const c = window.canonicalInteraction, before = await c.dump(), terminal = await c.readInteractionTerminal(original.id);
    const refused = await c.refusal(() => c.apply(original.id)), replay = await c.executeInteractionCommand(original.request);
    return { before, terminal, refused, replay, after: await c.dump(), snapshot: await c.snapshot(), state: await c.readInteraction(original.id) };
  }, JSON.stringify({ id: original.admission.id, request: original.applied.request }));
  await evidence(info, 'applied-then-cancelled.json', { original, r });
  expect(r.before).toBe(original.dump); expect(r.after).toBe(r.before); expect(r.snapshot).toEqual(original.snapshot);
  expect(r.terminal.value).toEqual(original.terminal.value); expect(r.terminal.value.disposition).toBe('cancelled');
  expect(r.terminal.value.progress).toEqual(original.state.value.progress); expect(r.terminal.value.progress.status).toBe('applied');
  expect(r.terminal.value.progressSource.receipt).toEqual(original.applied.outcome.receipt);
  expect(r.terminal.value.terminal.receipt).toEqual(original.cancelled.receipt);
  expect(r.refused.rejected).toBe(true); expect(r.replay.replayed).toBe(true); expect(r.replay.stats.writes).toBe(0);
  expect(r.state.value.operation.state).toBe('acknowledged'); expect(r.state.head.quota.reservations).toBe(0);
});

test('racing fresh applies commit once; the stale loser and a fresh-fence consumed retry cannot award again', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), admission = await c.admit(seed.command), first = await c.applyRequest(admission.id);
    const second = { ...first, attemptId: crypto.randomUUID() }, before = await c.snapshot();
    const replies = await Promise.allSettled([c.executeInteractionCommand(first), c.executeInteractionCommand(second)]);
    const after = await c.snapshot(), state = await c.readInteraction(admission.id), quest = await c.quest(seed.target.room.contractId!);
    const retry = await c.applyRequest(admission.id), beforeRetry = await c.dump();
    const consumed = await c.refusal(() => c.executeInteractionCommand(retry));
    return { seed, before, attempts: [first, second].map(request => ({ id: request.attemptId, fence: request.expected })),
      replies: replies.map(r => r.status === 'fulfilled' ? { status: r.status, value: r.value } : { status: r.status, error: String(r.reason) }),
      after, state, quest, retry: { id: retry.attemptId, fence: retry.expected }, beforeRetry, consumed, afterRetry: await c.dump(),
      final: await c.snapshot(), finalQuest: await c.quest(seed.target.room.contractId!) };
  });
  await evidence(info, 'racing-apply.json', r);
  expect(r.replies.map(reply => reply.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(r.attempts[0].id).not.toBe(r.attempts[1].id); expect(r.attempts[0].fence).toEqual(r.attempts[1].fence);
  const winner = r.replies.find(reply => reply.status === 'fulfilled')!.value;
  expect(winner.replayed).toBe(false); expect(winner.receipt.afterRevision).toBe(r.attempts[0].fence.revision + 1);
  expect(r.replies.find(reply => reply.status === 'rejected')!.error).toContain('stale owner or revision');
  expect(r.state.head.revision).toBe(winner.receipt.afterRevision);
  expect(r.state.value.progress.sourceAttemptId).toBe(winner.receipt.attemptId);
  expect(r.state.value.progress).toMatchObject({ sequence: 1, status: 'applied' });
  expect(r.after.observation.header.sequence).toBe(r.before.observation.header.sequence + 1);
  expect(r.after.roster.checkpoint.position).toEqual(r.seed.position);
  expect(r.after.roster.state.inventory.items.filter(item => item.questId === r.seed.target.room.contractId)).toHaveLength(1);
  const loot = r.after.targets.find(target => target.room.chestId === r.seed.command.chestId)!.chest!.chest.loot!;
  const quantity = (items: typeof loot) => items.reduce((sum, item) => sum + itemQuantity(item), 0);
  expect(quantity(r.after.roster.state.inventory.items)).toBe(quantity(r.before.roster.state.inventory.items) + quantity(loot));
  expect(r.after.roster.state.inventory.gold).toBe(r.before.roster.state.inventory.gold);
  expect(r.quest!.quest.status).toBe('complete');
  expect(r.quest!.award).toEqual({ chestId: r.seed.command.chestId,
    itemId: r.after.roster.state.inventory.items.find(item => item.questId === r.seed.target.room.contractId)!.id });
  expect(r.attempts.map(attempt => attempt.id)).not.toContain(r.retry.id);
  expect(r.retry.fence).toEqual({ generation: r.state.head.generation, gameId: r.state.head.gameId,
    owner: r.state.head.owner, epoch: r.state.head.epoch, revision: r.state.head.revision });
  expect(r.consumed.rejected).toBe(true); expect(r.consumed.message).toContain('interaction already consumed');
  expect(r.afterRetry).toBe(r.beforeRetry); expect(r.final).toEqual(r.after); expect(r.finalQuest).toEqual(r.quest);
});
