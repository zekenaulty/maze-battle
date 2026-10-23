import { expect } from '@playwright/test';
import type { InventoryState, ItemInstance } from '../../src/domain/types';
import { itemQuantity, isStackableItem, stackIdentity } from '../../src/domain/items/itemStacks';
import type { CanonicalHead } from '../../src/persistence/canonical/types';

/** Independent conservation, not another invocation of the inventory mutation rule. */
export function inventoryConserved(before: InventoryState, after: InventoryState, loot: ItemInstance[]) {
  expect(after.capacity).toBe(before.capacity); expect(after.gold).toBe(before.gold);
  expect(new Set(after.items.map(item => item.id)).size).toBe(after.items.length);
  const expected = [...before.items, ...loot];
  const singles = (items: ItemInstance[]) => items.filter(item => !isStackableItem(item)).sort((a, b) => a.id.localeCompare(b.id));
  expect(singles(after.items)).toEqual(singles(expected));
  const stacks = (items: ItemInstance[]) => {
    const totals = new Map<string, number>();
    for (const item of items.filter(isStackableItem)) {
      const identity = stackIdentity(item);
      totals.set(identity, (totals.get(identity) ?? 0) + itemQuantity(item));
    }
    return [...totals].sort(([a], [b]) => a.localeCompare(b));
  };
  // Includes every old, incoming and unexpected base/metadata group, not just loot bases.
  expect(stacks(after.items)).toEqual(stacks(expected));
}

export function reloadPreserved(stopped: CanonicalHead, persisted: CanonicalHead, reloaded: CanonicalHead) {
  expect(persisted).toEqual(stopped);
  expect(stopped.status).toBe('ready'); expect(stopped.checkpoint.mode).toBe('manual');
  expect(reloaded.owner).not.toBe(stopped.owner);
  // GameSession.start performs takeover then resume. Only their custody/receipt bookkeeping may change.
  expect(reloaded.quota.usedBytes).toBeGreaterThan(stopped.quota.usedBytes);
  expect(reloaded).toEqual({ ...stopped, owner: reloaded.owner, epoch: stopped.epoch + 2, revision: stopped.revision + 2,
    quota: { ...stopped.quota, usedBytes: reloaded.quota.usedBytes } });
}
