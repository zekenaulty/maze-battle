import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createInitialParty } from '../../../domain/party/factory';
import { createInitialInventory, createInitialStash } from '../../../domain/items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../../../domain/items/inventoryPolicy';
import type { RosterState } from '../../../domain/party/roster';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { encodeActor } from '../roster/actorValidation';
import { encodeItem } from '../roster/itemValidation';
import { encodeRoster, fields } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import { INITIALIZATION_BOOT_POLICY } from './initializationCapacity';
import { DEFAULT_SETTINGS } from './settings';

export interface InitializationBoot {
  bootPolicy: typeof INITIALIZATION_BOOT_POLICY;
  roster: Required<Pick<RosterState, 'party' | 'inventory' | 'stash' | 'inventoryPolicy'>>;
  settings: typeof DEFAULT_SETTINGS;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Same complete public-row golden as initializationCapacity.writer.test.ts and its bound report.
const policyGolden = '78a38ee21dbbef923e2d77d97cb5ddda319cd0f080fab5d4d37baa2c0c8141b9';

/** Synchronous capture before any initializer await. Write these owned values once;
 * this is a fixed boot contract, not authority for arbitrary roster initialization. */
export function captureInitializationBoot(worldId: string): InitializationBoot {
  check(typeof worldId === 'string' && uuid.test(worldId), 'unsupported initialization world identity');
  const boot: InitializationBoot = structuredClone({
    bootPolicy: INITIALIZATION_BOOT_POLICY,
    roster: { party: createInitialParty(worldId), inventory: createInitialInventory(),
      stash: createInitialStash(), inventoryPolicy: DEFAULT_INVENTORY_POLICY },
    settings: DEFAULT_SETTINGS,
  });
  validateBoot(boot, worldId);
  return boot;
}

function validateBoot({ roster, settings }: InitializationBoot, worldId: string) {
  const { party, inventory, stash, inventoryPolicy } = roster;
  fields(inventory, 'capacity gold items'); fields(stash, 'capacity items');
  check(Array.isArray(party) && party.length === 3 && Array.isArray(inventory.items)
    && inventory.items.length === 3 && Array.isArray(stash.items) && stash.items.length === 0,
  'unsupported initialization roster membership');
  const roles = ['warrior', 'mage', 'healer'];
  const actors = party.map((actor, i) => {
    check(actor.role === roles[i] && actor.id === `${worldId}-${roles[i]}`, 'unsupported initialization actor identity');
    return { ...encodeActor(actor), id: `<actor:${roles[i]}>` };
  });
  const ids = inventory.items.map(item => item.id);
  check(ids.every(id => typeof id === 'string' && uuid.test(id)) && new Set(ids).size === 3,
    'unsupported initialization item identity');
  const items = inventory.items.map(item => ({ ...encodeItem(item), id: `<item:${item.baseId}>` }));

  // Contract projection only, no storage or second factory invocation. Normalize
  // exactly actor.id, party.actorIds, item.id and their primary/index path slots.
  // Every other value remains intact, including strings equal to an identity.
  const rows = [
    { key: 'game/settings', indexes: [], value: settings },
    { key: 'roster/party', indexes: [], value: { schema: 1, actorIds: actors.map(actor => actor.id) } },
    { key: 'roster/pack', indexes: [], value: { schema: 1, capacity: inventory.capacity,
      count: inventory.items.length, nextOrder: 4, gold: inventory.gold } },
    { key: 'roster/stash', indexes: [], value: { schema: 1, capacity: stash.capacity, count: 0, nextOrder: 1 } },
    { key: 'roster/policy', indexes: [], value: { schema: 1, policy: inventoryPolicy } },
    ...actors.map(actor => ({ key: `roster/actor/${actor.id}`, indexes: [], value: { schema: 1, actor } })),
    ...items.map((item, i) => ({ key: `roster/item/${item.id}`,
      indexes: [`roster/items/pack/${String(i + 1).padStart(16, '0')}/${item.id}`],
      value: { schema: 1, item, owner: { kind: 'pack' }, order: i + 1 } })),
  ];
  const encoded = encodeRoster(rows.sort((a, b) => a.key.localeCompare(b.key)));
  jsonBytes(encoded, 16 * 1024);
  check(bytesToHex(sha256(new TextEncoder().encode(canonicalJson(encoded)))) === policyGolden,
    `unsupported initialization boot policy: ${INITIALIZATION_BOOT_POLICY}`);
}
