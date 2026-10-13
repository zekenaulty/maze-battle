import type { GameView } from '../../../services/game/GameView';
import { readCanonical, snapshotOf } from '../read';
import type { CanonicalHead } from '../types';
import { loadRoster } from '../roster/projection';
import { validateKnowledge, loadObservation } from '../knowledge/evidence';
import { listFloorContracts, listFloorQuests } from '../content/queries';
import { check } from '../validation';
import { gameCheckpoint, rosterContext } from './checkpoint';
import { loadGameSettings } from './settings';

/** UI publication only. Unchanged roster is reused on exploration, never scanned on each step. */
export function projectGame(head: CanonicalHead, previous?: GameView) {
  return readCanonical(async (pages, snapshot): Promise<GameView> => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint);
    await validateKnowledge(pages, checkpoint.knowledge);
    const observation = checkpoint.knowledge ? await loadObservation(pages,
      { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id }) : null;
    const roster = previous?.id === snapshot.gameId ? previous : (await loadRoster(pages, rosterContext(checkpoint))).state;
    const quests = [];
    for (const status of ['active', 'complete', 'claimed'] as const) {
      const page = await listFloorQuests(pages, checkpoint.position.level, status, undefined, 16);
      check(!page.next, 'current-floor quest display exceeds bounded page'); quests.push(...page.quests);
    }
    // The guild board deliberately discloses offers. Navigation never gets unaccepted targets.
    const offers = checkpoint.mode === 'town' ? await listFloorContracts(pages, checkpoint.position.level, undefined, 16) : null;
    check(!offers?.next, 'guild board exceeds bounded page');
    return { party: roster.party, inventory: roster.inventory, stash: roster.stash, inventoryPolicy: roster.inventoryPolicy,
      ...rosterContext(checkpoint), mode: checkpoint.mode, id: snapshot.gameId, snapshot, checkpoint,
      observation, quests, contracts: offers?.contracts ?? [], ...await loadGameSettings(pages) };
  }, { snapshot: snapshotOf(head) });
}
