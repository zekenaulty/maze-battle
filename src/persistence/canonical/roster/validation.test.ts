import { describe, expect, it } from 'vitest';
import { createInitialParty } from '../../../domain/party/factory';
import { createItemInstance } from '../../../domain/items/loot';
import { encodeActor, validateActor } from './actorValidation';
import { encodeItem, validateItem } from './itemValidation';
import { encodeRoster } from './codec';
import { rosterCommand } from './commands';
import { containerHeader, partyHeader, storedItem, validatePolicy } from './records';
import { DEFAULT_INVENTORY_POLICY } from '../../../domain/items/inventoryPolicy';

describe('new roster encoding and strict stored values', () => {
  it('encodes optional domain fields without rewriting the original object', () => {
    const item = createItemInstance('town-portal', 1), before = structuredClone(item);
    const encoded = encodeItem(item); expect(() => validateItem(encoded)).not.toThrow();
    expect(item).toEqual(before); expect(Object.hasOwn(encoded as object, 'slot')).toBe(false);
    expect(() => validateItem(item)).toThrow(); // Stored data must already be canonical JSON.
  });
  it.each([NaN, Infinity, -Infinity, undefined, [undefined], new Date(), new Map()])('rejects lossy values %s', value => {
    expect(() => encodeRoster(value)).toThrow();
  });
  it('rejects cycles and unsupported nested fields', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => encodeRoster(cycle)).toThrow();
    expect(() => validateItem({ ...encodeItem(createItemInstance('rusty-sword', 1)), retiredSchema: true })).toThrow();
  });
  it('validates every initial actor independently and rejects duplicate/unknown skills', () => {
    for (const actor of createInitialParty('test')) expect(() => validateActor(encodeRoster(actor))).not.toThrow();
    const actor = createInitialParty('test')[0]; actor.skills.push(actor.skills[0]);
    expect(() => validateActor(encodeRoster(actor))).toThrow('duplicate skill');
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null])('rejects invalid stack quantity %s', quantity => {
    expect(() => validateItem({ ...encodeItem(createItemInstance('health-herb', 1)), quantity })).toThrow();
  });
  it('does not accept equipment stack or mismatched ownership', () => {
    const item = encodeItem(createItemInstance('rusty-sword', 1));
    expect(() => validateItem({ ...item as object, quantity: 2 })).toThrow();
    expect(() => storedItem({ schema: 1, item, order: 1, owner: { kind: 'equipped', actorId: 'a', slot: 'feet' } })).toThrow();
    expect(() => storedItem({ schema: 1, item, order: 1, owner: { kind: 'pack', actorId: 'a' } })).toThrow();
  });
  it('rejects properties that JSON or structuredClone would silently remove', () => {
    const extraArray = Object.assign([1], { extra: true });
    const symbolArray = Object.assign([1], { [Symbol('extra')]: true });
    for (const value of [extraArray, symbolArray, { get hidden() { return 1; } }]) expect(() => encodeRoster(value)).toThrow();
    const item = { ...createItemInstance('rusty-sword', 1), unknown: undefined };
    expect(() => encodeItem(item)).toThrow();
    const dottedItem = { ...createItemInstance('rusty-sword', 1), 'stats.strength': undefined };
    const dottedActor = { ...createInitialParty('test')[0], 'skills.*.charges': undefined };
    expect(() => encodeItem(dottedItem)).toThrow(); expect(() => encodeActor(dottedActor)).toThrow();
  });
  it('does not clamp oversized containers or drop duplicate party IDs', () => {
    expect(() => containerHeader({ schema: 1, capacity: 36, count: 257, nextOrder: 258, gold: 0 }, 'pack')).toThrow();
    expect(() => partyHeader({ schema: 1, actorIds: ['a', 'a'] })).toThrow();
    expect(() => validatePolicy({ ...DEFAULT_INVENTORY_POLICY, portalReserve: 0 })).toThrow();
  });
});

describe('explicit command input', () => {
  it.each([null, {}, { kind: 'portal', hiddenDestination: 'anywhere' }, { kind: 'sell', itemId: 'x', amount: 0 },
    { kind: 'policy', patch: { autoEquip: 'yes' } }, { kind: 'policy', patch: { portalReserve: 6 } },
    { kind: 'use', itemId: '' }, { kind: 'buy', baseId: 'town-portal', vendor: 'elsewhere' }])('rejects malformed input %j', input => {
    expect(() => rosterCommand(input)).toThrow();
  });
  it('owns its input snapshot', () => {
    const input = { kind: 'policy', patch: { autoEquip: false } }, owned = rosterCommand(input);
    input.patch.autoEquip = true;
    expect(owned).toEqual({ kind: 'policy', patch: { autoEquip: false } });
  });
});
