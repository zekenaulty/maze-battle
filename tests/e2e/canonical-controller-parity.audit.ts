import { readCanonical } from '../../src/persistence/canonical/read';
import { gameCheckpoint, rosterContext } from '../../src/persistence/canonical/game/checkpoint';
import { loadRoster } from '../../src/persistence/canonical/roster/projection';
import { chestKey, contentKey, loadChest, loadContract, loadAcceptedQuest } from '../../src/persistence/canonical/content/records';
import type { earnChest } from './canonical-controller-parity.setup';

/** Independent, bounded effect oracle. Never feeds target selection or controller input. */
export async function audit(setup: Awaited<ReturnType<typeof earnChest>>) {
  const result = await readCanonical(async (pages, snapshot) => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint), roster = (await loadRoster(pages, rosterContext(checkpoint))).state;
    const contracts = [], quests = [], records = [];
    for (const offer of setup.offers) {
      const contract = await loadContract(pages, offer.id);
      contracts.push(contract); quests.push(await loadAcceptedQuest(pages, contract));
      records.push(await pages.get('world', contentKey('contract', offer.id)), await pages.get('world', contentKey('quest', offer.id)));
    }
    records.push(await pages.get('world', chestKey(1, setup.chestId)), await pages.get('world', 'dungeon/1'));
    return { checkpoint, chest: await loadChest(pages, 1, setup.chestId), contracts, quests, records,
      party: roster.party, inventory: roster.inventory, stash: roster.stash, policy: roster.inventoryPolicy };
  });
  return { head: result.head, ...result.value };
}
