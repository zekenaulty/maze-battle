import type { GameView } from '../../../services/game/GameView';
import { readCanonical, snapshotOf, type CanonicalQuery } from '../read';
import type { CanonicalHead, CanonicalSnapshot } from '../types';
import { loadRoster } from '../roster/projection';
import { validateKnowledge } from '../knowledge/evidence';
import { listFloorContracts, listFloorQuests } from '../content/queries';
import { check } from '../validation';
import { gameCheckpoint, rosterContext } from './checkpoint';
import { loadGameSettings } from './settings';

/** UI publication only. Unchanged roster is reused on exploration, never scanned on each step. */
export function projectGame(head: CanonicalHead, previous?: GameView) {
  return readCanonical((pages, snapshot) => projectGameSnapshot(pages, snapshot, previous), { snapshot: snapshotOf(head) });
}

/** Same bounded validation for UI publication and atomic manual-save admission. */
export async function projectGameSnapshot(pages: Pick<CanonicalQuery, 'get' | 'scan' | 'witness'>,
  snapshot: CanonicalSnapshot, previous?: GameView): Promise<GameView> {
  const checkpoint = gameCheckpoint(snapshot.checkpoint);
  const observation = await validateKnowledge(pages, checkpoint.knowledge);
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
}
