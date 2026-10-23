import { test, expect } from '@playwright/test';
import { createItemInstance } from '../../src/domain/items/loot';
import type { CanonicalHead } from '../../src/persistence/canonical/types';
import { inventoryConserved, reloadPreserved } from './canonical-controller-parity.assertions';

function inventory() {
  const item = (baseId: string, id = baseId) => ({ ...createItemInstance(baseId, 1, 'common', () => 0.5), id });
  const before = { capacity: 36, gold: 35, items: [item('health-herb'), item('mana-vial'), item('rusty-sword')] };
  const loot = [item('buckler', 'loot-shield')];
  return { before, loot, after: { ...before, items: structuredClone([...before.items, ...loot]) } };
}

test('parity assertion accepts exact collection and legitimate stack merging', () => {
  const { before, after, loot } = inventory();
  inventoryConserved(before, after, loot);
  const incoming = { ...before.items[0], id: 'loot-herb', quantity: 2 };
  after.items[0] = { ...after.items[0], quantity: 3 };
  inventoryConserved(before, after, [...loot, incoming]);
});

for (const fault of ['balanced stack loss', 'old nonstack loss', 'old nonstack mutation', 'capacity change'] as const)
  test(`parity assertion rejects ${fault}`, () => {
    const { before, after, loot } = inventory();
    if (fault === 'balanced stack loss') {
      after.items = after.items.filter(item => item.baseId !== 'mana-vial');
      after.items[0] = { ...after.items[0], quantity: 2 };
    } else if (fault === 'old nonstack loss') {
      after.items = after.items.filter(item => item.baseId !== 'rusty-sword');
      after.items[0] = { ...after.items[0], quantity: 2 };
    } else if (fault === 'old nonstack mutation') after.items[2].value++;
    else after.capacity++;
    expect(() => inventoryConserved(before, after, loot)).toThrow();
  });

function heads() {
  const stopped: CanonicalHead = { schema: 1, gameId: 'game', generation: 'generation', owner: 'old-owner', epoch: 1, revision: 40,
    status: 'ready', roots: { world: 'world-root', knowledge: 'knowledge-root', execution: 'execution-root' },
    checkpoint: { mode: 'manual', position: { level: 1, cell: { spaceId: 'room', row: 2, column: 2 } }, facing: 'east',
      knowledge: { sequence: 30, id: 'sight', witness: 'witness' } }, allocations: {},
    quota: { limitBytes: 1_000_000, reserveBytes: 100_000, usedBytes: 40_000, reservations: 0, reservedBytes: 0 } };
  const persisted = structuredClone(stopped), reloaded = { ...structuredClone(stopped), owner: 'new-owner', epoch: 3, revision: 42,
    quota: { ...stopped.quota, usedBytes: 41_000 } };
  return { stopped, persisted, reloaded };
}

test('parity assertion accepts only takeover/resume changes on reload', () => {
  const { stopped, persisted, reloaded } = heads(); reloadPreserved(stopped, persisted, reloaded);
});

for (const fault of ['position', 'facing', 'knowledge', 'world root', 'knowledge root', 'execution root', 'persisted rollback'] as const)
  test(`parity assertion rejects reload ${fault} even when replay itself is unchanged`, () => {
    const { stopped, persisted, reloaded } = heads();
    if (fault === 'position') reloaded.checkpoint.position = { level: 1, cell: { spaceId: 'room', row: 2, column: 0 } };
    else if (fault === 'facing') reloaded.checkpoint.facing = 'west';
    else if (fault === 'knowledge') reloaded.checkpoint.knowledge = { sequence: 29, id: 'old-sight', witness: 'old-witness' };
    else if (fault === 'persisted rollback') { persisted.checkpoint.facing = 'west'; reloaded.checkpoint.facing = 'west'; }
    else reloaded.roots[fault.split(' ')[0] as keyof CanonicalHead['roots']] = 'old-root';
    const afterReplay = structuredClone(reloaded);
    expect(afterReplay).toEqual(reloaded);
    expect(() => reloadPreserved(stopped, persisted, reloaded)).toThrow();
  });
