import { test, expect, evidence, reloadInteraction } from './canonical-interaction.test';
import { itemQuantity, isStackableItem } from '../../src/domain/items/itemStacks';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('admission is effect-free; explicit chest apply commits actual quest loot and a decision without moving', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), before = await c.snapshot();
    const head = (await c.readCanonicalHead()).head, admission = await c.admit(seed.command), admitted = await c.readInteraction(admission.id);
    const afterAdmission = await c.snapshot(), beforeRefusal = await c.dump();
    const premature = await c.refusal(() => c.settle(admission.id)), afterRefusal = await c.dump();
    const applied = await c.apply(admission.id, { host: c.host() }), state = await c.readInteraction(admission.id), after = await c.snapshot();
    const quest = await c.quest(seed.target.room.contractId!), settled = await c.settle(admission.id), beforeRead = await c.dump();
    const terminal = await c.readInteractionTerminal(admission.id), afterRead = await c.dump();
    await c.acknowledge(admission.id, settled.request.attemptId);
    return { seed, before, head, admission, admitted, afterAdmission, beforeRefusal, premature, afterRefusal,
      applied, state, after, quest, settled, beforeRead, terminal, afterRead, final: await c.readInteraction(admission.id) };
  });
  await evidence(info, 'explicit-chest-decision.json', r);
  expect(r.afterAdmission).toEqual(r.before); expect(r.admitted.head.checkpoint).toEqual(r.head.checkpoint);
  expect(r.admitted.head.roots.world).toEqual(r.head.roots.world); expect(r.admitted.head.roots.knowledge).toEqual(r.head.roots.knowledge);
  expect(r.admitted.head.quota.reservations).toBe(1);
  expect(r.admitted.value.progress).toMatchObject({ sequence: 0, status: 'pending', reason: null, result: null,
    sourceAttemptId: r.admission.request.attemptId, binding: { schema: 1, kind: 'content-interaction', command: r.seed.command, position: r.seed.position } });
  expect(r.premature.rejected).toBe(true); expect(r.afterRefusal).toBe(r.beforeRefusal);
  expect(r.state.value.progress).toMatchObject({ sequence: 1, status: 'applied', reason: null, sourceAttemptId: r.applied.request.attemptId,
    result: { kind: 'open-chest', outcome: 'applied', chestId: r.seed.command.chestId } });
  const chest = r.after.targets.find(t => t.room.chestId === r.seed.command.chestId)!.chest!.chest;
  expect(chest.opened).toBe(true); expect(chest.loot!.length).toBeGreaterThan(0);
  expect(r.state.value.progress.result!.lootIds).toEqual(chest.loot!.map(item => item.id));
  for (const item of chest.loot!.filter(item => !isStackableItem(item))) expect(r.after.roster.state.inventory.items).toContainEqual(item);
  for (const base of new Set(chest.loot!.filter(isStackableItem).map(item => item.baseId))) {
    const quantity = (items: typeof chest.loot) => items!.filter(item => item.baseId === base).reduce((sum, item) => sum + itemQuantity(item), 0);
    expect(quantity(r.after.roster.state.inventory.items)).toBe(quantity(r.before.roster.state.inventory.items) + quantity(chest.loot));
  }
  expect(r.quest!.quest.status).toBe('complete'); expect(r.quest!.award!.chestId).toBe(r.seed.command.chestId);
  expect(r.after.roster.state.inventory.items.filter(item => item.questId === r.seed.target.room.contractId)).toHaveLength(1);
  expect(r.after.roster.state.inventory.gold).toBe(r.before.roster.state.inventory.gold);
  expect(r.after.roster.checkpoint.position).toEqual(r.seed.position);
  expect(r.after.observation.header.actor).toEqual(r.seed.position);
  expect(r.after.observation.header.sequence).toBe(r.before.observation.header.sequence + 1);
  expect(r.after.observation.cells.find(cell => cell.chests.some(ch => ch.id === chest.id))!.chests).toContainEqual({ id: chest.id, opened: true });
  expect(r.afterRead).toBe(r.beforeRead); expect(r.terminal.stats.writes).toBe(0);
  for (const head of [r.admitted.head, r.state.head, r.terminal.head]) expect(head.checkpoint.position).toEqual(r.seed.position);
  expect(r.terminal.value).toMatchObject({ disposition: 'decision', progress: r.state.value.progress });
  expect(r.terminal.value.admission.receipt).toEqual(r.admission.outcome.receipt);
  expect(r.terminal.value.progressSource.receipt).toEqual(r.applied.outcome.receipt);
  expect(r.terminal.value.terminal.receipt).toEqual(r.settled.outcome.receipt);
  expect(r.final.value.operation.state).toBe('acknowledged'); expect(r.final.head.quota.reservations).toBe(0);
});

