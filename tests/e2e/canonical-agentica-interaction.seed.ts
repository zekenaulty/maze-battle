import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/persistence/canonical/game/settings';
import * as content from './canonical-content-fixture';
import * as roster from './canonical-roster-fixture';
import * as knowledge from './canonical-knowledge-fixture';

// Host setup and independent effect oracle, never planner input or token construction.
export async function seedChest() {
  await roster.seed(); await content.prepare();
  await content.work(async tx => { await tx.pages.set('world', SETTINGS_KEY, DEFAULT_SETTINGS); return {}; });
  const target = (await content.targets()).find(t => t.chest && t.contract?.contract.objective === 'fetch');
  if (!target) throw Error('Generated fixture needs a chest with a fetch quest');
  await content.act({ kind: 'accept-quest', contractId: target.room.contractId! });
  await content.place({ level: 1, cell: { spaceId: target.room.spaceId, ...target.chest!.chest.position } });
  await knowledge.act({ kind: 'look' });
}

export async function effects() {
  const targets = await content.targets();
  const quests = (await readCanonical(async pages => {
    const result = [];
    for (const target of targets) if (target.room.contractId) {
      const contract = await content.records.loadContract(pages, target.room.contractId);
      result.push(await content.records.loadAcceptedQuest(pages, contract));
    }
    return result;
  })).value;
  return { checkpoint: (await readCanonicalHead()).head.checkpoint,
    roster: (await roster.read()).value, targets, quests, observation: (await knowledge.current()).value };
}
