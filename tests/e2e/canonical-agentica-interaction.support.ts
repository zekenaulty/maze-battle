import type { Page } from '@playwright/test';
import { expect } from './canonical-agentica-interaction.test';
import { parkedPeer } from './canonical-agentica-interaction.peer';
import { itemQuantity, isStackableItem } from '../../src/domain/items/itemStacks';
import type { effects } from './canonical-agentica-interaction.seed';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';

export const pulse = (page: Page) => page.evaluate(() => window.canonicalAgenticaInteraction.pulse());
export const effectsOf = (page: Page) => page.evaluate(() => window.canonicalAgenticaInteraction.effects());
export async function admitSelected(page: Page) {
  return page.evaluate(async () => {
    const f = window.canonicalAgenticaInteraction, boot = await f.boot(), before = await f.effects();
    const inspected = await f.selectChest(), admitted = await f.admit(inspected.target), after = await f.effects();
    await f.attachDriver(admitted.action, admitted.binding);
    return { ...admitted, boot, inspected, before, after, proof: await f.identityAndProof(admitted.action) };
  });
}
export async function confirmed(page: Page) {
  const s = await admitSelected(page), peer = await parkedPeer(page, s.entry);
  expect(await pulse(page)).toEqual({ status: 'confirmed' });
  expect(await pulse(page)).toEqual({ status: 'custody-confirmed' });
  return { s, peer };
}
export async function reloadOriginal(page: Page, s: { action: AgenticaAction; binding: ActionBinding }) {
  await page.evaluate(() => window.canonicalAgenticaInteraction.stop());
  await page.reload(); await page.waitForFunction(() => !!window.canonicalAgenticaInteraction);
  await page.evaluate(async s => {
    const f = window.canonicalAgenticaInteraction;
    await f.resume(s.binding); await f.attachDriver(s.action, s.binding);
  }, { action: s.action, binding: s.binding });
}

type Effects = Awaited<ReturnType<typeof effects>>;
export function expectSingleChestEffect(before: Effects, after: Effects) {
  const target = before.targets.find(t => t.chest && t.contract?.contract.objective === 'fetch')!;
  const chestId = target.room.chestId!, questId = target.room.contractId!;
  const chest = after.targets.find(t => t.room.chestId === chestId)!.chest!.chest;
  expect(target.chest!.chest.opened).toBe(false); expect(chest.opened).toBe(true);
  expect(chest.loot!.length).toBeGreaterThan(0);
  for (const item of chest.loot!.filter(item => !isStackableItem(item)))
    expect(after.roster.state.inventory.items.filter(owned => owned.id === item.id)).toEqual([item]);
  for (const base of new Set(chest.loot!.filter(isStackableItem).map(item => item.baseId))) {
    const quantity = (items: typeof chest.loot) => items!.filter(item => item.baseId === base).reduce((sum, item) => sum + itemQuantity(item), 0);
    expect(quantity(after.roster.state.inventory.items)).toBe(quantity(before.roster.state.inventory.items) + quantity(chest.loot));
  }
  const quest = after.quests.find(q => q?.award?.chestId === chestId)!;
  expect(before.quests.find(q => q?.quest.id === questId)).toMatchObject({ quest: { status: 'active' }, award: null });
  expect(quest.quest.status).toBe('complete'); expect(quest.award!.chestId).toBe(chestId);
  expect(after.roster.state.inventory.items.filter(item => item.questId === questId)).toHaveLength(1);
  const total = (items: typeof chest.loot) => items!.reduce((sum, item) => sum + itemQuantity(item), 0);
  expect(total(after.roster.state.inventory.items)).toBe(total(before.roster.state.inventory.items) + total(chest.loot));
  expect(after.targets.filter(t => t.room.chestId !== chestId)).toEqual(before.targets.filter(t => t.room.chestId !== chestId));
  expect(after.roster.state.inventory.gold).toBe(before.roster.state.inventory.gold);
  expect(after.roster.checkpoint.position).toEqual(before.roster.checkpoint.position);
  expect(after.observation.header.actor).toEqual(before.observation.header.actor);
  expect(after.observation.header.sequence).toBe(before.observation.header.sequence + 1);
  expect(after.observation.cells.find(c => c.chests.some(ch => ch.id === chestId))!.chests).toContainEqual({ id: chestId, opened: true });
  return chest;
}