test('quest acceptance requires its explicit apply; another admitted acceptance is unchanged', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed({ accepted: false }), before = await c.snapshot();
    const command = { kind: 'accept-quest' as const, contractId: seed.target.room.contractId! }, admission = await c.admit(command);
    const afterAdmission = await c.snapshot(); await c.apply(admission.id);
    const first = await c.readInteraction(admission.id), accepted = await c.quest(command.contractId), afterFirst = await c.snapshot();
    const settled = await c.settle(admission.id); await c.acknowledge(admission.id, settled.request.attemptId);
    const duplicate = await c.admit(command); await c.apply(duplicate.id);
    const unchanged = await c.readInteraction(duplicate.id), second = await c.settle(duplicate.id);
    return { seed, before, afterAdmission, first, accepted, afterFirst, unchanged, second,
      afterSecond: await c.snapshot(), terminal: await c.readInteractionTerminal(duplicate.id) };
  });
  await evidence(info, 'explicit-acceptance.json', r);
  expect(r.afterAdmission).toEqual(r.before); expect(r.seed.target.contract!.accepted).toBe(false);
  expect(r.first.value.progress).toMatchObject({ status: 'applied', sequence: 1, result: { kind: 'accept-quest', outcome: 'applied' } });
  expect(r.accepted!.quest.status).toBe('active'); expect(r.accepted!.award).toBeNull();
  expect(r.afterFirst.roster.checkpoint.position).toEqual(r.seed.position);
  expect(r.afterFirst.roster.state.inventory).toEqual(r.before.roster.state.inventory);
  expect(r.afterFirst.observation).toEqual(r.before.observation);
  expect(r.afterFirst.targets.filter(t => t.chest).every(t => !t.chest!.chest.opened)).toBe(true);
  expect(r.unchanged.value.progress).toMatchObject({ sequence: 1, status: 'unchanged', reason: null, result: { outcome: 'unchanged' } });
  expect(r.afterSecond).toEqual(r.afterFirst); expect(r.terminal.value.disposition).toBe('decision');
});

test('quest gold is claimed once across reload, exact retry, and a new explicit unchanged interaction', async ({ page }, info) => {
  const original = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), chest = await c.admit(seed.command);
    await c.apply(chest.id); const chestEnd = await c.settle(chest.id); await c.acknowledge(chest.id, chestEnd.request.attemptId);
    const before = await c.snapshot(), command = { kind: 'claim-quest' as const, questId: seed.target.room.contractId! };
    const admission = await c.admit(command), afterAdmission = await c.snapshot(), applied = await c.apply(admission.id);
    const state = await c.readInteraction(admission.id), after = await c.snapshot(), settled = await c.settle(admission.id);
    return { seed, command, before, admission, afterAdmission, applied, state, after, settled, dump: await c.dump() };
  });
  await reloadInteraction(page);
  const r = await page.evaluate(async serialized => {
    const original = JSON.parse(serialized) as { id: string; request: CanonicalRequest; terminal: string; command: { kind: 'claim-quest'; questId: string } };
    const c = window.canonicalInteraction, before = await c.dump(), replay = await c.executeInteractionCommand(original.request);
    const afterReplay = await c.dump(), sameOperation = await c.refusal(() => c.apply(original.id)), afterRefusal = await c.dump();
    await c.acknowledge(original.id, original.terminal);
    const next = await c.admit(original.command); await c.apply(next.id); const state = await c.readInteraction(next.id);
    await c.settle(next.id);
    return { before, replay, afterReplay, sameOperation, afterRefusal, state, final: await c.snapshot(), quest: await c.quest(original.command.questId) };
  }, JSON.stringify({ id: original.admission.id, request: original.applied.request, terminal: original.settled.request.attemptId, command: original.command }));
  await evidence(info, 'one-time-gold.json', { original, r });
  expect(original.afterAdmission).toEqual(original.before);
  expect(original.state.value.progress).toMatchObject({ status: 'applied', sequence: 1, result: { kind: 'claim-quest', outcome: 'applied' } });
  expect(original.after.roster.state.inventory.gold).toBe(original.before.roster.state.inventory.gold + original.seed.target.contract!.contract.rewardGold);
  expect(original.after.roster.state.inventory.items).toEqual(original.before.roster.state.inventory.items);
  expect(original.after.roster.checkpoint.position).toEqual(original.seed.position);
  expect(r.before).toBe(original.dump); expect(r.afterReplay).toBe(r.before); expect(r.afterRefusal).toBe(r.before);
  expect(r.replay.replayed).toBe(true); expect(r.replay.stats.writes).toBe(0); expect(r.replay.receipt).toEqual(original.applied.outcome.receipt);
  expect(r.sameOperation.rejected).toBe(true); expect(r.state.value.progress).toMatchObject({ status: 'unchanged', sequence: 1 });
  expect(r.quest!.quest.status).toBe('claimed'); expect(r.final).toEqual(original.after);
});
