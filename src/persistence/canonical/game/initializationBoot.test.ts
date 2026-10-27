// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as partyFactory from '../../../domain/party/factory';
import * as inventoryFactory from '../../../domain/items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../../../domain/items/inventoryPolicy';
import * as database from '../database';
import { appendedBytes } from '../accounting';
import { workBudget } from '../budget';
import { CanonicalPages } from '../pages';
import { encodeActor } from '../roster/actorValidation';
import { encodeItem } from '../roster/itemValidation';
import { seedRoster } from '../roster/write';
import { jsonBytes } from '../validation';
import { gameCheckpoint, rosterContext } from './checkpoint';
import { captureInitializationBoot, type InitializationBoot } from './initializationBoot';
import { INITIALIZATION_BOOT_POLICY, initializationCapacity } from './initializationCapacity';
import { isPublicBirth, measureBirth, publicPolicyWitness } from './initializationCapacity.test-support';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from './settings';

vi.mock('../../../domain/items/inventoryPolicy', async importOriginal => {
  const original = await importOriginal<typeof import('../../../domain/items/inventoryPolicy')>();
  return { ...original, DEFAULT_INVENTORY_POLICY: { ...original.DEFAULT_INVENTORY_POLICY } };
});

const worldId = '00000000-0000-4000-8000-000000000001';
const defaults = [DEFAULT_SETTINGS, DEFAULT_INVENTORY_POLICY].map(value => ({ value, saved: structuredClone(value) }));
afterEach(() => {
  vi.restoreAllMocks();
  for (const { value, saved } of defaults) {
    for (const key of Object.keys(value)) Reflect.deleteProperty(value, key);
    Object.assign(value, saved);
  }
});

function sources() {
  const roster = { party: partyFactory.createInitialParty(worldId), inventory: inventoryFactory.createInitialInventory(),
    stash: inventoryFactory.createInitialStash(), inventoryPolicy: DEFAULT_INVENTORY_POLICY };
  const party = vi.spyOn(partyFactory, 'createInitialParty').mockReturnValue(roster.party);
  const inventory = vi.spyOn(inventoryFactory, 'createInitialInventory').mockReturnValue(roster.inventory);
  const stash = vi.spyOn(inventoryFactory, 'createInitialStash').mockReturnValue(roster.stash);
  return { roster, settings: DEFAULT_SETTINGS, factories: [party, inventory, stash] };
}

it('synchronously captures each real factory once, with only the three item UUID draws and no storage reads', () => {
  const party = vi.spyOn(partyFactory, 'createInitialParty'), inventory = vi.spyOn(inventoryFactory, 'createInitialInventory');
  const stash = vi.spyOn(inventoryFactory, 'createInitialStash'), ids = vi.spyOn(crypto, 'randomUUID');
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => { throw Error('Unexpected RNG'); });
  const math = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Unexpected RNG'); });
  const storage = vi.spyOn(database, 'openCanonicalDatabase').mockImplementation(() => { throw Error('Storage forbidden'); });
  const boot = captureInitializationBoot(worldId);
  expect(boot).not.toBeInstanceOf(Promise); expect(boot.bootPolicy).toBe(INITIALIZATION_BOOT_POLICY);
  for (const factory of [party, inventory, stash]) expect(factory).toHaveBeenCalledTimes(1);
  expect(party).toHaveBeenCalledWith(worldId); expect(ids).toHaveBeenCalledTimes(3);
  expect(boot.roster.inventory.items.map(item => item.id)).toEqual(ids.mock.results.map(result => result.value));
  expect(random).not.toHaveBeenCalled(); expect(math).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
});

it('owns deep snapshots across an await and neither recaptures nor validates with RNG', async () => {
  const source = sources();
  const ids = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw Error('Validation RNG forbidden'); });
  const first = captureInitializationBoot(worldId), second = captureInitializationBoot(worldId), expected = structuredClone(first);
  for (const factory of source.factories) expect(factory).toHaveBeenCalledTimes(2);
  await Promise.resolve();
  source.roster.party[0].skills[0].cooldown = 99;
  source.roster.party[0].attributes.strength = 1;
  source.roster.inventory.items[0].displayName = 'changed'; source.roster.stash.capacity = 1;
  Object.assign(DEFAULT_INVENTORY_POLICY, { healthReserve: 4 }); DEFAULT_SETTINGS.autoThrottleMs = 501;
  expect(first).toEqual(expected); expect(second).toEqual(expected);
  first.roster.party[0].skills[0].cooldown = 55; first.roster.inventory.items[0].displayName = 'also changed';
  first.roster.inventoryPolicy.healthReserve = 8; first.settings.autoThrottleMs = 700;
  expect(second).toEqual(expected); expect(ids).not.toHaveBeenCalled();
  for (const factory of source.factories) expect(factory).toHaveBeenCalledTimes(2);
});

it.each(['', 'world', 'g'.repeat(36), '00000000-0000-4000-8000-0000000000010'])('refuses non-UUID36 world identity %s before factory/RNG work', id => {
  const party = vi.spyOn(partyFactory, 'createInitialParty'), inventory = vi.spyOn(inventoryFactory, 'createInitialInventory');
  const stash = vi.spyOn(inventoryFactory, 'createInitialStash'), ids = vi.spyOn(crypto, 'randomUUID');
  expect(() => captureInitializationBoot(id)).toThrow('unsupported initialization world identity');
  for (const factory of [party, inventory, stash, ids]) expect(factory).not.toHaveBeenCalled();
});

