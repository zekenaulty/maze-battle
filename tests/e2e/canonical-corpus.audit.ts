import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { loadContract, loadAcceptedQuest, loadRoomContent } from '../../src/persistence/canonical/content/records';
import { loadRoster } from '../../src/persistence/canonical/roster/projection';
import { rosterContext } from '../../src/persistence/canonical/game/checkpoint';
import { readTownReturn } from '../../src/persistence/canonical/knowledge/townReturn';
import { corpusLayout } from './canonical-corpus.layout';

/** Privileged, independent test oracle. Never call from a planner or actor projection. */
export async function corpusAudit() {
  const value = (await readCanonical(async (pages, snapshot) => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint), template = corpusLayout('A'), world = [];
    for (const space of template.spaces) world.push((await pages.get('world', `dungeon/1/space/${space.id}`))!.value);
    for (const join of template.joins) world.push((await pages.get('world', `dungeon/1/join/${join.id}`))!.value);
    for (const link of template.connections) world.push((await pages.get('world', `dungeon/1/connection/${link.id}`))!.value);
    const room = await loadRoomContent(pages, 1, 'socket-1:room'), contract = await loadContract(pages, room.contractId!);
    const quest = await loadAcceptedQuest(pages, contract);
    const roster = (await loadRoster(pages, rosterContext(checkpoint))).state;
    const entrance = checkpoint.knowledge ? await readTownReturn(pages, checkpoint) : null;
    return { checkpoint, world, contract, quest, roster, entrance };
  })).value;
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  try {
    const records = await db.getAll('records'), receipts = await db.getAll('receipts');
    return { ...value, head, counts: { records: records.length, receipts: receipts.length,
      knowledge: records.filter(row => row.area === 'knowledge').length },
      receipts };
  } finally { db.close(); }
}
