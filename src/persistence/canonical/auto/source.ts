import type { GameCheckpoint } from '../game/checkpoint';
import type { WorldRead } from '../world/types';
import { listFloorContracts, listFloorQuests } from '../content/queries';
import { check } from '../validation';
import { AUTO_LIMITS, AutoBlocked } from './types';

export const autoEnabled = (c: Pick<GameCheckpoint, 'mode' | 'townReturnMode'>) => c.mode === 'auto-play' || c.mode === 'town' && c.townReturnMode === 'auto-play';

/** Explicit host Auto guild-board disclosure. Offers never convey geometry or navigable edges. */
export async function readAutoGuild(pages: WorldRead, checkpoint: GameCheckpoint) {
  check(autoEnabled(checkpoint), 'guild Auto source requires enabled Auto');
  const offers = await listFloorContracts(pages, checkpoint.position.level, undefined, AUTO_LIMITS.guild);
  const active = await listFloorQuests(pages, checkpoint.position.level, 'active', undefined, AUTO_LIMITS.guild);
  const completed = await listFloorQuests(pages, checkpoint.position.level, 'complete', undefined, AUTO_LIMITS.guild);
  if (offers.next || active.next || completed.next) throw new AutoBlocked('Guild page limit reached; no offers or objectives were silently omitted.');
  return { offers: offers.contracts, active: active.quests, completed: completed.quests,
    combatRequired: active.quests.some(q => q.task.objective === 'kill') };
}
export type AutoGuild = Awaited<ReturnType<typeof readAutoGuild>>;