type BootValues = Pick<InitializationBoot, 'roster' | 'settings'>;
const mutations: [string, (b: BootValues) => void][] = [
  ['same-width hero stat', b => { b.roster.party[0].hp = 111; }],
  ['extra actor field', b => { Object.assign(b.roster.party[0], { extra: true }); }],
  ['missing actor field', b => { Reflect.deleteProperty(b.roster.party[0], 'gold'); }],
  ['changed skill', b => { b.roster.party[0].skills[0].cooldown = 1; }],
  ['extra hero', b => { b.roster.party.push(structuredClone(b.roster.party[0])); }],
  ['party order', b => { b.roster.party.reverse(); }],
  ['foreign actor identity', b => { b.roster.party[0].id = `${worldId}-mage`; }],
  ['duplicate item identity', b => { b.roster.inventory.items[1].id = b.roster.inventory.items[0].id; }],
  ['oversize item identity', b => { b.roster.inventory.items[0].id += '0'; }],
  ['same-width item value', b => { b.roster.inventory.items[0].value++; }],
  ['extra item field', b => { Object.assign(b.roster.inventory.items[0], { extra: true }); }],
  ['item order', b => { b.roster.inventory.items.reverse(); }],
  ['extra pack field', b => { Object.assign(b.roster.inventory, { extra: true }); }],
  ['extra stash field', b => { Object.assign(b.roster.stash, { extra: true }); }],
  ['nonempty stash', b => { b.roster.stash.items.push(b.roster.inventory.items[0]); }],
  ['pack capacity', b => { b.roster.inventory.capacity++; }],
  ['gold', b => { b.roster.inventory.gold++; }],
  ['policy value', b => { Object.assign(b.roster.inventoryPolicy, { healthReserve: 4 }); }],
  ['extra policy field', b => { Object.assign(b.roster.inventoryPolicy, { extra: true }); }],
  ['same-byte settings', b => { b.settings.autoThrottleMs = 501; }],
  ['extra settings field', b => { Object.assign(b.settings, { extra: true }); }],
  ['identity in nonidentity field', b => { b.roster.inventory.items[0].displayName = b.roster.inventory.items[0].id; }],
];
it.each(mutations)('refuses unsupported boot drift: %s', (_name, mutate) => {
  const source = sources(); mutate(source);
  const ids = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw Error('Validation RNG forbidden'); });
  expect(() => captureInitializationBoot(worldId)).toThrow();
  for (const factory of source.factories) expect(factory).toHaveBeenCalledTimes(1);
  expect(ids).not.toHaveBeenCalled();
});

it('writes the snapshot after source mutation through seedRoster, matching the actual initializer golden and exact ceiling', async () => {
  const source = sources(), boot = captureInitializationBoot(worldId);
  const f = await measureBirth('late', 0, true);
  source.roster.party[0].hp = 1; source.roster.inventory.items[0].value = 1; source.roster.stash.capacity = 1;
  Object.assign(DEFAULT_INVENTORY_POLICY, { healthReserve: 4 }); DEFAULT_SETTINGS.autoThrottleMs = 501;
  const budget = workBudget(), pages = new CanonicalPages(f.tx, f.current, budget);
  await pages.set('world', SETTINGS_KEY, boot.settings);
  await seedRoster(pages, { ...rosterContext(gameCheckpoint(f.current.checkpoint)), ...boot.roster });
  const staged = await pages.prepare(), rows = staged.records;
  expect(budget.snapshot().reads).toBe(0);
  expect(staged.roots.knowledge).toBeNull(); expect(staged.roots.execution).toBeNull();
  expect(staged.snapshot).toBeUndefined(); expect(rows.every(isPublicBirth)).toBe(true);
  expect(publicPolicyWitness(rows)).toBe(publicPolicyWitness(f.complete.records));
  expect(f.recipe.worldId).toBe(worldId); expect(f.flushes).toBe(1); expect(f.stats.reads).toBe(0);
  expect(createHash('sha256').update(publicPolicyWitness(rows)).digest('hex'))
    .toBe('78a38ee21dbbef923e2d77d97cb5ddda319cd0f080fab5d4d37baa2c0c8141b9');
  const { version, level, roomBudget, policy, spatial, architecture } = f.recipe;
  const capacity = initializationCapacity({ floor: { version, level, roomBudget, policy, spatial, architecture }, bootPolicy: boot.bootPolicy });
  expect(capacity.publicBirth).toEqual({ recordsBytes: 9865, nodesBytes: 27496, budgetBytes: 37361 });
  expect(appendedBytes(rows, [])).toBe(9865); expect(rows).toHaveLength(11);
  expect(rows.flatMap(row => row.indexes)).toHaveLength(3);
  expect(Math.max(...rows.flatMap(row => [`record/${row.key}`, ...row.indexes.map(index => `index/${index}`)]).map(path => path.length))).toBe(77);
  for (const actor of boot.roster.party) expect(rows.find(row => row.key === `roster/actor/${actor.id}`)?.value)
    .toEqual({ schema: 1, actor: encodeActor(actor) });
  for (const [i, item] of boot.roster.inventory.items.entries()) expect(rows.find(row => row.key === `roster/item/${item.id}`)?.value)
    .toEqual({ schema: 1, item: encodeItem(item), owner: { kind: 'pack' }, order: i + 1 });
  expect(rows.find(row => row.key === 'game/settings')?.value).toEqual(boot.settings);
  expect(rows.find(row => row.key === 'roster/policy')?.value).toEqual({ schema: 1, policy: boot.roster.inventoryPolicy });
  expect(rows.map(row => jsonBytes(row.value)).sort((a, b) => a - b))
    .toEqual([33, 50, 60, 148, 162, 277, 289, 292, 484, 500, 522]);
}, 30_000);
